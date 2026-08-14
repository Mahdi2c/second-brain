//! Ask the model a question.

use tauri::ipc::Channel;

use crate::{language_model, turn::Turn};

/// Streams an answer back through `on_token`, one token per message.
///
/// A channel rather than an event: it is ordered and made for streaming, and
/// because the frontend creates a fresh one per question, tokens from an
/// abandoned answer cannot land in the next one.
///
/// Returns when the answer is finished *or* stopped — stopping is not an error,
/// so the frontend sees a normal completion either way.
///
/// One prompt in, one answer out — no conversation history yet, so the model
/// sees each question on its own.
#[tauri::command]
pub async fn ask(
    turn: tauri::State<'_, Turn>,
    text: String,
    on_token: Channel<String>,
) -> Result<(), String> {
    let cancel = turn.start();

    language_model::stream(&text, &cancel, |t| {
        on_token.send(t.to_owned()).ok();
    })
    .await
}
