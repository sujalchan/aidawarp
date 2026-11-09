use std::time::Duration;

#[derive(serde::Deserialize, serde::Serialize)]
struct ScratchProjectMetadata {
    id: u64,
    title: String,
}

#[tauri::command]
async fn fetch_scratch_project(project_id: String) -> Result<ScratchProjectMetadata, String> {
    project_id
        .parse::<u64>()
        .map_err(|_| "Invalid Scratch project ID".to_string())?;

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(12))
        .build()
        .map_err(|error| error.to_string())?;
    let response = client
        .get(format!("https://api.scratch.mit.edu/projects/{project_id}"))
        .send()
        .await
        .map_err(|error| error.to_string())?
        .error_for_status()
        .map_err(|error| error.to_string())?;
    let project = response
        .json::<ScratchProjectMetadata>()
        .await
        .map_err(|error| error.to_string())?;

    if project.title.trim().is_empty() {
        return Err("Scratch project has no title".to_string());
    }

    Ok(project)
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![fetch_scratch_project])
        .run(tauri::generate_context!())
        .expect("error while running AidaWarp");
}
