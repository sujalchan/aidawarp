//! Fetches Scratch project data and media before packaging it as a local `.sb3`.

use std::{
    collections::BTreeSet,
    path::Path,
    sync::{Arc, Mutex},
};

use crate::archive::write_sb3_archive;
use futures_util::{StreamExt, TryStreamExt};
use serde::{Deserialize, Serialize};

// Scratch's metadata response includes the token needed by its project-data host.
#[derive(Debug, Deserialize)]
struct ScratchProjectMetadata {
    id: u64,
    title: String,
    project_token: String,
    #[serde(default)]
    author: Option<ScratchProjectAuthor>,
}

#[derive(Debug, Deserialize)]
struct ScratchProjectAuthor {
    #[serde(default)]
    username: Option<String>,
}

#[derive(Debug, Deserialize, Default)]
struct ScratchProjectDocument {
    #[serde(default)]
    targets: Vec<ScratchTargetAssets>,
}

#[derive(Debug, Deserialize, Default)]
struct ScratchTargetAssets {
    #[serde(default)]
    costumes: Vec<ScratchAsset>,
    #[serde(default)]
    sounds: Vec<ScratchAsset>,
}

#[derive(Debug, Deserialize)]
struct ScratchAsset {
    #[serde(rename = "assetId")]
    asset_id: Option<String>,
    #[serde(rename = "dataFormat")]
    data_format: Option<String>,
    md5ext: Option<String>,
}

/// Identifies the downloaded project and the archive saved on this device.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadedScratchProject {
    /// Numeric Scratch project ID.
    pub id: u64,
    /// User-visible project title from Scratch metadata.
    pub title: String,
    /// Scratch account name that created the project, when the API provides it.
    pub creator: Option<String>,
    /// Absolute path to the saved `.sb3` archive.
    pub path: String,
}

/// Create the HTTP client used for Scratch API requests.
fn scratch_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(45))
        .build()
        .map_err(|error| error.to_string())
}

struct ProgressReporter<F> {
    callback: F,
    last_percent: Mutex<u8>,
}

impl<F: Fn(u8)> ProgressReporter<F> {
    fn report(&self, percent: u8) {
        let mut last_percent = self
            .last_percent
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        let percent = percent.min(100);
        if percent > *last_percent {
            *last_percent = percent;
            (self.callback)(percent);
        }
    }
}

async fn read_response_body<F>(
    response: reqwest::Response,
    progress_start: u8,
    progress_end: u8,
    progress: &ProgressReporter<F>,
) -> Result<Vec<u8>, reqwest::Error>
where
    F: Fn(u8),
{
    let total_bytes = response.content_length().filter(|total| *total > 0);
    let mut downloaded_bytes = 0u64;
    let mut body = Vec::new();
    let mut chunks = response.bytes_stream();

    while let Some(chunk) = chunks.next().await {
        let chunk = chunk?;
        downloaded_bytes = downloaded_bytes.saturating_add(chunk.len() as u64);
        body.extend_from_slice(&chunk);

        if let Some(total_bytes) = total_bytes {
            let progress_range = u64::from(progress_end - progress_start);
            let progressed = downloaded_bytes
                .saturating_mul(progress_range)
                .checked_div(total_bytes)
                .unwrap_or(progress_range)
                .min(progress_range);
            progress.report(progress_start + progressed as u8);
        }
    }

    progress.report(progress_end);
    Ok(body)
}

/// Fetch and validate public metadata for a Scratch project.
async fn fetch_project_metadata(
    client: &reqwest::Client,
    project_id: u64,
) -> Result<ScratchProjectMetadata, String> {
    let metadata = client
        .get(format!("https://api.scratch.mit.edu/projects/{project_id}"))
        .send()
        .await
        .map_err(|error| error.to_string())?
        .error_for_status()
        .map_err(|error| error.to_string())?
        .json::<ScratchProjectMetadata>()
        .await
        .map_err(|error| format!("Could not load Scratch project details: {error}"))?;

    if metadata.id != project_id {
        return Err("Scratch returned metadata for a different project".to_string());
    }

    Ok(metadata)
}

/// Look up the creator name for a previously cached Scratch project.
pub async fn get_scratch_project_creator(project_id: u64) -> Result<Option<String>, String> {
    let client = scratch_client()?;
    let metadata = fetch_project_metadata(&client, project_id).await?;

    Ok(metadata
        .author
        .and_then(|author| author.username)
        .map(|username| username.trim().to_string())
        .filter(|username| !username.is_empty()))
}

/// Fetch a Scratch thumbnail so the UI can derive a depth map from its pixels.
pub async fn download_scratch_project_thumbnail(project_id: u64) -> Result<Vec<u8>, String> {
    let client = scratch_client()?;
    let response = client
        .get(format!(
            "https://cdn2.scratch.mit.edu/get_image/project/{project_id}_480x360.png"
        ))
        .send()
        .await
        .map_err(|error| format!("Could not fetch the Scratch thumbnail: {error}"))?
        .error_for_status()
        .map_err(|error| format!("Could not fetch the Scratch thumbnail: {error}"))?;
    let bytes = response
        .bytes()
        .await
        .map_err(|error| format!("Could not read the Scratch thumbnail: {error}"))?;

    if bytes.is_empty() {
        return Err("Scratch returned an empty project thumbnail".to_string());
    }

    Ok(bytes.to_vec())
}

/// Resolve Scratch's archive filename and reject paths that could escape its root.
fn asset_filename(asset: &ScratchAsset) -> Result<String, String> {
    let filename = match &asset.md5ext {
        Some(filename) => filename.clone(),
        None => {
            let asset_id = asset.asset_id.as_deref().ok_or_else(|| {
                "Scratch project contains an asset without an asset ID".to_string()
            })?;
            let data_format = asset.data_format.as_deref().ok_or_else(|| {
                "Scratch project contains an asset without a data format".to_string()
            })?;
            format!("{asset_id}.{data_format}")
        }
    };

    if filename.is_empty()
        || filename == "."
        || filename == ".."
        || !filename
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'.' | b'_' | b'-'))
    {
        return Err("Scratch project contains an invalid asset filename".to_string());
    }

    Ok(filename)
}

/// Fetch every distinct costume and sound referenced in the project JSON.
struct AssetProgress {
    complete: Vec<bool>,
    downloaded_bytes: Vec<u64>,
    total_bytes: Vec<Option<u64>>,
}

fn report_asset_progress<F>(
    asset_progress: &Mutex<AssetProgress>,
    asset_count: usize,
    progress: &ProgressReporter<F>,
) where
    F: Fn(u8),
{
    let completed_fraction = {
        let state = asset_progress
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        state
            .complete
            .iter()
            .enumerate()
            .map(|(index, complete)| {
                if *complete {
                    1.0
                } else if let Some(total_bytes) = state.total_bytes[index] {
                    if total_bytes == 0 {
                        0.0
                    } else {
                        (state.downloaded_bytes[index] as f64 / total_bytes as f64).min(1.0)
                    }
                } else {
                    0.0
                }
            })
            .sum::<f64>()
            / asset_count as f64
    };

    progress.report(15 + (84.0 * completed_fraction).floor() as u8);
}

async fn fetch_project_assets<F>(
    client: &reqwest::Client,
    project_json: &[u8],
    progress: Arc<ProgressReporter<F>>,
) -> Result<Vec<(String, Vec<u8>)>, String>
where
    F: Fn(u8) + Send + Sync + 'static,
{
    let document: ScratchProjectDocument = serde_json::from_slice(project_json)
        .map_err(|error| format!("Could not read Scratch project assets: {error}"))?;
    // Deduplicate assets because multiple costumes or sounds can share one file.
    let mut filenames = BTreeSet::new();

    for target in document.targets {
        for asset in target.costumes.into_iter().chain(target.sounds) {
            filenames.insert(asset_filename(&asset)?);
        }
    }

    let asset_count = filenames.len();
    if asset_count == 0 {
        progress.report(99);
        return Ok(Vec::new());
    }

    let asset_progress = Arc::new(Mutex::new(AssetProgress {
        complete: vec![false; asset_count],
        downloaded_bytes: vec![0; asset_count],
        total_bytes: vec![None; asset_count],
    }));

    // Bound parallel requests so large projects do not open an unbounded number
    // of connections to Scratch's asset host.
    futures_util::stream::iter(filenames.into_iter().enumerate().map(|(index, filename)| {
        let client = client.clone();
        let progress = Arc::clone(&progress);
        let asset_progress = Arc::clone(&asset_progress);
        async move {
            let url = format!("https://assets.scratch.mit.edu/internalapi/asset/{filename}/get/");
            let response = client
                .get(url)
                .send()
                .await
                .map_err(|error| format!("Could not download Scratch asset {filename}: {error}"))?
                .error_for_status()
                .map_err(|error| format!("Could not download Scratch asset {filename}: {error}"))?;
            let total_bytes = response.content_length();
            {
                let mut state = asset_progress
                    .lock()
                    .unwrap_or_else(std::sync::PoisonError::into_inner);
                state.total_bytes[index] = total_bytes;
            }
            report_asset_progress(&asset_progress, asset_count, &progress);

            let mut downloaded_bytes = 0u64;
            let mut bytes = Vec::new();
            let mut chunks = response.bytes_stream();
            while let Some(chunk) = chunks.next().await {
                let chunk = chunk
                    .map_err(|error| format!("Could not read Scratch asset {filename}: {error}"))?;
                downloaded_bytes = downloaded_bytes.saturating_add(chunk.len() as u64);
                bytes.extend_from_slice(&chunk);
                {
                    let mut state = asset_progress
                        .lock()
                        .unwrap_or_else(std::sync::PoisonError::into_inner);
                    state.downloaded_bytes[index] = downloaded_bytes;
                }
                report_asset_progress(&asset_progress, asset_count, &progress);
            }

            {
                let mut state = asset_progress
                    .lock()
                    .unwrap_or_else(std::sync::PoisonError::into_inner);
                state.complete[index] = true;
            }
            report_asset_progress(&asset_progress, asset_count, &progress);
            Ok::<_, String>((filename, bytes))
        }
    }))
    .buffer_unordered(8)
    .try_collect()
    .await
}

/// Download a shared Scratch project and save its JSON and media as an `.sb3`.
///
/// `projects_dir` is supplied by the Tauri host so this crate stays independent
/// of platform-specific app-data path resolution.
pub async fn download_scratch_project<F>(
    project_id: u64,
    projects_dir: impl AsRef<Path>,
    on_progress: F,
) -> Result<DownloadedScratchProject, String>
where
    F: Fn(u8) + Send + Sync + 'static,
{
    let progress = Arc::new(ProgressReporter {
        callback: on_progress,
        last_percent: Mutex::new(0),
    });
    progress.report(1);
    let client = scratch_client()?;

    // Fetch metadata first because Scratch requires its project token to fetch JSON.
    let metadata = fetch_project_metadata(&client, project_id).await?;
    progress.report(5);
    if metadata.title.trim().is_empty() {
        return Err("Scratch project has no title".to_string());
    }

    let project_response = client
        .get(format!("https://projects.scratch.mit.edu/{project_id}"))
        .query(&[("token", metadata.project_token.as_str())])
        .send()
        .await
        .map_err(|error| error.to_string())?
        .error_for_status()
        .map_err(|error| error.to_string())?;
    let project_json = read_response_body(project_response, 5, 15, progress.as_ref())
        .await
        .map_err(|error| format!("Could not download Scratch project data: {error}"))?;

    // Scratch serves project.json and media separately; include both in the archive.
    let assets = fetch_project_assets(&client, &project_json, Arc::clone(&progress)).await?;
    let archive_path = write_sb3_archive(projects_dir.as_ref(), project_id, &project_json, assets)?;
    progress.report(100);
    let creator = metadata
        .author
        .and_then(|author| author.username)
        .map(|username| username.trim().to_string())
        .filter(|username| !username.is_empty());

    Ok(DownloadedScratchProject {
        id: project_id,
        title: metadata.title,
        creator,
        path: archive_path.to_string_lossy().into_owned(),
    })
}
