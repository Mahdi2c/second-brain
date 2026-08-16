//! Turn a recording into text.

use tauri::ipc::{InvokeBody, Request};

use crate::speech_to_text;

/// Transcribes one recording and returns what was said.
///
/// The audio arrives as a raw request body rather than as an argument: a few
/// seconds of speech is a hundred thousand samples, and JSON would send each
/// one as digits in an array.
#[tauri::command]
pub async fn transcribe(request: Request<'_>) -> Result<String, String> {
    let InvokeBody::Raw(pcm) = request.body() else {
        return Err("the recording must be sent as raw bytes".to_owned());
    };

    speech_to_text::transcribe(pcm).await
}
