//! Typed representations for Scratch's top-level project, targets, and variables.

pub mod project;
pub mod target;
pub mod variable;

pub use project::{ParsedProject, parse_project};
pub use target::ParsedTarget;
pub use variable::ParsedVariable;
