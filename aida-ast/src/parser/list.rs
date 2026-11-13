use serde::Deserialize;

use crate::parser::ScratchValue;

/// A Scratch list's display name and initial contents.
///
/// In `project.json`, each list is stored as `[name, [items...]]`; the serde
/// conversion below turns that tuple-shaped entry into these named fields.
#[derive(Debug, Deserialize)]
#[serde(from = "ListEntry")]
pub struct ParsedList {
    /// The list's name as shown in Scratch.
    pub name: String,
    /// The initial items, each represented as a typed Scratch scalar.
    pub items: Vec<ScratchValue>,
}

/// Tuple-shaped list entry used by Scratch's `project.json` format.
#[derive(Deserialize)]
struct ListEntry(String, Vec<ScratchValue>);

/// Convert Scratch's serialized tuple into the named AST fields.
impl From<ListEntry> for ParsedList {
    fn from(ListEntry(name, items): ListEntry) -> Self {
        Self { name, items }
    }
}
