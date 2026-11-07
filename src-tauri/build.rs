fn main() {
  // 16 KB pages (Ch 2.1.2, the Raccoon's S1): Android 15 and later run on devices
  // with 16 KB memory pages, and a library linked at 4 KB alignment can't load on
  // one. A link arg from the build script is added to whatever Tauri's own
  // CARGO_TARGET_*_RUSTFLAGS hold; a .cargo/config.toml flag was not, and built a
  // 4 KB library. build.yml reads the built library's alignment on every apk.
  if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("android") {
    println!("cargo:rustc-link-arg=-Wl,-z,max-page-size=16384");
  }
  tauri_build::build()
}
