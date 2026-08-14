//! Tests for `language_model.rs`.

use super::{body, drain_tokens, pump, token};

/// Shorthand for one SSE line carrying a content delta.
fn delta(content: &str) -> String {
    format!(
        "data: {}\n",
        serde_json::json!({ "choices": [{ "delta": { "content": content } }] })
    )
}

/// Collects every token `drain_tokens` reports for the given chunks of bytes,
/// which is what arrives off the wire.
fn tokens_from_bytes(chunks: &[&[u8]]) -> (Vec<String>, Vec<u8>) {
    let mut buf = Vec::new();
    let mut got = Vec::new();
    for chunk in chunks {
        buf.extend_from_slice(chunk);
        drain_tokens(&mut buf, &mut |t| got.push(t.to_owned()));
    }
    (got, buf)
}

/// The same, for chunks that split on character boundaries anyway.
fn tokens_from(chunks: &[&str]) -> (Vec<String>, Vec<u8>) {
    let bytes: Vec<&[u8]> = chunks.iter().map(|c| c.as_bytes()).collect();
    tokens_from_bytes(&bytes)
}

mod request {
    use super::body;

    #[test]
    fn asks_the_model_not_to_think() {
        // Without this the model returns thousands of tokens as
        // `reasoning_content` and the app streams nothing at all.
        let b = body("hello");
        assert_eq!(b["chat_template_kwargs"]["enable_thinking"], false);
    }

    #[test]
    fn sends_the_prompt_as_a_streaming_user_message() {
        let b = body("what time is it");
        assert_eq!(b["stream"], true);
        assert_eq!(b["messages"][0]["role"], "user");
        assert_eq!(b["messages"][0]["content"], "what time is it");
    }
}

mod parsing_one_line {
    use super::token;

    #[test]
    fn reads_a_content_delta() {
        let line = r#"data: {"choices":[{"delta":{"content":"hi"}}]}"#;
        assert_eq!(token(line).as_deref(), Some("hi"));
    }

    #[test]
    fn keeps_leading_whitespace_inside_a_token() {
        // Tokens carry their own spacing; trimming them welds words together.
        let line = r#"data: {"choices":[{"delta":{"content":" there"}}]}"#;
        assert_eq!(token(line).as_deref(), Some(" there"));
    }

    #[test]
    fn tolerates_the_trailing_newline_from_the_buffer() {
        let line = "data: {\"choices\":[{\"delta\":{\"content\":\"hi\"}}]}\n";
        assert_eq!(token(line).as_deref(), Some("hi"));
    }

    #[test]
    fn ignores_framing_and_empty_deltas() {
        assert!(token("").is_none());
        assert!(token("data: [DONE]").is_none());
        assert!(token(": keep-alive").is_none());
        assert!(token("data: not json").is_none());
        assert!(token(r#"data: {"choices":[{"delta":{}}]}"#).is_none());
    }

    #[test]
    fn ignores_reasoning_deltas() {
        // `enable_thinking: false` stops these at the source, but a model that
        // ignores the flag must not have its thinking rendered as the answer.
        let line = r#"data: {"choices":[{"delta":{"reasoning_content":"hmm"}}]}"#;
        assert!(token(line).is_none());
    }
}

mod buffering_chunks {
    use super::{delta, tokens_from};

    #[test]
    fn reads_several_events_from_one_chunk() {
        let chunk = format!("{}{}", delta("Hello"), delta(" world"));
        let (got, rest) = tokens_from(&[&chunk]);
        assert_eq!(got, ["Hello", " world"]);
        assert!(rest.is_empty());
    }

    #[test]
    fn joins_an_event_split_across_chunks() {
        // The failure this guards: TCP splits a frame mid-JSON, and parsing
        // per-chunk instead of per-line drops the token silently.
        let line = delta("split");
        let (head, tail) = line.split_at(line.len() / 2);
        let (got, rest) = tokens_from(&[head, tail]);
        assert_eq!(got, ["split"]);
        assert!(rest.is_empty());
    }

    #[test]
    fn joins_an_event_split_across_many_chunks() {
        let line = delta("slow");
        let chunks: Vec<String> = line.chars().map(|c| c.to_string()).collect();
        let refs: Vec<&str> = chunks.iter().map(String::as_str).collect();
        let (got, rest) = tokens_from(&refs);
        assert_eq!(got, ["slow"]);
        assert!(rest.is_empty());
    }

    #[test]
    fn holds_a_partial_line_until_it_is_finished() {
        let (got, rest) = tokens_from(&["data: {\"choices\":[{\"delta\":"]);
        assert!(got.is_empty(), "a half-received event is not a token");
        assert!(!rest.is_empty(), "the tail must survive for the next chunk");
    }

    #[test]
    fn reports_nothing_for_a_stream_that_only_frames() {
        let (got, _) = tokens_from(&["\n", ": keep-alive\n", "data: [DONE]\n"]);
        assert!(got.is_empty());
    }

    #[test]
    fn reassembles_a_whole_answer_in_order() {
        let stream = format!(
            "{}{}{}data: [DONE]\n",
            delta("Hello"),
            delta(","),
            delta(" friend")
        );
        let (got, _) = tokens_from(&[&stream]);
        assert_eq!(got.concat(), "Hello, friend");
    }
}

/// A chunk boundary can fall inside a character, not just between them: `é` is
/// two bytes and an emoji is four. Decoding a chunk before it is complete turns
/// the halves into replacement characters, so the buffer holds bytes and only
/// whole lines are decoded.
mod split_characters {
    use super::{delta, tokens_from_bytes};

    /// Splits `line` at the given byte offset, mid-character.
    fn split_at_byte(line: &str, at: usize) -> (Vec<u8>, Vec<u8>) {
        let (a, b) = line.as_bytes().split_at(at);
        (a.to_vec(), b.to_vec())
    }

    #[test]
    fn joins_a_two_byte_character() {
        let line = delta("café");
        let inside_the_e = line.find('é').expect("test data contains é") + 1;
        let (a, b) = split_at_byte(&line, inside_the_e);

        let (got, _) = tokens_from_bytes(&[&a, &b]);

        assert_eq!(got, ["café"]);
    }

    #[test]
    fn joins_a_four_byte_character() {
        let line = delta("tea ☕");
        let inside_the_emoji = line.find('☕').expect("test data contains ☕") + 2;
        let (a, b) = split_at_byte(&line, inside_the_emoji);

        let (got, _) = tokens_from_bytes(&[&a, &b]);

        assert_eq!(got, ["tea ☕"]);
    }

    #[test]
    fn survives_arriving_one_byte_at_a_time() {
        // The worst case: every multi-byte character is split at every seam.
        let line = delta("héllo ☕ 世界");
        let chunks: Vec<&[u8]> = line.as_bytes().chunks(1).collect();

        let (got, rest) = tokens_from_bytes(&chunks);

        assert_eq!(got, ["héllo ☕ 世界"]);
        assert!(rest.is_empty());
    }

    #[test]
    fn never_reports_a_replacement_character() {
        // The symptom this guards against: "café" arriving as "caf\u{FFFD}\u{FFFD}".
        let line = delta("café ☕");
        for cut in 1..line.len() {
            let (a, b) = split_at_byte(&line, cut);
            let (got, _) = tokens_from_bytes(&[&a, &b]);
            assert!(
                !got.concat().contains('\u{FFFD}'),
                "cutting at byte {cut} produced mojibake: {:?}",
                got.concat()
            );
        }
    }
}

/// Stopping mid-answer, which is what the stop button and (later) talking over
/// the assistant both do. `pump` is the part that can be driven without a
/// server, so cancellation is tested here rather than against the model.
mod cancellation {
    use futures_util::{Stream, stream};
    use tokio_util::sync::CancellationToken;

    use super::{delta, pump};

    /// A stream of chunks that never fails.
    fn chunks(tokens: &[&str]) -> impl Stream<Item = Result<Vec<u8>, String>> + Unpin {
        let lines: Vec<_> = tokens
            .iter()
            .map(|t| Ok(delta(t).into_bytes()))
            .collect();
        stream::iter(lines)
    }

    #[tokio::test]
    async fn reports_every_token_when_nothing_cancels() {
        let mut got = Vec::new();

        pump(chunks(&["Hello", " there"]), &CancellationToken::new(), |t| {
            got.push(t.to_owned())
        })
        .await
        .expect("an uninterrupted stream succeeds");

        assert_eq!(got, ["Hello", " there"]);
    }

    #[tokio::test]
    async fn reports_nothing_when_cancelled_before_it_starts() {
        let cancel = CancellationToken::new();
        cancel.cancel();
        let mut got = Vec::new();

        pump(chunks(&["Hello", " there"]), &cancel, |t| got.push(t.to_owned()))
            .await
            .expect("cancelling is not a failure");

        assert!(got.is_empty(), "a cancelled turn must not emit anything");
    }

    #[tokio::test]
    async fn stops_as_soon_as_it_is_cancelled_mid_stream() {
        let cancel = CancellationToken::new();
        let mut got = Vec::new();

        // Cancel from inside the callback: the moment the first token lands,
        // the rest of the answer must be abandoned.
        pump(chunks(&["one", "two", "three"]), &cancel, |t| {
            got.push(t.to_owned());
            cancel.cancel();
        })
        .await
        .expect("cancelling is not a failure");

        assert_eq!(got, ["one"], "tokens kept arriving after the stop");
    }

    #[tokio::test]
    async fn surfaces_a_broken_chunk_as_an_error() {
        let broken = stream::iter(vec![Err("connection reset".to_owned())]);

        let result = pump(broken, &CancellationToken::new(), |_| {}).await;

        assert!(result.is_err(), "a transport failure must not look like a clean end");
    }
}
