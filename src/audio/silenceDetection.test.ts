import { describe, expect, it } from "vitest";

import { SAMPLE_RATE } from "./constants";
import {
  MIN_SPEECH_SECONDS,
  SILENCE_BEFORE_GIVING_UP_SECONDS,
  SILENCE_ENDS_RECORDING_SECONDS,
  silenceDetector,
} from "./silenceDetection";

const BLOCK = 128;

/** Constant amplitude, so the block's RMS is that amplitude. */
function block(amplitude: number): Float32Array {
  return new Float32Array(BLOCK).fill(amplitude);
}

function feed(
  checkSilence: ReturnType<typeof silenceDetector>,
  amplitude: number,
  seconds: number,
) {
  const blocks = Math.ceil((seconds * SAMPLE_RATE) / BLOCK);
  let verdict = checkSilence(block(amplitude));
  for (let i = 1; i < blocks; i++) verdict = checkSilence(block(amplitude));
  return verdict;
}

const LOUD = 0.5;
const QUIET = 0;

/**
 * Ending too early truncates the question and sends the fragment anyway;
 * ending too late, or never, leaves the microphone running with no way to
 * stop it.
 */
describe("ending a recording", () => {
  it("sends once speech is followed by the hang time in silence", () => {
    const checkSilence = silenceDetector(SAMPLE_RATE);
    feed(checkSilence, LOUD, MIN_SPEECH_SECONDS);
    expect(feed(checkSilence, QUIET, SILENCE_ENDS_RECORDING_SECONDS)).toBe("send");
  });

  it("keeps waiting while the silence is shorter than the hang time", () => {
    const checkSilence = silenceDetector(SAMPLE_RATE);
    feed(checkSilence, LOUD, MIN_SPEECH_SECONDS);
    expect(feed(checkSilence, QUIET, SILENCE_ENDS_RECORDING_SECONDS - 0.1)).toBe("waiting");
  });

  it("keeps waiting through a pause in the middle of a sentence", () => {
    // Two pauses adding up past the hang time, with a word between them.
    const checkSilence = silenceDetector(SAMPLE_RATE);
    feed(checkSilence, LOUD, MIN_SPEECH_SECONDS);
    feed(checkSilence, QUIET, SILENCE_ENDS_RECORDING_SECONDS - 0.1);
    feed(checkSilence, LOUD, 0.2);
    expect(feed(checkSilence, QUIET, SILENCE_ENDS_RECORDING_SECONDS - 0.1)).toBe("waiting");
  });
});

/**
 * Nothing is sent unless somebody spoke. A recording of a quiet room
 * transcribes to Whisper's own noises, not to silence.
 */
describe("giving up", () => {
  it("gives up when nothing is ever said", () => {
    const checkSilence = silenceDetector(SAMPLE_RATE);
    expect(feed(checkSilence, QUIET, SILENCE_BEFORE_GIVING_UP_SECONDS)).toBe("nothing");
  });

  it("gives up on a noise too short to be speech", () => {
    const checkSilence = silenceDetector(SAMPLE_RATE);
    feed(checkSilence, LOUD, MIN_SPEECH_SECONDS / 2);
    expect(feed(checkSilence, QUIET, SILENCE_BEFORE_GIVING_UP_SECONDS)).toBe("nothing");
  });

  it("still gives someone who starts late their turn", () => {
    // The wait measures silence, not elapsed time, so a slow start is not cut
    // off in the middle of its first word.
    const checkSilence = silenceDetector(SAMPLE_RATE);
    feed(checkSilence, QUIET, SILENCE_BEFORE_GIVING_UP_SECONDS - 0.1);
    feed(checkSilence, LOUD, MIN_SPEECH_SECONDS);
    expect(feed(checkSilence, QUIET, SILENCE_ENDS_RECORDING_SECONDS)).toBe("send");
  });
});
