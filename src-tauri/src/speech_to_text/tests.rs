//! Tests for `speech_to_text.rs`.

use super::{SAMPLE_RATE, transcript, wav};

/// Whisper only reads WAV, and a header that disagrees with the recording is
/// not rejected — it is transcribed at the wrong speed and comes back garbled.
mod framing {
    use super::{SAMPLE_RATE, wav};

    fn number(bytes: &[u8]) -> u32 {
        u32::from_le_bytes(bytes.try_into().expect("four bytes"))
    }

    fn samples(count: usize) -> Vec<u8> {
        (0..count * 2).map(|i| i as u8).collect()
    }

    #[test]
    fn announces_itself_as_a_wav_file() {
        let out = wav(&samples(8));
        assert_eq!(&out[0..4], b"RIFF");
        assert_eq!(&out[8..12], b"WAVE");
    }

    #[test]
    fn describes_the_audio_the_recorder_actually_captured() {
        let out = wav(&samples(8));
        assert_eq!(number(&out[16..20]), 16, "fmt chunk describes plain PCM");
        assert_eq!(u16::from_le_bytes([out[20], out[21]]), 1, "uncompressed");
        assert_eq!(u16::from_le_bytes([out[22], out[23]]), 1, "mono");
        assert_eq!(number(&out[24..28]), SAMPLE_RATE);
        assert_eq!(number(&out[28..32]), SAMPLE_RATE * 2, "bytes per second");
        assert_eq!(u16::from_le_bytes([out[32], out[33]]), 2, "bytes per sample");
        assert_eq!(u16::from_le_bytes([out[34], out[35]]), 16, "16-bit samples");
    }

    #[test]
    fn declares_the_length_of_the_recording() {
        let pcm = samples(100);
        let out = wav(&pcm);

        assert_eq!(&out[36..40], b"data");
        assert_eq!(number(&out[40..44]), pcm.len() as u32);
        assert_eq!(number(&out[4..8]), (out.len() - 8) as u32);
    }

    #[test]
    fn passes_the_samples_through_unchanged() {
        let pcm = samples(50);
        let out = wav(&pcm);
        assert_eq!(&out[44..], &pcm[..]);
    }

    #[test]
    fn frames_a_recording_with_nothing_in_it() {
        // Pressing the button twice in a row records no samples at all.
        let out = wav(&[]);
        assert_eq!(out.len(), 44, "header only");
        assert_eq!(number(&out[40..44]), 0);
    }
}

/// Reading the answer back. A parse that quietly yields nothing looks exactly
/// like the user having said nothing.
mod reading_the_reply {
    use super::transcript;

    #[test]
    fn reads_what_was_said() {
        let said = transcript(r#"{"text":"remind me to call Sarah"}"#);
        assert_eq!(said.as_deref(), Some("remind me to call Sarah"));
    }

    #[test]
    fn trims_the_leading_space_whisper_adds() {
        let said = transcript(r#"{"text":" hello there"}"#);
        assert_eq!(said.as_deref(), Some("hello there"));
    }

    #[test]
    fn reports_nothing_for_a_reply_it_cannot_read() {
        assert!(transcript("").is_none());
        assert!(transcript("not json").is_none());
        assert!(transcript(r#"{"error":"failed to load model"}"#).is_none());
    }
}
