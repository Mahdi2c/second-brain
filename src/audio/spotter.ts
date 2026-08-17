/**
 * Scores every 80ms of audio for the wake phrase.
 *
 * openWakeWord is three graphs in a chain — mel-spectrogram, embedding,
 * classifier — and the buffering between them is not negotiable: the wrong
 * window or the wrong scaling produces plausible numbers that never fire,
 * rather than an error.
 */

// `/wasm`, not the package root: the root also pulls in the WebGPU build,
// which is 27MB of a variant we never run and would ask for a file that is
// not there.
// `/wasm`, not the package root: the root also pulls in the WebGPU build,
// which is 27MB of a variant we never run.
import * as ort from "onnxruntime-web/wasm";
import wasm from "onnxruntime-web/ort-wasm-simd-threaded.wasm?url";

import { SAMPLE_RATE } from "./constants";

// Named outright, because left to itself onnxruntime-web looks for its `.wasm`
// beside its own module — and in development that module has been rewritten
// into `.vite/deps/`, where the file is not. The fallback answers with
// `index.html` and a 200, and it fails compiling a web page as WebAssembly.
// Asking Vite for the URL gets the real one in development and the hashed
// bundled one in a build.
ort.env.wasm.wasmPaths = { wasm };

/** What the mel-spectrogram graph takes: 80ms at `SAMPLE_RATE`. */
export const CHUNK = (SAMPLE_RATE * 80) / 1000;

/**
 * Three hops of the chunk before. Fed 1280 samples alone the graph yields five
 * mel frames, and the embedding window strides by eight — the overlap is what
 * makes those two numbers the same one.
 */
const OVERLAP = 480;

const BINS = 32;
const WINDOW = 76; // mel frames per embedding
const FRAMES = 16; // embeddings per score
const DEPTH = 96; // an embedding

/**
 * The wake phrase, and the one file that knows it. Changing the phrase means
 * training a new classifier and changing these two lines — nothing else in the
 * app is aware of what he is called. See `docs/wake-word-training.md`.
 *
 * The other two graphs are generic feature extractors and are not retrained.
 */
export const WAKE_PHRASE = "hey winston";
const CLASSIFIER = "hey_winston.onnx";

/** Loads the chain. `feed` answers null until it has heard enough to score. */
export async function load(base: string) {
  const session = (name: string) =>
    ort.InferenceSession.create(base + name).catch(async (err) => {
      // Absent and unloadable are different problems and were once reported as
      // the same one, which sent the search to the wrong place entirely.
      const missing = await fetch(base + name).then((r) => !r.ok, () => true);
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

  // By position, not by name: a retrained classifier names its input and
  // output whatever its export happened to, and no two exports agree.
  const only = async (of: ort.InferenceSession, tensor: ort.Tensor) =>
    (await of.run({ [of.inputNames[0]]: tensor }))[of.outputNames[0]].data as Float32Array;

  let tail = new Float32Array(OVERLAP);
  let mels: Float32Array[] = [];
  let features: Float32Array[] = [];

  /** The last `count`, flattened, as the graphs want them. */
  const recent = (of: Float32Array[], count: number, width: number) => {
    const out = new Float32Array(count * width);
    of.slice(-count).forEach((row, i) => out.set(row, i * width));
    return out;
  };

  async function feed(chunk: Float32Array): Promise<number | null> {
    // The graphs were trained on 16-bit PCM. Web Audio's -1..1 floats are not
    // rejected, they are heard as near-silence.
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

    const window = new ort.Tensor("float32", recent(mels, WINDOW, BINS), [1, WINDOW, BINS, 1]);
    features.push(await only(embed, window));
    if (features.length < FRAMES) return null;
    features = features.slice(-FRAMES);

    const heard = new ort.Tensor("float32", recent(features, FRAMES, DEPTH), [1, FRAMES, DEPTH]);
    return (await only(classify, heard))[0];
  }

  // Primed with silence, or the first two seconds after launch are deaf while
  // the two windows fill. Nothing is ever emptied again: the chain is fed
  // whatever the microphone hears, awake or not, so that the moment he is
  // asleep again the windows already hold the room and not the last question.
  const silence = new Float32Array(CHUNK);
  while ((await feed(silence)) === null);

  return { feed };
}
