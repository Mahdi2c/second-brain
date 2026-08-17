# Third-party licences

> **This file is not finished and must not be shipped as it stands.** Entries
> marked **[verify]** are ones nobody has confirmed yet, and the transitive
> dependency lists have not been generated at all — see *Before shipping* at
> the bottom. Re-check this file whenever a model, engine or dependency
> changes, the same way the README table is kept current.

second-brain ships other people's code and other people's models. MIT and
Apache-2.0 both require their notices to travel with the software that uses
them, so this file exists and has to be included in the installer. Nobody will
read it. That is not what it is for.

## Bundled application code

| Component | Licence | |
| --- | --- | --- |
| React, React DOM | MIT | verified in `node_modules` |
| `@tauri-apps/api` | Apache-2.0 OR MIT | verified in `node_modules` |
| Tauri (Rust) | Apache-2.0 OR MIT | **[verify]** |
| `serde`, `serde_json`, `tokio`, `tokio-util`, `futures-util`, `reqwest` | MIT OR Apache-2.0 expected | **[verify]** — this is the Rust ecosystem norm, not a checked fact |
| `onnxruntime-web` | MIT expected (Microsoft) | **[verify]** — shipped: ~13MB of WASM is bundled into the app |

Vite, TypeScript and Vitest are build tools and are not shipped, so they do
not belong here.

## Bundled engines and models

| Component | Licence | |
| --- | --- | --- |
| llama.cpp / ggml | MIT | **[verify]** — no LICENCE file is present in `inference-engine/`, it needs fetching from upstream |
| whisper.cpp | MIT | **[verify]** — same, nothing in `stt-engine/` |
| Whisper large-v3 weights | MIT (OpenAI) | **[verify]** |
| Ternary-Bonsai-27B weights | **unknown** | **[verify]** — model weights frequently carry their own bespoke terms, and some forbid commercial use outright. This is the single biggest unknown in this file. |
| CUDA runtime DLLs — `cudart64_12`, `cublas64_12`, `cublasLt64_12`, `nvrtc64_120_0`, `nvblas64_12` | NVIDIA CUDA EULA | **[verify]** — redistribution is permitted under conditions, including attribution. These are shipped in both engine folders. |
| SDL2 | zlib | **[verify]** — present in `stt-engine/` |
| `public/wake.ogg`, `public/heard.ogg` | CC0 1.0 (public domain) | verified — Kenney's *Interface Sounds*, kenney.nl. Commercial use, no attribution required. Listed for completeness, not obligation. |

## Wake word

Implemented, and the licensing is the reason the design looks the way it does.
See `docs/adr/0001-wake-word-spotter.md`. The classifier is now ours; what
remains is the embedding model underneath it.

| Component | Licence | |
| --- | --- | --- |
| openWakeWord (code) | Apache-2.0 | verified in the project README |
| openWakeWord pre-trained classifiers | CC BY-NC-SA 4.0 | verified — non-commercial. **None are in the repository.** `hey_jarvis` was used as scaffolding early on and deleted. |
| Google `speech_embedding` (the embedding model) | Apache-2.0 at source | verified in openWakeWord's README, which cites Google's TFHub release. The doubt is over openWakeWord's redistributed ONNX copy, which its blanket "all included pre-trained models are CC BY-NC-SA" sentence arguably covers. Convert it from Google's own release and the doubt disappears. |
| `hey_winston.onnx` (the classifier) | ours | **trained here** from synthetic speech — no third-party weights in it |

## Before shipping

1. **Resolve every [verify] above.** The LLM weights first — a model licence
   that forbids commercial use would change what this product is, and that is
   better to discover now than after a launch.
2. **Generate the transitive lists.** The tables above cover direct
   dependencies only. Rust pulls in several hundred crates and npm a few dozen
   into the bundle, and neither set can be enumerated by hand. Use
   `cargo-about` or `cargo-license` for the Rust side and `license-checker`
   for the JavaScript side, and paste the output into this file.
3. **Collect the actual licence texts.** Most of these licences require their
   full text to travel with the software, not just its name. The engine
   folders currently contain no LICENCE files at all.
4. **Re-convert the embedding model** from Google's own Apache-2.0 release,
   per `docs/wake-word-training.md`. The classifier is done — trained here from
   synthetic speech, with no third-party weights in it — so this is the only
   part of the wake word still outstanding.
5. **Have a lawyer read it.** Everything above is a careful reading of public
   licence text by someone who is not a lawyer, on a product that will be
   sold. The gap between those two things is exactly what this step closes.
