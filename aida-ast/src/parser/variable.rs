use serde::Deserialize;
use serde_json::Value;

/// A Scratch variable's initial value and optional cloud-variable flag.
#[derive(Debug, Deserialize)]
#[serde(from = "VariableEntry")]
pub struct ParsedVariable {
    /// The variable's name as shown in Scratch.
    pub name: String,
    /// The initial value, kept as JSON because Scratch values can be numbers or strings.
    pub initial_value: Value,
    /// Whether Scratch synchronizes this variable as a cloud variable.
    pub is_cloud: bool,
}

#[derive(Deserialize)]
#[serde(untagged)]
// Scratch stores variables as [name, value] or [name, value, isCloud].
enum VariableEntry {
    Regular(String, Value),
    Cloud(String, Value, bool),
}

impl From<VariableEntry> for ParsedVariable {
    fn from(entry: VariableEntry) -> Self {
        match entry {
            VariableEntry::Regular(name, value) => Self {
                name,
                initial_value: value,
                is_cloud: false,
            },
            VariableEntry::Cloud(name, value, is_cloud) => Self {
                name,
                initial_value: value,
                is_cloud,
            },
        }
    }
}
