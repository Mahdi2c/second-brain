# A dedicated spotter hears the wake word, not Whisper

Whisper is already running, already transcribes speech, and could have detected
"hey winston" by reading its own output — so the obvious question a reader will
ask is why there is a second, much smaller speech model in the app at all. The
answer is latency, and it only became decisive once we settled that the wake
phrase is said on its own: `HANG` in `silence.ts` requires two full seconds of
silence before an utterance is even considered finished, and only then does it
go to Whisper. The acknowledgement would land around two and a half seconds
after you spoke. A spotter answers in about a tenth of that, because it scores
80 ms frames as they arrive and never waits for silence at all.

So: **openWakeWord**, three small ONNX graphs (mel-spectrogram → embedding →
classifier), run by `onnxruntime-web` inside the webview.

## Considered options

**Transcribe-and-match** — send every utterance to the whisper-server we
already run and look for the name in the text. This was the recommendation
until the interaction shape changed, and it is worth recording why it was
right and then wasn't. If the wake phrase and the question are one breath —
"hey winston, what's the weather" — the utterance has to be captured and
transcribed anyway, so detecting the wake word costs a string comparison on
text you already have, and no new model, process or dependency enters the
project. It was the two-breath decision that killed it, not any property of
the mechanism. If the interaction is ever revisited, so should this be.

**A spotter in Rust**, via the `ort` crate. Same model, same speed —
ONNX Runtime is the same C++ underneath — but it needs a native audio
dependency for the microphone, replaces capture code that already works, and
streams raw frames across IPC continuously rather than once per question. It
buys nothing. Note that an earlier version of `CONTEXT.md` predicted the
opposite, that a wake word "will move the microphone into Rust". That
prediction has been removed.

**microWakeWord** is Apache-2.0 end to end with no Google dependency
underneath it, which is a materially cleaner licence story than what we chose
(see below). It lost on the runtime: its models are TFLite, carry streaming
state internally, and are built for ESP32 microcontrollers, and TFLite in a
browser is meaningfully worse supported than ONNX. If the licence chain below
ever turns out to be a real problem rather than a theoretical one, this is
where to go.

**Porcupine** is properly licensed for commercial use and trains custom wake
words in minutes, but validates its key online, which a contained offline app
cannot accept.

## Consequences

**The microphone is held open permanently**, from app start until the app
closes, and Windows shows the mic-in-use indicator for all of it. Nothing can
detect a phrase it is not hearing; this is not an implementation shortcut and
there is no version of a wake word without it.

**The pre-trained weights cannot be shipped.** openWakeWord's code is
Apache-2.0 but its pre-trained models are CC BY-NC-SA 4.0 — non-commercial,
and share-alike. This was built against its `hey jarvis` model as deliberate
scaffolding, on the grounds that the file format and the code path are the
same, so replacing it costs a file and a constant. That is what happened: the
phrase changed, no pre-trained model exists for the one we settled on, and the
borrowed one was deleted rather than retained.

What that leaves is the embedding model, which is not phrase-specific and so
is not replaced by training. It must be converted from Google's original
Apache-2.0 release rather than taken from openWakeWord's repository, whose
blanket licence sentence arguably covers its redistributed copy. See
`docs/wake-word-training.md`.

**Changing the wake phrase means retraining.** This turned out to cost most of
a day, largely unattended, plus two constants in `spotter.ts` — not the "one
run and no code change" first assumed. It has happened twice: `hey jarvis` to
`hey merlin` to `hey winston`. `docs/wake-word-training.md` is what was learned
doing it.
