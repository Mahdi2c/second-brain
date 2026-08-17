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
export const CHUNK_SAMPLES = (SAMPLE_RATE * 80) / 1000;

/**
 * Three hops of the chunk before. 1280 samples alone yield five mel frames and
 * the embedding window strides by eight; the overlap reconciles the two.
 */
const OVERLAP_SAMPLES = 480;

const MEL_BINS = 32;
const MELS_PER_EMBEDDING = 76;
const EMBEDDINGS_PER_SCORE = 16;
const EMBEDDING_SIZE = 96;

/**
 * The only line in the app that knows what he is called — the other two graphs
 * are generic and are not retrained. See `docs/wake-word-training.md`.
 */
const CLASSIFIER = "hey_winston.onnx";

/**
 * Loads the chain. `scoreChunk` answers null until it has heard enough to
 * score.
 */
export async function loadWakeWordModel(base: string) {
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
  const runModel = async (of: ort.InferenceSession, tensor: ort.Tensor) =>
    (await of.run({ [of.inputNames[0]]: tensor }))[of.outputNames[0]]
      .data as Float32Array;

  const flatten = (rows: Float32Array[], width: number) => {
    const out = new Float32Array(rows.length * width);
    rows.forEach((row, i) => out.set(row, i * width));
    return out;
  };

  let overlapTail = new Float32Array(OVERLAP_SAMPLES);
  let melFrames: Float32Array[] = [];
  let embeddings: Float32Array[] = [];

  async function scoreChunk(chunk: Float32Array): Promise<number | null> {
    // Trained on 16-bit PCM: Web Audio's -1..1 floats are not rejected, they
    // are heard as near-silence.
    const samples = new Float32Array(OVERLAP_SAMPLES + CHUNK_SAMPLES);
    samples.set(overlapTail);
    for (let i = 0; i < CHUNK_SAMPLES; i++) {
      samples[OVERLAP_SAMPLES + i] = chunk[i] * 0x7fff;
    }
    overlapTail = samples.slice(-OVERLAP_SAMPLES);

    const audio = new ort.Tensor("float32", samples, [1, samples.length]);
    const newMelFrames = await runModel(mel, audio);
    for (let i = 0; i < newMelFrames.length; i += MEL_BINS) {
      // The transform openWakeWord applies to match its TensorFlow original.
      melFrames.push(
        newMelFrames.slice(i, i + MEL_BINS).map((v) => v / 10 + 2),
      );
    }
    if (melFrames.length < MELS_PER_EMBEDDING) return null;
    melFrames = melFrames.slice(-MELS_PER_EMBEDDING);

    const melWindow = new ort.Tensor("float32", flatten(melFrames, MEL_BINS), [
      1,
      MELS_PER_EMBEDDING,
      MEL_BINS,
      1,
    ]);
    embeddings.push(await runModel(embed, melWindow));
    if (embeddings.length < EMBEDDINGS_PER_SCORE) return null;
    embeddings = embeddings.slice(-EMBEDDINGS_PER_SCORE);

    const recentEmbeddings = new ort.Tensor(
      "float32",
      flatten(embeddings, EMBEDDING_SIZE),
      [1, EMBEDDINGS_PER_SCORE, EMBEDDING_SIZE],
    );
    return (await runModel(classify, recentEmbeddings))[0];
  }

  const silence = new Float32Array(CHUNK_SAMPLES);
  while ((await scoreChunk(silence)) === null);

  return { scoreChunk };
}
