//! Scratch project input helpers for downloading shared projects and assembling `.sb3` archives.

// Keep archive writing separate from Scratch API and asset-download logic.
mod archive;
mod cache;
mod scratch;

pub use cache::{cached_scratch_project_id, delete_cached_scratch_project};
pub use scratch::{
    DownloadedScratchProject, download_scratch_project, download_scratch_project_thumbnail,
    get_scratch_project_creator,
};
