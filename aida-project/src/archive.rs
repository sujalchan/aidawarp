//! Writes project JSON and downloaded media to a Scratch-compatible `.sb3` ZIP.

use std::{
    fs::{self, File},
    io::Write,
    path::{Path, PathBuf},
    sync::atomic::{AtomicU64, Ordering},
};

use zip::{CompressionMethod, ZipWriter, write::SimpleFileOptions};

/// Save project JSON and each referenced asset as root-level ZIP entries.
pub(super) fn write_sb3_archive(
    projects_dir: &Path,
    project_id: u64,
    project_json: &[u8],
    assets: Vec<(String, Vec<u8>)>,
) -> Result<PathBuf, String> {
    static TEMP_FILE_COUNTER: AtomicU64 = AtomicU64::new(0);

    fs::create_dir_all(projects_dir)
        .map_err(|error| format!("Could not create projects directory: {error}"))?;

    let counter = TEMP_FILE_COUNTER.fetch_add(1, Ordering::Relaxed);
    // Write to a unique temporary file so an interrupted save cannot leave a
    // partial archive at the final project path.
    let temporary_path = projects_dir.join(format!(
        ".{project_id}-{}-{counter}.sb3.tmp",
        std::process::id()
    ));
    let output_path = projects_dir.join(format!("{project_id}.sb3"));

    let write_result = (|| -> Result<(), String> {
        let file = File::create(&temporary_path)
            .map_err(|error| format!("Could not create Scratch project archive: {error}"))?;
        let mut archive = ZipWriter::new(file);
        let options = SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);

        // Scratch expects project.json and referenced assets at the archive root.
        archive
            .start_file("project.json", options)
            .map_err(|error| format!("Could not add project.json to archive: {error}"))?;
        archive
            .write_all(project_json)
            .map_err(|error| format!("Could not write project.json to archive: {error}"))?;

        for (filename, bytes) in assets {
            archive
                .start_file(filename, options)
                .map_err(|error| format!("Could not add asset to archive: {error}"))?;
            archive
                .write_all(&bytes)
                .map_err(|error| format!("Could not write asset to archive: {error}"))?;
        }

        let file = archive
            .finish()
            .map_err(|error| format!("Could not finish Scratch project archive: {error}"))?;
        file.sync_all()
            .map_err(|error| format!("Could not save Scratch project archive: {error}"))?;
        Ok(())
    })();

    if let Err(error) = write_result {
        let _ = fs::remove_file(&temporary_path);
        return Err(error);
    }

    // Replace an older cached archive only after the new one has finished writing.
    if output_path.exists() {
        fs::remove_file(&output_path)
            .map_err(|error| format!("Could not replace existing project archive: {error}"))?;
    }
    fs::rename(&temporary_path, &output_path)
        .map_err(|error| format!("Could not save Scratch project archive: {error}"))?;

    Ok(output_path)
}
