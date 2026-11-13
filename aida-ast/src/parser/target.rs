use std::collections::HashMap;

use serde::Deserialize;
use serde_json::Value;

use crate::parser::{ParsedList, ParsedVariable};

/// A Scratch stage or sprite and the code and data attached to that target.
#[derive(Debug, Deserialize)]
pub struct ParsedTarget {
    /// Scratch's visible name for the stage or sprite.
    pub name: String,

    /// Distinguishes the stage target from sprite targets.
    #[serde(rename = "isStage")]
    pub is_stage: bool,

    /// Variables keyed by Scratch's internal variable IDs.
    #[serde(default)]
    pub variables: HashMap<String, ParsedVariable>,

    /// Lists keyed by Scratch's internal list IDs.
    #[serde(default)]
    pub lists: HashMap<String, ParsedList>,

    /// Broadcast IDs mapped to their visible names.
    #[serde(default)]
    pub broadcasts: HashMap<String, String>,

    /// Block data keyed by Scratch's internal block IDs.
    #[serde(default)]
    pub blocks: HashMap<String, Value>,

    /// Other target fields retained so the parser can accept evolving project data.
    #[serde(flatten)]
    pub extra: HashMap<String, Value>,
}
