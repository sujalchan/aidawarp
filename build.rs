use std::{
    path::Path,
    process::{Command, ExitStatus},
};

fn run_npm(project_root: &str, args: &[&str]) -> std::io::Result<ExitStatus> {
    #[cfg(windows)]
    {
        let mut command = Command::new("cmd");
        command.arg("/C").arg("npm").args(args);
        command.current_dir(project_root).status()
    }

    #[cfg(not(windows))]
    {
        Command::new("npm")
            .args(args)
            .current_dir(project_root)
            .status()
    }
}

fn main() {
    println!("cargo:rerun-if-changed=tauri.macos.conf.json");
    println!("cargo:rerun-if-changed=ui/src");
    println!("cargo:rerun-if-changed=ui/index.html");
    println!("cargo:rerun-if-changed=ui/package.json");
    println!("cargo:rerun-if-changed=ui/package-lock.json");
    println!("cargo:rerun-if-changed=ui/vite.config.js");
    println!("cargo:rerun-if-changed=ui/node_modules/vite/package.json");

    let project_root =
        std::env::var("CARGO_MANIFEST_DIR").expect("Cargo sets the manifest directory");
    // A fresh checkout has no node_modules directory. Install the exact
    // package-lock.json dependencies so `cargo run` works without a separate
    // frontend setup step.
    if !Path::new(&project_root)
        .join("ui/node_modules/vite")
        .is_dir()
    {
        let status = run_npm(&project_root, &["--prefix", "ui", "ci"])
            .expect("failed to install the React frontend dependencies; install Node.js and npm");
        assert!(
            status.success(),
            "React frontend dependency installation failed"
        );
    }

    let status = run_npm(&project_root, &["--prefix", "ui", "run", "build"])
        .expect("failed to run the React frontend build; install Node.js and npm");
    assert!(status.success(), "React frontend build failed");

    tauri_build::build()
}
