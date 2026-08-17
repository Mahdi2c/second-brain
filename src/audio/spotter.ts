/**
 * Scores every 80ms of audio for the wake phrase.
 *
 * openWakeWord is three graphs chained — mel-spectrogram, embedding,
 * classifier. The wrong window or scaling between them yields plausible
 * numbers that never fire, not an error.
 */

// `/wasm`, not the package root: the root also pulls in the 27MB WebGPU build.
import * as ort from "onnxruntime-web/wasm";
import wasm from "onnxruntime-web/ort-wasm-simd-threaded.wasm?url";

import { SAMPLE_RATE } from "./constants";

// Left to itself onnxruntime-web looks beside its own module, which Vite has
// rewritten into `.vite/deps/`. The fallback serves `index.html` with a 200,
// and compiling a web page as WebAssembly fails.
ort.env.wasm.wasmPaths = { wasm };

/** What the mel-spectrogram graph takes: 80ms at `SAMPLE_RATE`. */
export const CHUNK = (SAMPLE_RATE * 80) / 1000;

/**
 * Three hops of the chunk before. 1280 samples alone yield five mel frames and
 * the embedding window strides by eight; the overlap reconciles the two.
 */
const OVERLAP = 480;

const BINS = 32;
const WINDOW = 76; // mel frames per embedding
const FRAMES = 16; // embeddings per score
const DEPTH = 96; // an embedding

/**
 * The only line in the app that knows what he is called — the other two graphs
 * are generic and are not retrained. See `docs/wake-word-training.md`.
 */
const CLASSIFIER = "hey_winston.onnx";

/** Loads the chain. `feed` answers null until it has heard enough to score. */
export async function load(base: string) {
  const session = (name: string) =>
    ort.InferenceSession.create(base + name).catch(async (err) => {
      // Absent and unloadable send the search to different places.
      const missing = await fetch(base + name, { method: "HEAD" }).then(
        (r) => !r.ok,
        () => true,
      );
      throw new Error(
        missing
          ? `${name} is missing — see docs/wake-word-training.md`
          : `${name} would not load: ${err}`,
      );
    });
  const [mel, embed, classify] = await Promise.all([
    session("melspectrogram.onnx"),
    session("embedding_model.onnx"),
    session(CLASSIFIER),
  ]);

  // By position, not by name: no two classifier exports agree on what they
  // call their input and output.
  const only = async (of: ort.InferenceSession, tensor: ort.Tensor) =>
    (await of.run({ [of.inputNames[0]]: tensor }))[of.outputNames[0]].data as Float32Array;

  let tail = new Float32Array(OVERLAP);
  let mels: Float32Array[] = [];
  let features: Float32Array[] = [];

  const flat = (rows: Float32Array[], width: number) => {
    const out = new Float32Array(rows.length * width);
    rows.forEach((row, i) => out.set(row, i * width));
    return out;
  };

  async function feed(chunk: Float32Array): Promise<number | null> {
    // Trained on 16-bit PCM: Web Audio's -1..1 floats are not rejected, they
    // are heard as near-silence.
    const samples = new Float32Array(OVERLAP + CHUNK);
    samples.set(tail);
    for (let i = 0; i < CHUNK; i++) samples[OVERLAP + i] = chunk[i] * 0x7fff;
    tail = samples.slice(-OVERLAP);

    const frames = await only(mel, new ort.Tensor("float32", samples, [1, samples.length]));
    for (let i = 0; i < frames.length; i += BINS) {
      // The transform openWakeWord applies to match its TensorFlow original.
      mels.push(frames.slice(i, i + BINS).map((v) => v / 10 + 2));
    }
    if (mels.length < WINDOW) return null;
    mels = mels.slice(-WINDOW);

    const window = new ort.Tensor("float32", flat(mels, BINS), [1, WINDOW, BINS, 1]);
    features.push(await only(embed, window));
    if (features.length < FRAMES) return null;
    features = features.slice(-FRAMES);

    const heard = new ort.Tensor("float32", flat(features, DEPTH), [1, FRAMES, DEPTH]);
    return (await only(classify, heard))[0];
  }

  // Primed, or the first two seconds after launch are deaf while the windows
  // fill.
  const silence = new Float32Array(CHUNK);
  while ((await feed(silence)) === null);

  return { feed };
}
