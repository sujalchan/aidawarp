//! Runtime support for Aida's standalone and embedded project views.

/// Logical Scratch stage width shared by the runtime targets.
pub const STAGE_WIDTH: u32 = 480;
/// Logical Scratch stage height shared by the runtime targets.
pub const STAGE_HEIGHT: u32 = 360;

/// Where a project runtime is hosted.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum RuntimeTarget {
    /// A standalone native window created with `winit` and drawn with `wgpu`.
    Winit,
    /// The project stage hosted inside AidaWarp's existing project view.
    Embedded,
}
