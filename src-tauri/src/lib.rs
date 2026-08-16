mod commands;
mod language_model;
mod speech_to_text;
mod turn;

use commands::{ask::ask, stop::stop, transcribe::transcribe};
use turn::Turn;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(Turn::default())
        .invoke_handler(tauri::generate_handler![ask, stop, transcribe])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
