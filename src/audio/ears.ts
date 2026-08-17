/**
 * Owns the microphone, from the moment the app opens until it closes.
 *
 * Asleep is not deaf: the spotter is fed every block whatever the state, and
 * only the verdict is ignored. Nothing detects a phrase it is not hearing, and
 * windows emptied between questions would hold the last one rather than the
 * room.
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
  // Opened on startup rather than from a button, and a context with no click
  // behind it starts suspended — which is silence that reports nothing.
  await ctx.resume();
  // In `public/` because that is the only place Vite serves a file verbatim;
  // bundled it becomes a `data:` URL, which `addModule` may reject.
  await ctx.audioWorklet.addModule("/tap.js");

  const spotter = await load("/spotter/");
  const heard = spot();
  const waking = new Audio("/wake.ogg");
  const taken = new Audio("/heard.ogg");

  let state: State = "asleep";
  let queue: Promise<void> = Promise.resolve();

  // Eighty milliseconds of audio, gathered from the 128-sample blocks the
  // worklet delivers, because that is the only size the spotter reads.
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
    // Kept only once the chime has finished, or he records his own tone and it
    // counts towards the speech that arms the recording.
    waking.onended = () => (keeping = true);
    waking.currentTime = 0;
    // A chime the webview refuses to play must not take the question with it:
    // `onended` never fires for a sound that never started.
    waking.play().catch(() => (keeping = true));
  }

  async function question() {
    keeping = false;
    go("busy");
    // Says the question was taken. Without it the silence that ends a
    // recording is indistinguishable from one that was never heard.
    taken.currentTime = 0;
    taken.play().catch(() => {});

    let text = "";
    try {
      text = await invoke<string>("transcribe", pcm(blocks));
    } catch {
      // Unreported, as it has always been — devtools is the only place a
      // failed transcription shows up.
    }

    if (text) await said(text);
    sleep();
  }

  const node = new AudioWorkletNode(ctx, "tap");
  node.port.onmessage = (e) => {
    const block: Float32Array = e.data;

    for (let from = 0; from < block.length; ) {
      const take = Math.min(CHUNK - at, block.length - from);
      pending.set(block.subarray(from, from + take), at);
      at += take;
      from += take;
      if (at < CHUNK) continue;

      const full = pending;
      pending = new Float32Array(CHUNK);
      at = 0;
      // In a queue because a score outruns nothing: the chain takes a few
      // milliseconds and a block arrives every eight. Caught inside it, since
      // a rejected queue is never resumed — one bad score would leave him
      // deaf for the rest of the session.
      queue = queue.then(async () => {
        try {
          const score = await spotter.feed(full);
          if (score === null) return;
          // Scored even when it cannot wake him, so the run of high scores one
          // phrase makes is still only one rising edge.
          if (heard(score) && state === "asleep") wake();
        } catch (err) {
          console.error("spotter", err);
        }
      });
    }

    if (!keeping) return;
    blocks.push(block);
    const verdict = watch(block);
    if (verdict === "waiting") return;
    if (verdict === "nothing") return sleep();
    question();
  };

  // Web Audio only runs a node that reaches the destination. The gain is what
  // stops the microphone coming back out of the speakers on the way.
  const silence = new GainNode(ctx, { gain: 0 });
  ctx
    .createMediaStreamSource(mic)
    .connect(node)
    .connect(silence)
    .connect(ctx.destination);

  /** Bins the question in progress. The escape from a room too noisy to fall quiet. */
  return () => {
    if (state === "listening") sleep();
  };
}
