/**
 * Owns the microphone, from the moment the app opens until it closes.
 *
 * Asleep is not deaf: the spotter is fed every block whatever the state and
 * only the verdict is ignored, so its windows always hold the room rather than
 * the last question.
 */

import { invoke } from "@tauri-apps/api/core";

import { SAMPLE_RATE } from "./constants";
import { listen } from "./silence";
import { CHUNK, load } from "./spotter";
import { spot } from "./wake";

export type State = "asleep" | "listening" | "busy";

/** The recorded blocks as the 16-bit little-endian samples Rust expects. */
function pcm(blocks: Float32Array[]): Uint8Array {
  const length = blocks.reduce((n, block) => n + block.length, 0);
  const out = new DataView(new ArrayBuffer(length * 2));

  let at = 0;
  for (const block of blocks) {
    for (const sample of block) {
      const clamped = Math.max(-1, Math.min(1, sample));
      out.setInt16(at, clamped * 0x7fff, true);
      at += 2;
    }
  }

  return new Uint8Array(out.buffer);
}

/**
 * Opens the microphone and keeps it. `said` is awaited, so the answer it
 * starts is what holds him deaf until it lands.
 */
export async function open(
  said: (text: string) => Promise<void>,
  changed: (state: State) => void,
) {
  const mic = await navigator.mediaDevices.getUserMedia({ audio: true });
  const ctx = new AudioContext({ sampleRate: SAMPLE_RATE });
  // Opened on startup, and a context with no click behind it starts suspended.
  await ctx.resume();
  // Served verbatim from `public/`; bundled it becomes a `data:` URL, which
  // `addModule` may reject.
  await ctx.audioWorklet.addModule("/tap.js");

  const spotter = await load("/spotter/");
  const heard = spot();
  const waking = new Audio("/wake.ogg");
  const taken = new Audio("/heard.ogg");

  let state: State = "asleep";
  let queue: Promise<void> = Promise.resolve();

  // The worklet's 128-sample render quantum is fixed and divides CHUNK, so a
  // block never straddles two chunks.
  let pending = new Float32Array(CHUNK);
  let at = 0;

  let blocks: Float32Array[] = [];
  let keeping = false;
  let watch = listen(SAMPLE_RATE);

  function go(next: State) {
    state = next;
    changed(next);
  }

  function sleep() {
    keeping = false;
    go("asleep");
  }

  function wake() {
    go("listening");
    blocks = [];
    watch = listen(SAMPLE_RATE);
    // Only once the chime has finished, or his own tone counts towards the
    // speech that arms the recording.
    waking.onended = () => (keeping = true);
    waking.currentTime = 0;
    // `onended` never fires for a sound that never started, and a chime the
    // webview refuses to play must not take the question with it.
    waking.play().catch(() => (keeping = true));
  }

  async function question() {
    keeping = false;
    go("busy");
    // Or the silence that ends a recording is indistinguishable from one that
    // was never heard.
    taken.currentTime = 0;
    taken.play().catch(() => {});

    let text = "";
    try {
      text = await invoke<string>("transcribe", pcm(blocks));
    } catch {
      // Unreported, as it has always been — devtools only.
    }

    if (text) await said(text);
    sleep();
  }

  /** Scores the room, a chunk at a time. */
  function spotting(block: Float32Array) {
    pending.set(block, at);
    at += block.length;
    if (at < CHUNK) return;

    const full = pending;
    pending = new Float32Array(CHUNK);
    at = 0;

    // Queued because the chain takes a few milliseconds and a block arrives
    // every eight. Caught inside, since a rejected queue is never resumed —
    // one bad score would leave him deaf for the rest of the session.
    queue = queue.then(async () => {
      try {
        const score = await spotter.feed(full);
        // Scored even when it cannot wake him, so the run of high scores one
        // phrase makes is still only one rising edge.
        if (score !== null && heard(score) && state === "asleep") wake();
      } catch (err) {
        console.error("spotter", err);
      }
    });
  }

  /** Keeps the question, and ends it on the watcher's say-so. */
  function recording(block: Float32Array) {
    blocks.push(block);
    const verdict = watch(block);
    if (verdict === "send") question();
    else if (verdict === "nothing") sleep();
  }

  const node = new AudioWorkletNode(ctx, "tap");
  node.port.onmessage = (e: MessageEvent<Float32Array>) => {
    spotting(e.data);
    if (keeping) recording(e.data);
  };

  // Web Audio only runs a node that reaches the destination; the gain stops
  // the microphone coming back out of the speakers on the way.
  const silence = new GainNode(ctx, { gain: 0 });
  ctx
    .createMediaStreamSource(mic)
    .connect(node)
    .connect(silence)
    .connect(ctx.destination);

  /** The escape from a room too noisy to fall quiet. */
  return () => {
    if (state === "listening") sleep();
  };
}
