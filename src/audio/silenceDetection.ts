/**
 * Decides when somebody has stopped talking. Kept apart from the microphone so
 * it stays a pure function: blocks in, a verdict out, testable without audio.
 */

/** Fixed, so a room noisier than this never falls quiet enough to end. */
const SPEECH_LOUDNESS = 0.009;

// Seconds. Exported so the tests read them rather than repeating them, which
// would make every retune a test failure.
export const SILENCE_ENDS_RECORDING_SECONDS = 2;
export const SILENCE_BEFORE_GIVING_UP_SECONDS = 3;
// Speech shorter than this is a cough, not a question.
export const MIN_SPEECH_SECONDS = 0.3;

/** `waiting` means this recording carries on, whatever the app is doing. */
export type SilenceVerdict = "waiting" | "send" | "nothing";

function loudness(block: Float32Array): number {
  let sum = 0;
  for (const sample of block) sum += sample * sample;
  return Math.sqrt(sum / block.length);
}

/** Watches one recording. Feed it every block; it answers each time. */
export function silenceDetector(sampleRate: number) {
  const endsRecording = SILENCE_ENDS_RECORDING_SECONDS * sampleRate;
  const givesUp = SILENCE_BEFORE_GIVING_UP_SECONDS * sampleRate;
  const minSpeech = MIN_SPEECH_SECONDS * sampleRate;

  let spokenSamples = 0;
  let quietSamples = 0;

  return (block: Float32Array): SilenceVerdict => {
    if (loudness(block) >= SPEECH_LOUDNESS) {
      spokenSamples += block.length;
      quietSamples = 0;
    } else {
      quietSamples += block.length;
    }

    // Before anybody has spoken the wait is for someone to start rather than
    // to finish, so the same run of silence is measured against two different
    // limits.
    if (spokenSamples >= minSpeech) {
      return quietSamples >= endsRecording ? "send" : "waiting";
    }
    return quietSamples >= givesUp ? "nothing" : "waiting";
  };
}
