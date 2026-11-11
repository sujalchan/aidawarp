use serde::Deserialize;
use serde_json::Value;

use super::target::ParsedTarget;

/// Top-level Scratch project data consumed by Aida's translator.
#[derive(Debug, Deserialize)]
pub struct ParsedProject {
    /// The stage and sprites that make up the project.
    pub targets: Vec<ParsedTarget>,

    /// Saved variable/list displays shown over the stage.
    #[serde(default)]
    pub monitors: Vec<Value>,

    /// Scratch extensions used by the project.
    #[serde(default)]
    pub extensions: Vec<String>,

    /// Scratch version and authoring metadata.
    #[serde(default)]
    pub meta: Value,
}

/// Parse the `project.json` bytes extracted from an `.sb3` archive.
pub fn parse_project(json: &[u8]) -> Result<ParsedProject, serde_json::Error> {
    serde_json::from_slice(json)
}
