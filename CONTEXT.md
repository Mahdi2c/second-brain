This application is meant to be a "jarvis" application. Where it is the users personal assistant.
The main feature of this application is that the AI will have a vault that stores all the personal information of the user, which on every prompt it writes to if it read some new crucial information or reads from whenever its outputting something.

## Things to implement that are not yet done (Claude dont implement these without being explicity told):

- User should be able to talk to model via the STT model, which will be decided soon
- AI Speaks back to user
- UI should be made nicer, will clarify more in future
- Memory system/how we main memory.

## How we work

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

The backend only. The AI's behaviour and the commands the frontend calls are
what matter; the frontend is a view and is not worth testing yet, so there is
no JS test runner in the project on purpose.
