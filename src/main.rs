use std::path::PathBuf;

use tauri::Manager;

fn project_cache_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|path| path.join("projects"))
        .map_err(|error| format!("Could not find AidaWarp app data directory: {error}"))
}

/// Download a linked Scratch project and save its archive in this app's data folder.
#[tauri::command]
async fn download_scratch_project(
    app: tauri::AppHandle,
    project_id: String,
) -> Result<aida_project::DownloadedScratchProject, String> {
    let project_id = project_id
        .parse::<u64>()
        .map_err(|_| "Invalid Scratch project ID".to_string())?;

    // Store linked projects in app data so AidaWarp can reuse them without
    // placing generated archives in the user's Downloads folder.
    let projects_dir = project_cache_dir(&app)?;

    aida_project::download_scratch_project(project_id, projects_dir).await
}

/// Refresh a cached Scratch project using the ID encoded in its app-data path.
#[tauri::command]
async fn reload_cached_scratch_project(
    app: tauri::AppHandle,
    path: String,
) -> Result<aida_project::DownloadedScratchProject, String> {
    let projects_dir = project_cache_dir(&app)?;
    std::fs::create_dir_all(&projects_dir)
        .map_err(|error| format!("Could not create project cache directory: {error}"))?;
    let project_id = aida_project::cached_scratch_project_id(&path, &projects_dir)?
        .ok_or_else(|| "This project is not a cached Scratch download".to_string())?;

    aida_project::download_scratch_project(project_id, projects_dir).await
}

/// Delete the archive only if its path resolves to AidaWarp's app-data cache.
#[tauri::command]
fn delete_cached_scratch_project(app: tauri::AppHandle, path: String) -> Result<bool, String> {
    let projects_dir = project_cache_dir(&app)?;
    aida_project::delete_cached_scratch_project(path, projects_dir)
}

/// Validate a selected `.sb3` path and return its normalized absolute form.
#[tauri::command]
fn accept_project_file(path: String) -> Result<String, String> {
    let path = PathBuf::from(path);
    if !path.is_file() {
        return Err("Selected project file does not exist".to_string());
    }
    if !path
        .extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| extension.eq_ignore_ascii_case("sb3"))
    {
        return Err("Selected file is not an .sb3 project".to_string());
    }

    // Keep a stable absolute path for recent-project storage and later loading.
    path.canonicalize()
        .map(|canonical_path| canonical_path.to_string_lossy().into_owned())
        .map_err(|error| format!("Could not resolve project file path: {error}"))
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            download_scratch_project,
            reload_cached_scratch_project,
            delete_cached_scratch_project,
            accept_project_file
        ])
        .run(tauri::generate_context!())
        .expect("error while running AidaWarp");
}
