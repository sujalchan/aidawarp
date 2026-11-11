//! Safe operations for Scratch archives stored in AidaWarp's app-data cache.

use std::{fs, io::ErrorKind, path::Path};

fn is_invalid_path_error(error: &std::io::Error) -> bool {
    error.kind() == ErrorKind::InvalidInput || (cfg!(windows) && error.raw_os_error() == Some(123))
}

/// Resolve a recent-project path to a cached Scratch ID only when it belongs to
/// the expected `projects/{id}.sb3` directory. Missing files remain refreshable.
pub fn cached_scratch_project_id(
    project_path: impl AsRef<Path>,
    projects_dir: impl AsRef<Path>,
) -> Result<Option<u64>, String> {
    let projects_dir = match fs::canonicalize(projects_dir.as_ref()) {
        Ok(path) => path,
        Err(error) if error.kind() == ErrorKind::NotFound => return Ok(None),
        Err(error) => {
            return Err(format!(
                "Could not resolve project cache directory: {error}"
            ));
        }
    };
    let project_path = project_path.as_ref();

    let parent = match project_path.parent() {
        Some(parent) => parent,
        None => return Ok(None),
    };
    let canonical_parent = match fs::canonicalize(parent) {
        Ok(path) => path,
        Err(error) if error.kind() == ErrorKind::NotFound => return Ok(None),
        // Recent-project history can outlive or contain malformed paths. Those
        // entries are not eligible for cache operations, but can still be removed
        // from the UI's recent-project list.
        Err(error) if is_invalid_path_error(&error) => return Ok(None),
        Err(error) => return Err(format!("Could not resolve project path: {error}")),
    };
    if canonical_parent != projects_dir {
        return Ok(None);
    }

    let filename = match project_path.file_name().and_then(|name| name.to_str()) {
        Some(filename) => filename,
        None => return Ok(None),
    };
    if !project_path
        .extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| extension.eq_ignore_ascii_case("sb3"))
    {
        return Ok(None);
    }

    let project_id = match project_path
        .file_stem()
        .and_then(|stem| stem.to_str())
        .and_then(|stem| stem.parse::<u64>().ok())
    {
        Some(project_id) => project_id,
        None => return Ok(None),
    };
    let expected_path = projects_dir.join(format!("{project_id}.sb3"));
    if expected_path.file_name().and_then(|name| name.to_str()) != Some(filename) {
        return Ok(None);
    }

    // Reject symlinks so a cached-looking path cannot point outside the cache.
    match fs::canonicalize(project_path) {
        Ok(canonical_path) if canonical_path == expected_path => Ok(Some(project_id)),
        Ok(_) => Ok(None),
        Err(error) if error.kind() == ErrorKind::NotFound => Ok(Some(project_id)),
        Err(error) if is_invalid_path_error(&error) => Ok(None),
        Err(error) => Err(format!("Could not resolve project path: {error}")),
    }
}

/// Delete a cached archive. Paths outside the app-data cache are left untouched.
pub fn delete_cached_scratch_project(
    project_path: impl AsRef<Path>,
    projects_dir: impl AsRef<Path>,
) -> Result<bool, String> {
    let projects_dir = projects_dir.as_ref();
    let Some(project_id) = cached_scratch_project_id(&project_path, projects_dir)? else {
        return Ok(false);
    };

    let canonical_projects_dir = fs::canonicalize(projects_dir)
        .map_err(|error| format!("Could not resolve project cache directory: {error}"))?;
    let cached_path = canonical_projects_dir.join(format!("{project_id}.sb3"));
    match fs::remove_file(cached_path) {
        Ok(()) => Ok(true),
        Err(error) if error.kind() == ErrorKind::NotFound => Ok(false),
        Err(error) => Err(format!("Could not delete cached Scratch project: {error}")),
    }
}
