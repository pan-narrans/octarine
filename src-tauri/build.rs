fn main() {
    println!("cargo:rerun-if-env-changed=OCTARINE_DISTRIBUTION");
    tauri_build::build();
}
