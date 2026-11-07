// Prevents an extra console window on Windows in release; Tauri's template says not to remove it.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
  fluxnook_lib::run();
}
