//! Cut the assistant off mid-answer.

use crate::turn::Turn;

/// Stops the answer in flight, if any.
///
/// The `ask` it interrupts returns normally, so the frontend needs no separate
/// signal that stopping worked. Harmless when nothing is running, which means
/// the button never has to be guarded against a double press.
#[tauri::command]
pub fn stop(turn: tauri::State<'_, Turn>) {
    turn.stop();
}
