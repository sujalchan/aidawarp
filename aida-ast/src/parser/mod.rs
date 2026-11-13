//! Typed representations for Scratch's project, targets, variables, lists, and values.

pub mod list;
pub mod project;
pub mod target;
pub mod value;
pub mod variable;

pub use list::ParsedList;
pub use project::{ParsedProject, parse_project};
pub use target::ParsedTarget;
pub use value::ScratchValue;
pub use variable::ParsedVariable;
