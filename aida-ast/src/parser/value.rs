use serde::Deserialize;

/// A scalar value stored by a Scratch variable or list item.
#[derive(Debug, Clone, PartialEq, Deserialize)]
#[serde(untagged)]
pub enum ScratchValue {
    /// Text value.
    String(String),
    /// Numeric value, whether the JSON uses an integer or decimal form.
    Number(serde_json::Number),
    /// Boolean value.
    Boolean(bool),
}
