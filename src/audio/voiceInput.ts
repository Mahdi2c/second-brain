/**
 * Owns the microphone, from the moment the app opens until it closes.
 *
 * Waiting for the wake word is not deafness: the model is fed every block
 * whatever the state and only the verdict is ignored, so its windows always
 * hold the room rather than the last question.
 */

import { invoke } from "@tauri-apps/api/core";

import { SAMPLE_RATE } from "./constants";
import { silenceDetector } from "./silenceDetection";
import { CHUNK_SAMPLES, loadWakeWordModel } from "./wakeWordModel";
import { wakeDetector } from "./wakeWordTrigger";

export type VoiceState = "waitingForWakeWord" | "recording" | "answering";

/** The recorded blocks as the 16-bit little-endian samples Rust expects. */
function toPcm16(blocks: Float32Array[]): Uint8Array {
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
 * Opens the microphone and keeps it. `onQuestion` is awaited, so the answer it
 * starts is what holds him deaf until it lands.
 */
export async function openMicrophone(
  onQuestion: (text: string) => Promise<void>,
  onStateChange: (state: VoiceState) => void,
) {
  const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const audioContext = new AudioContext({ sampleRate: SAMPLE_RATE });
  await audioContext.resume();
  await audioContext.audioWorklet.addModule("/microphone-worklet.js");

  const wakeWordModel = await loadWakeWordModel("/wake-word-model/");
  const isWakePhrase = wakeDetector();
  const wakeChime = new Audio("/wake.ogg");
  const heardChime = new Audio("/heard.ogg");

  let state: VoiceState = "waitingForWakeWord";
  let queue: Promise<void> = Promise.resolve();

  // The worklet's 128-sample render quantum is fixed and divides
  // CHUNK_SAMPLES, so a block never straddles two chunks.
  let chunk = new Float32Array(CHUNK_SAMPLES);
  let chunkFilled = 0;

  let recordedBlocks: Float32Array[] = [];
  let isRecording = false;
  let checkSilence = silenceDetector(SAMPLE_RATE);

  function setState(next: VoiceState) {
    state = next;
    onStateChange(next);
  }

  function goToSleep() {
    isRecording = false;
    setState("waitingForWakeWord");
  }

  function wakeUp() {
    setState("recording");
    recordedBlocks = [];
    checkSilence = silenceDetector(SAMPLE_RATE);
    // Only once the chime has finished, or his own tone counts towards the
    // speech that arms the recording.
    wakeChime.onended = () => (isRecording = true);
    wakeChime.currentTime = 0;
    // `onended` never fires for a sound that never started, and a chime the
    // webview refuses to play must not take the question with it.
    wakeChime.play().catch(() => (isRecording = true));
  }

  async function sendRecording() {
    isRecording = false;
    setState("answering");
    // Or the silence that ends a recording is indistinguishable from one that
    // was never heard.
    heardChime.currentTime = 0;
    heardChime.play().catch(() => {});

    let text = "";
    try {
      text = await invoke<string>("transcribe", toPcm16(recordedBlocks));
    } catch {
      // Unreported, as it has always been — devtools only.
    }

    if (text) await onQuestion(text);
    goToSleep();
  }

  /** Scores the room, a chunk at a time. */
  function scoreForWakeWord(block: Float32Array) {
    chunk.set(block, chunkFilled);
    chunkFilled += block.length;
    if (chunkFilled < CHUNK_SAMPLES) return;

    const fullChunk = chunk;
    chunk = new Float32Array(CHUNK_SAMPLES);
    chunkFilled = 0;

    // Queued because the chain takes a few milliseconds and a block arrives
    // every eight. Caught inside, since a rejected queue is never resumed —
    // one bad score would leave him deaf for the rest of the session.
    queue = queue.then(async () => {
      try {
        const score = await wakeWordModel.scoreChunk(fullChunk);
        // Scored even when it cannot wake him, so the run of high scores one
        // phrase makes is still only one rising edge.
        if (
          score !== null &&
          isWakePhrase(score) &&
          state === "waitingForWakeWord"
        ) {
          wakeUp();
        }
      } catch (err) {
        console.error("wake word", err);
      }
    });
  }

  /** Keeps the question, and ends it on the watcher's say-so. */
  function keepRecording(block: Float32Array) {
    recordedBlocks.push(block);
    const verdict = checkSilence(block);
    if (verdict === "send") sendRecording();
    else if (verdict === "nothing") goToSleep();
  }

  const workletNode = new AudioWorkletNode(audioContext, "microphone-tap");
  workletNode.port.onmessage = (e: MessageEvent<Float32Array>) => {
    scoreForWakeWord(e.data);
    if (isRecording) keepRecording(e.data);
  };

  // Web Audio only runs a node that reaches the destination; the gain stops
  // the microphone coming back out of the speakers on the way.
  const mute = new GainNode(audioContext, { gain: 0 });
  audioContext
    .createMediaStreamSource(micStream)
    .connect(workletNode)
    .connect(mute)
    .connect(audioContext.destination);

  /** The escape from a room too noisy to fall quiet. */
  return () => {
    if (state === "recording") goToSleep();
  };
}
