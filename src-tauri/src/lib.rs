// The shell only hosts the stub page in a WebView; the page calls nothing in Rust,
// so there are no commands, plugins or capabilities here (Ch 2.1.2).
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .run(tauri::generate_context!())
    .expect("error while running Fluxnook");
}
