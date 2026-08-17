# Training the wake word

The wake word is a file. `public/spotter/hey_winston.onnx` is around a megabyte
of numbers that can tell one phrase apart from every other sound, and it ships
inside the app like an icon does. Every user gets the same one. Nobody trains
anything on their machine, and nothing about the wake word is personal to a
voice — the model learns the phrase, not the speaker, so anyone can say it.

You retrain when the phrase changes, and that is the only time.

The one in `public/spotter/` was trained on 200,000 synthetic sayings of
"hey winston" and 200,000 deliberate near-misses, using openWakeWord's
pipeline in a Docker container on this machine. **The container and its
scripts were deleted once it was done**, because they were build tooling for a
job that finishes. This document is what was kept: enough to do it again
without rediscovering the same week of obstacles.

## What training does

You type a phrase. A text-to-speech engine says it thousands of times in
different synthetic voices — accents, speeds, pitches — and those are the
examples of what the phrase sounds like. Hours of unrelated speech, music and
noise are the examples of what it does not. A small network is shown all of it
over and over, guessing and being corrected, until its numbers settle
somewhere that separates the two. Those settled numbers are saved, and that
file is the model.

No microphone is involved and you record nothing. The whole run is unattended.

Only the classifier is trained. The two graphs in front of it —
`melspectrogram.onnx` and `embedding_model.onnx` — are generic feature
extractors, already in `public/spotter/`, and are not phrase-specific. The
second is why training on entirely synthetic speech works at all: Google
pre-trained it on a great deal of real speech, so the classifier only has to
learn a decision on top of it.

## Doing it again

The tool is [openWakeWord](https://github.com/dscripka/openWakeWord), driven by
its `train.py` and a YAML config. It is Linux-only — its speech comes from
Piper, which does not run natively on Windows — so it wants Docker or WSL, with
a CUDA image and the GPU passed in.

Four stages, in order, each a separate invocation of `train.py`:

```
--generate_clips   speech for the phrase, and for the near-misses
--augment_clips    every clip through room reverb and background noise
--train_model      the classifier, and an ONNX export
                   then fold the weights back in — see below
```

Generation and augmentation are hours; training is minutes.

It needs three datasets, all from HuggingFace: openWakeWord's precomputed
negative features (`davidscripka/openwakeword_features`, ~16GB — two thousand
hours of speech that is not the phrase), MIT's room impulse responses
(`davidscripka/MIT_environmental_impulse_responses`), and some background
audio to mix in — a few parquet parts of `agkphysics/AudioSet` decoded to WAV
did the job.

## The things that will waste your day

Each of these cost hours, and none announces itself clearly.

**Docker gives a container 64MB of shared memory.** PyTorch's DataLoader passes
batches between worker processes through `/dev/shm`. It fills, the workers die,
and the parent waits on a pipe **forever — no error, no exit, no log line**. It
looks exactly like slow training. Run with `--shm-size=8g`.

**The exporter writes the weights to a separate file.** PyTorch leaves the
`.onnx` holding only the graph and puts the tensors in `<name>.onnx.data`.
onnxruntime-web has no filesystem to chase that reference on, so the app
reports a model that will not load, and the `.onnx` looks suspiciously tiny.
Fold them together before shipping it:

```python
import onnx
onnx.save_model(onnx.load(src), dst, save_as_external_data=False)
```

**The GPU throws `CUDA driver error: device not ready`** at unpredictable
points under sustained load — after 200,000 clips once, after 2,600 the next
time — while reading perfectly healthy: cool, unthrottled, nothing in the
Windows event log. Generation counts what is already on disk and tops it up,
so the answer is a loop that simply starts it again.

**Anything else using the GPU makes it look broken rather than slow.** With
llama-server and whisper-server running, Piper had too little VRAM, and its
`auto_reduce_batch_size` loop caught every out-of-memory and retried with a
*smaller slice of the batch* — still counted as a full batch. Generation ran at
one fortieth speed and reported no errors at all. Its allocator also creeps
towards the card's limit over a long run, so restarting periodically is worth
more than it sounds. Stop the model servers first.

**Version skew, because the pipeline was written in 2023.** A Blackwell card
needs CUDA 12.8 wheels, not the usual cu124. PyTorch 2.6 flipped `torch.load`
to `weights_only=True`, which refuses Piper's checkpoint. torchaudio 2.1
removed `set_audio_backend`; 2.11 removed its whole I/O layer, so `load`,
`info` and `save` all delegate to a `torchcodec` that may not load — replacing
the three with `soundfile` is smaller than making torchcodec work. And
`onnxscript` must be installed or the ONNX export fails **at the very last
step**, after the training has run.

That last one is the argument for a two-second script that imports everything
and exercises the export before you start an hour-long stage.

## Settings that mattered

The example config in openWakeWord's repo is a starting point, not a good
model. What moved the needle:

| setting | value | why |
| --- | --- | --- |
| `layer_size` | **128** | The example's 32 gives a fifth of the parameters. openWakeWord's own published models are 1536→128→128→1. |
| `n_samples` | **200,000** | What their published models used. The docs say quality rises smoothly with it. |
| `max_negative_weight` | **500** | Ramps linearly over training, so the example's 1500 punishes a false wake far harder than a missed one. At 1500 the model beat its false-positive target several times over and lost recall for nothing. |
| `augmentation_rounds` | **1** | `train.py` sizes the feature array from the clip count on disk while handing the augmenter that list repeated this many times. A second round is computed and then has nowhere to go. |

**Never list the bare name as a negative.** An earlier model had "merlin" in
`custom_negative_phrases`, which taught it to reject the word on its own, and
is the best explanation for why the whole phrase then had to be
over-enunciated. Similar *different* words belong there — winslow, wilson,
kingston, preston — the target word does not.

## Checking it is any good

**Do not judge a model by the recall that training prints.** That figure is
measured on the model's own augmented clips against its own negatives, so two
models are never graded on the same paper. One model here read 0.55 and looked
alarming while beating openWakeWord's published model on a fair comparison;
`hey winston` reads 0.33, lower again, because it faced 200,000 near-misses
rather than 82,695 — a harder exam, not a worse student.

The fair comparison is to run each model over clips of *its own* phrase using
the same chain the app uses — mel → embedding → classifier, taking the highest
score any 80ms frame reaches — and report detection at several thresholds. Two
models then sit on one scale. Measured that way, 500 clips each:

| model | 0.5 | 0.3 | 0.1 | near-miss @0.3 |
| --- | --- | --- | --- | --- |
| `hey winston` (200k/200k) | 76.2% | 83.2% | 90.8% | **0.0%** |
| `hey merlin` (200k/82,695) | 90.2% | 93.2% | 97.2% | 0.4% |
| openWakeWord `hey jarvis` | 72.2% | — | — | — |

Winston hears less at a given threshold and mistakes far less, which is what
twice the near-misses buys.

**And synthetic numbers are not the last word.** Merlin's were the best of the
three and it was the one that felt unreliable in a real room. `THRESHOLD` in
`src/audio/wake.ts` is set from live readings instead — temporarily logging
what the spotter scores while somebody says the phrase, and putting the number
just above what a quiet room reaches rather than halfway up a person's
attempts. For merlin those were 0.3 and 0.08 respectively, and the difference
was the difference between working and not.

## Choosing a phrase

Wake phrases are strange on purpose. "alexa", "okay nabu" and "hey mycroft"
are three or four syllables and are not things anybody says by accident. A
short or dictionary-common phrase fires while you are talking to somebody else
and no amount of training fixes it — the model is doing its job, the phrase is
wrong. "wake up" was considered and dropped for exactly that.

`hey jarvis` came first and was only ever scaffolding: the phrase openWakeWord
happened to publish a model for, and a poor name to sell anything under given
Marvel's J.A.R.V.I.S. `hey merlin` replaced it and needed over-enunciating —
soft and liquid throughout, with no hard consonant to catch. `hey winston` was
chosen for the opposite reason: the *t* and *s* give the model an edge to find.

`WAKE_PHRASE` and `CLASSIFIER` in `src/audio/spotter.ts` are the only two
places in the app that know what he is called.

## Before shipping

The classifier is ours, trained from synthetic speech, with no third-party
weights in it. What is still outstanding is the embedding model: it was copied
out of openWakeWord's repository, whose licence sentence covers "all included
pre-trained models" without distinguishing the Google one it redistributes.
Convert it from Google's own Apache-2.0 release and the ambiguity disappears.
`melspectrogram.onnx` is in the same position.

`THIRD-PARTY-LICENSES.md` is where the shipping checklist actually lives.
