To start, all from this directory, each in its own terminal:

npm run llm
npm run stt
npm run tauri dev

Separate terminals because the first two are servers that keep running, and
their startup logs are where you find out whether the GPU was picked up.

Both servers have to be up before the app is useful: the model answers on 8080
and the microphone transcribes on 8081. Without whisper-server a question fails
silently, since nothing reports the error yet.

There is no Mic button. Say "hey winston", wait for the chime, then ask — a
second sound tells you the question was taken. The wake word runs inside the
app and needs no server of its own.

The model is trained and in `public/spotter/`. How it was made, and how to
measure a replacement, is `docs/wake-word-training.md`.

OR:

Just run:
npm run all

Which runs the three above commands for you automatically and does it in separate powershell terminals that open up

## What is running

|                  |                                       | Where               |
| ---------------- | ------------------------------------- | ------------------- |
| Language model   | Ternary-Bonsai-27B, Q2_0 (7.1 GB)     | `ai-model/`         |
| Inference engine | llama.cpp, CUDA build                 | `inference-engine/` |
| Speech to text   | Whisper large-v3, q5_0 (1.08 GB)      | `stt-model/`        |
| STT engine       | whisper.cpp v1.9.2, cuBLAS 12.4 build | `stt-engine/`       |
| Text to speech   | not chosen yet                        | `tts-model/`        |
| Wake word        | self-trained `hey winston` (200k)     | `public/spotter/`   |
| Wake word engine | onnxruntime-web (WASM, in the app)    | bundled             |

Both engines run on the GPU (RTX 5070 Ti, 16 GB). The CUDA 12.4 build of
whisper.cpp works on this card despite predating it.

## Swapping models

The `llm` and `stt` scripts in `package.json` hardcode the model filenames, so
swapping either model means editing them:

- `llm` points at `..\ai-model\Ternary-Bonsai-27B-Q2_0.gguf`
- `stt` points at `..\stt-model\ggml-large-v3-q5_0.bin`

A new model usually means a new `-m` path, and often new flags with it — a
bigger model may not fit at `-ngl 99` and need fewer layers offloaded, and the
context size `-c 8192` is per-model too. Update the table above when you do.
