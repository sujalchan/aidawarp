//! Fetches Scratch project data and media before packaging it as a local `.sb3`.

use std::{collections::BTreeSet, path::Path};

use crate::archive::write_sb3_archive;
use futures_util::{StreamExt, TryStreamExt};
use serde::{Deserialize, Serialize};

// Scratch's metadata response includes the token needed by its project-data host.
#[derive(Debug, Deserialize)]
struct ScratchProjectMetadata {
    id: u64,
    title: String,
    project_token: String,
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
    /// Absolute path to the saved `.sb3` archive.
    pub path: String,
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
async fn fetch_project_assets(
    client: &reqwest::Client,
    project_json: &[u8],
) -> Result<Vec<(String, Vec<u8>)>, String> {
    let document: ScratchProjectDocument = serde_json::from_slice(project_json)
        .map_err(|error| format!("Could not read Scratch project assets: {error}"))?;
    // Deduplicate assets because multiple costumes or sounds can share one file.
    let mut filenames = BTreeSet::new();

    for target in document.targets {
        for asset in target.costumes.into_iter().chain(target.sounds) {
            filenames.insert(asset_filename(&asset)?);
        }
    }

    // Bound parallel requests so large projects do not open an unbounded number
    // of connections to Scratch's asset host.
    futures_util::stream::iter(filenames.into_iter().map(|filename| {
        let client = client.clone();
        async move {
            let url = format!("https://assets.scratch.mit.edu/internalapi/asset/{filename}/get/");
            let response = client
                .get(url)
                .send()
                .await
                .map_err(|error| format!("Could not download Scratch asset {filename}: {error}"))?
                .error_for_status()
                .map_err(|error| format!("Could not download Scratch asset {filename}: {error}"))?;
            let bytes = response
                .bytes()
                .await
                .map_err(|error| format!("Could not read Scratch asset {filename}: {error}"))?;
            Ok::<_, String>((filename, bytes.to_vec()))
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
pub async fn download_scratch_project(
    project_id: u64,
    projects_dir: impl AsRef<Path>,
) -> Result<DownloadedScratchProject, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(45))
        .build()
        .map_err(|error| error.to_string())?;

    // Fetch metadata first because Scratch requires its project token to fetch JSON.
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
    if metadata.title.trim().is_empty() {
        return Err("Scratch project has no title".to_string());
    }

    let project_json = client
        .get(format!("https://projects.scratch.mit.edu/{project_id}"))
        .query(&[("token", metadata.project_token.as_str())])
        .send()
        .await
        .map_err(|error| error.to_string())?
        .error_for_status()
        .map_err(|error| error.to_string())?
        .bytes()
        .await
        .map_err(|error| format!("Could not download Scratch project data: {error}"))?;

    // Scratch serves project.json and media separately; include both in the archive.
    let assets = fetch_project_assets(&client, &project_json).await?;
    let archive_path = write_sb3_archive(projects_dir.as_ref(), project_id, &project_json, assets)?;

    Ok(DownloadedScratchProject {
        id: project_id,
        title: metadata.title,
        path: archive_path.to_string_lossy().into_owned(),
    })
}
