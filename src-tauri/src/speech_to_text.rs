//! Turns speech into text — a whisper-server running on this machine.
//!
//! Knows nothing about Tauri, and nothing about how the audio was captured.

#[cfg(test)]
mod tests;

const STT_URL: &str = "http://127.0.0.1:8081/inference";

/// Must match `SAMPLE_RATE` in audio/constants.ts, or speech comes back garbled.
pub const SAMPLE_RATE: u32 = 16_000;

/// Wraps raw samples in a WAV header, because that is all whisper-server reads.
///
/// The samples are already in WAV's byte order, so only the 44-byte header is new.
fn wav(pcm: &[u8]) -> Vec<u8> {
    const BITS: u16 = 16;
    const CHANNELS: u16 = 1;
    let block_align = CHANNELS * BITS / 8;

    let mut out = Vec::with_capacity(44 + pcm.len());
    out.extend_from_slice(b"RIFF");
    out.extend_from_slice(&(36 + pcm.len() as u32).to_le_bytes()); // the file bar these first 8 bytes
    out.extend_from_slice(b"WAVE");

    out.extend_from_slice(b"fmt ");
    out.extend_from_slice(&16u32.to_le_bytes()); // the fmt chunk's own length
    out.extend_from_slice(&1u16.to_le_bytes()); // uncompressed
    out.extend_from_slice(&CHANNELS.to_le_bytes());
    out.extend_from_slice(&SAMPLE_RATE.to_le_bytes());
    out.extend_from_slice(&(SAMPLE_RATE * block_align as u32).to_le_bytes());
    out.extend_from_slice(&block_align.to_le_bytes());
    out.extend_from_slice(&BITS.to_le_bytes());

    out.extend_from_slice(b"data");
    out.extend_from_slice(&(pcm.len() as u32).to_le_bytes());
    out.extend_from_slice(pcm);
    out
}

/// Just the words, with Whisper's names for the noises it heard — `[BLANK_AUDIO]`,
/// `(laughs)` — removed, since a recording that sends itself would otherwise ask
/// them as questions. Its occasional `*laughs*` spelling is not covered.
fn words(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    let mut depth = 0usize;

    for c in text.chars() {
        match c {
            '[' | '(' => depth += 1,
            ']' | ')' => depth = depth.saturating_sub(1),
            _ if depth == 0 => out.push(c),
            _ => {}
        }
    }

    // Whisper pads its output with a space, which would otherwise indent every
    // dictated line.
    out.split_whitespace().collect::<Vec<_>>().join(" ")
}

/// What the server heard, from its JSON reply.
fn transcript(json: &str) -> Option<String> {
    let reply: serde_json::Value = serde_json::from_str(json).ok()?;
    Some(words(reply["text"].as_str()?))
}

/// Sends one recording and returns what was said.
///
/// `pcm` is the whole utterance, not a live stream: Whisper reads 30 seconds of
/// context at a time and is markedly worse on fragments.
pub async fn transcribe(pcm: &[u8]) -> Result<String, String> {
    let speech = reqwest::multipart::Part::bytes(wav(pcm))
        .file_name("speech.wav")
        .mime_str("audio/wav")
        .map_err(|e| e.to_string())?;

    let resp = reqwest::Client::new()
        .post(STT_URL)
        .multipart(reqwest::multipart::Form::new().part("file", speech))
        .send()
        .await
        .map_err(|e| format!("could not reach whisper-server: {e}"))?;

    // A rejected recording still returns a body, which would otherwise parse as
    // no text and look like the user had said nothing.
    if !resp.status().is_success() {
        return Err(format!("whisper-server returned {}", resp.status()));
    }

    let body = resp.text().await.map_err(|e| e.to_string())?;
    transcript(&body).ok_or_else(|| format!("could not read the reply: {body}"))
}
