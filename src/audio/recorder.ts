import { invoke } from "@tauri-apps/api/core";

/** Must match `SAMPLE_RATE` in speech_to_text.rs, or speech comes back garbled. */
const SAMPLE_RATE = 16000;

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

/** Starts recording; the returned function stops it and answers with what was said. */
export async function record(): Promise<() => Promise<string>> {
  const mic = await navigator.mediaDevices.getUserMedia({ audio: true });
  const ctx = new AudioContext({ sampleRate: SAMPLE_RATE });
  // In `public/` because that is the only place Vite serves a file verbatim;
  // bundled it becomes a `data:` URL, which `addModule` may reject.
  await ctx.audioWorklet.addModule("/tap.js");

  const blocks: Float32Array[] = [];
  const node = new AudioWorkletNode(ctx, "tap");
  node.port.onmessage = (e) => blocks.push(e.data);

  // Web Audio only runs a node that reaches the destination. The gain is what
  // stops the microphone coming back out of the speakers on the way.
  const silence = new GainNode(ctx, { gain: 0 });
  ctx.createMediaStreamSource(mic).connect(node).connect(silence).connect(ctx.destination);

  return async () => {
    mic.getTracks().forEach((track) => track.stop());
    await ctx.close();
    return invoke<string>("transcribe", pcm(blocks));
  };
}
