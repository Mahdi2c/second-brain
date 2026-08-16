This application is meant to be a "jarvis" application. Where it is the users personal assistant.
The main feature of this application is that the AI will have a vault that stores all the personal information of the user, which on every prompt it writes to if it read some new crucial information or reads from whenever its outputting something.

## Things to implement that are not yet done (Claude dont implement these without being explicity told):

- AI Speaks back to user
- UI should be made nicer, will clarify more in future
- Memory system/how we main memory

# Important architecture notes:

- This is strictly for windows currently
- It should be coded in such a way that in the future the just needs to download the app and nothing else - there will be a package manager that automatically
  downloads them the ai model and engines, but dependancies like python and what not should be installed. This applications is a contained app, so it should
  only download things inside its own "project" folder as oppose to wide depedancies like python.
- This will be shipped to users to use around the world (but we are focusing english speaking only)

## Speech to text

Whisper `large-v3` quantised to q5_0, run by whisper-server on port 8081 —
its own process, because llama-server already owns 8080. Both have to be
running for the app to be fully useful.

Speech takes this path:

```
Mic button  →  webview records 16 kHz mono  →  silence.ts hears it stop
            →  raw bytes over IPC  →  speech_to_text.rs wraps them in a
            WAV header  →  POST /inference  →  the text goes to the model
```

The recording is made in the webview rather than in Rust, so the samples have
to cross the IPC boundary. They go as a raw request body, not as a command
argument: a few seconds of speech is a hundred thousand samples and JSON would
send each one as digits in an array.

`SAMPLE_RATE` is declared on both sides and the two must agree. They are not
checked against each other — a mismatch is not rejected, it is transcribed at
the wrong speed and comes back as garbled words.

The whole utterance is transcribed at once, after the user stops talking,
rather than streamed while they speak. Whisper reads half a minute of context
at a time and is markedly worse on fragments, so there is no preview of the
words while they are being said — the box stays empty and the answer arrives
instead.

The user marks the start and the silence marks the end. Pressing Mic is the
only control there is: a moment of speech arms the recording, a pause then ends
it and sends what was said without asking, and a recording nobody speaks into
closes itself having sent nothing. How long each of those is lives in
`silence.ts`. An end that is detected rather than pressed is the step towards a
wake word, which will move the microphone into Rust and take this decision with
it.

Whisper names the noises it hears that are not speech — `[BLANK_AUDIO]`,
`(laughs)` — and `transcript` strips those names, because a recording that
sends itself would otherwise ask them as questions. Only the brackets go: every
word survives, including the ones either side of a noise.

Known gaps, all deliberate: the Mic button reports no errors, so a failure is
visible only in devtools; there is no request timeout; Whisper's occasional
`*laughs*` spelling is not stripped; and the loudness that counts as speech is
a fixed number, not calibrated against the room. A room noisier than that
number never falls quiet enough to end a recording, and since nothing can stop
one by hand and there is no maximum length, the microphone there listens until
the app is restarted.

## How we work

### Keeping the README current

The README lists the models and engines in use, and the commands that start
them. Claude: whenever a model, engine, port or path changes — a new STT model,
a different quantisation, a TTS engine arriving, an engine upgrade — update that
table and the start commands in the same change. A README describing the setup
we replaced last month is worse than none.

### Test-driven development

Write the test first. It should fail for the right reason before any
implementation exists — then write the smallest code that makes it pass, and
tidy up once it is green.

New behaviour starts with a test describing it. Bugs start with a test that
reproduces them, so the fix is proven and the bug cannot come back unnoticed.

### Module files

Rust does not discover files on its own. A `.rs` file nobody declares with
`mod` is not compiled at all — it is silently invisible, not an error. So every
file has to be wired into the tree by hand:

```
lib.rs        mod commands;   → finds commands.rs
commands.rs   pub mod ask;    → finds commands/ask.rs
```

A module that owns a folder is named beside it, never `mod.rs` inside it:

```
src/commands.rs        ← the module `commands`
src/commands/ask.rs    ← the module `commands::ask`
```

`commands/mod.rs` would work identically, but it is the old Rust 2015 style and
it is how projects end up with ten editor tabs all called `mod.rs`.

File names are module names, so they cannot contain hyphens — `ask-action.rs`
will not parse. Use `_` if a name needs two words.

### Where tests live

Tests go in their own file, never inline with the code they cover. Each source
file with logic in it gets a matching test file:

```
src/language_model.rs →  src/language_model/tests.rs
src/commands/ask.rs   →  src/commands/ask/tests.rs   (not written yet)
```

The source file declares it at the top:

```rust
#[cfg(test)]
mod tests;
```

Being a child module, the test file reaches private items with `use super::*`,
so functions do not have to be made public just to be tested. The folder is
what names the file: `language_model/tests.rs` is the module
`language_model::tests`, which is how it is reported when the tests run, so
nothing is ambiguous despite the plain name.

Note this is a house rule, not the Rust default. Most Rust code — including the
draft version of this project — puts unit tests inline at the bottom of the
file in a `#[cfg(test)] mod tests { ... }` block, and that is what tutorials
will show you. Splitting them out is a recognised variant used by larger
codebases, and it is worth it here because the tests outgrow the code they
cover. Do not be surprised by inline tests elsewhere.

Two layouts that look similar but are wrong: a folder `foo/` containing
`foo.rs` makes the module `foo::foo`, and a sibling `foo_tests.rs` alongside
`foo.rs` cannot see private items at all, since privacy only flows down to
child modules.

Tests that exercise the app from the outside rather than one file from the
inside go in `src-tauri/tests/` instead — that is Rust's integration-test
directory, and everything there sees only the public API. Note the catch: a
test that needs a private function cannot live there, however end-to-end it
feels.

Run them with `cargo test` from `src-tauri`.

Every test runs offline and finishes instantly. Nothing in the suite talks to
llama-server, so there is no setup and no reason to skip any of it — if a test
would only pass with the model running, it does not belong here.

### What we test

The backend, and any logic that ends up in the frontend. The AI's behaviour and
the commands the frontend calls are what matter, and a view is still not worth
testing — but deciding when somebody has stopped talking is not a view, so
`silence.ts` is a pure function with its tests beside it. Vitest runs those:
`npm test`, from the project root.
