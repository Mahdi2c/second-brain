//! Talks to the language model — a llama-server running on this machine.
//!
//! Deliberately knows nothing about Tauri: it streams tokens and hands each one
//! to a callback, so the transport can be tested and reused without a window.

use std::time::Duration;

use futures_util::{Stream, StreamExt};
use tokio_util::sync::CancellationToken;

#[cfg(test)]
mod tests;

const LLM_URL: &str = "http://127.0.0.1:8080/v1/chat/completions";

/// How long to wait for the *next* piece of the answer before giving up.
///
/// Not a limit on the whole answer — during generation tokens arrive every few
/// milliseconds, so this only fires when the server has gone quiet. It is
/// generous because the first chunk is the slow one: the prompt has to be
/// processed first, and on a cold GPU the kernels are compiled on the way.
const READ_TIMEOUT: Duration = Duration::from_secs(60);

fn body(text: &str) -> serde_json::Value {
    serde_json::json!({
        "model": "local",
        "stream": true,
        "messages": [{ "role": "user", "content": text }],
        // Reasoning off at the template level. Without this the model
        // deliberates for thousands of tokens and returns them as
        // `reasoning_content`, leaving `content` empty — the app streams
        // nothing and looks mute. Ignored by templates that don't declare
        // the flag, so it is safe across models.
        "chat_template_kwargs": { "enable_thinking": false },
    })
}

/// The answer token carried by one SSE line, if it carries one. Comments,
/// blank lines, the `[DONE]` sentinel and non-content deltas yield nothing.
fn token(line: &str) -> Option<String> {
    let data = line.trim().strip_prefix("data: ")?;
    if data == "[DONE]" {
        return None;
    }
    let v: serde_json::Value = serde_json::from_str(data).ok()?;
    v["choices"][0]["delta"]["content"]
        .as_str()
        .map(str::to_owned)
}

/// Pulls every complete line out of `buf` and reports the tokens they carry.
///
/// A chunk is not a line: an SSE event can be split across chunks, so a partial
/// tail is left in the buffer to be finished by whatever arrives next.
///
/// The buffer holds bytes rather than text because a chunk can also end inside
/// a character — `é` is two bytes, an emoji four. Decoding a chunk on its own
/// would turn the halves into replacement characters, so text is only decoded
/// once a whole line is in hand.
fn drain_tokens(buf: &mut Vec<u8>, on_token: &mut impl FnMut(&str)) {
    while let Some(i) = buf.iter().position(|&b| b == b'\n') {
        let line: Vec<u8> = buf.drain(..=i).collect();
        if let Some(t) = token(&String::from_utf8_lossy(&line)) {
            on_token(&t);
        }
    }
}

/// Reads chunks until they run out or `cancel` fires, reporting tokens as they
/// complete.
///
/// Split out from [`stream`] so it can be driven without a server: it takes the
/// chunks rather than fetching them.
///
/// Cancelling is a normal ending, not a failure — the user asked it to stop.
/// The `select!` races the token against the next chunk, so a stop lands
/// immediately even when the server has gone quiet mid-answer.
async fn pump(
    mut chunks: impl Stream<Item = Result<Vec<u8>, String>> + Unpin,
    cancel: &CancellationToken,
    mut on_token: impl FnMut(&str),
) -> Result<(), String> {
    let mut buf: Vec<u8> = Vec::new();

    loop {
        let chunk = tokio::select! {
            biased;
            _ = cancel.cancelled() => return Ok(()),
            chunk = chunks.next() => chunk,
        };

        let Some(chunk) = chunk else { return Ok(()) };
        buf.extend_from_slice(&chunk?);
        drain_tokens(&mut buf, &mut on_token);
    }
}

/// Sends `text` and calls `on_token` with each token as it arrives, until the
/// answer ends or `cancel` fires.
///
/// Dropping the response on cancel closes the connection, which is what makes
/// llama-server stop generating. Merely ignoring the tokens would leave it busy
/// — and with `--parallel 1` that blocks the next question.
pub async fn stream(
    text: &str,
    cancel: &CancellationToken,
    on_token: impl FnMut(&str),
) -> Result<(), String> {
    let client = reqwest::Client::builder()
        .read_timeout(READ_TIMEOUT)
        .build()
        .map_err(|e| e.to_string())?;

    let resp = client
        .post(LLM_URL)
        .json(&body(text))
        .send()
        .await
        .map_err(|e| format!("could not reach llama-server: {e}"))?;

    // A rejected request still returns a body, which would otherwise stream as
    // zero tokens and look like the model simply had nothing to say.
    if !resp.status().is_success() {
        return Err(format!("llama-server returned {}", resp.status()));
    }

    let chunks = resp.bytes_stream().map(|c| {
        c.map(|b| b.to_vec()).map_err(|e| {
            // The raw timeout error talks about connections and bodies, which
            // says nothing to whoever is looking at the window.
            if e.is_timeout() {
                "the model stopped responding".to_owned()
            } else {
                e.to_string()
            }
        })
    });

    pump(Box::pin(chunks), cancel, on_token).await
}
