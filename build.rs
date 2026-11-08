use std::process::Command;

fn main() {
    println!("cargo:rerun-if-changed=ui/src");
    println!("cargo:rerun-if-changed=ui/index.html");
    println!("cargo:rerun-if-changed=ui/package.json");
    println!("cargo:rerun-if-changed=ui/package-lock.json");
    println!("cargo:rerun-if-changed=ui/vite.config.js");

    let project_root = std::env::var("CARGO_MANIFEST_DIR").expect("Cargo sets the manifest directory");
    let status = Command::new("npm")
        .args(["--prefix", "ui", "run", "build"])
        .current_dir(project_root)
        .status()
        .expect("failed to run the React frontend build; install Node.js and npm");
    assert!(status.success(), "React frontend build failed");

    tauri_build::build()
}
