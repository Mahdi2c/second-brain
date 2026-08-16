/**
 * Decides when somebody has stopped talking. Kept apart from the microphone so
 * it stays a pure function: blocks in, a verdict out, testable without audio.
 */

/** Fixed, so a room noisier than this never falls quiet enough to end. */
const SPEECH = 0.009;

// Seconds. Exported so the tests read them rather than repeating them, which
// would make every retune a test failure.
export const HANG = 2;
export const GATE = 0.3; // speech shorter than this is a cough, not a question
export const PATIENCE = 3;

export type Verdict = "listening" | "send" | "nothing";

function rms(block: Float32Array): number {
  let sum = 0;
  for (const sample of block) sum += sample * sample;
  return Math.sqrt(sum / block.length);
}

/** Watches one recording. Feed it every block; it answers each time. */
export function listen(sampleRate: number) {
  const hang = HANG * sampleRate;
  const gate = GATE * sampleRate;
  const patience = PATIENCE * sampleRate;

  let spoken = 0;
  let quiet = 0;

  return (block: Float32Array): Verdict => {
    if (rms(block) >= SPEECH) {
      spoken += block.length;
      quiet = 0;
    } else {
      quiet += block.length;
    }

    // Before the gate the wait is for someone to start rather than to finish,
    // so the same run of silence is measured against two different limits.
    if (spoken >= gate) return quiet >= hang ? "send" : "listening";
    return quiet >= patience ? "nothing" : "listening";
  };
}
