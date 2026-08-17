/** Tests for `silence.ts`. */

import { describe, expect, it } from "vitest";

import { SAMPLE_RATE } from "./constants";
import { GATE, HANG, PATIENCE, listen } from "./silence";

const BLOCK = 128;

/** Constant amplitude, so the block's RMS is that amplitude. */
function block(amplitude: number): Float32Array {
  return new Float32Array(BLOCK).fill(amplitude);
}

function feed(watch: ReturnType<typeof listen>, amplitude: number, seconds: number) {
  const blocks = Math.ceil((seconds * SAMPLE_RATE) / BLOCK);
  let verdict = watch(block(amplitude));
  for (let i = 1; i < blocks; i++) verdict = watch(block(amplitude));
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
    const watch = listen(SAMPLE_RATE);
    feed(watch, LOUD, GATE);
    expect(feed(watch, QUIET, HANG)).toBe("send");
  });

  it("keeps waiting while the silence is shorter than the hang time", () => {
    const watch = listen(SAMPLE_RATE);
    feed(watch, LOUD, GATE);
    expect(feed(watch, QUIET, HANG - 0.1)).toBe("waiting");
  });

  it("keeps waiting through a pause in the middle of a sentence", () => {
    // Two pauses adding up past the hang time, with a word between them.
    const watch = listen(SAMPLE_RATE);
    feed(watch, LOUD, GATE);
    feed(watch, QUIET, HANG - 0.1);
    feed(watch, LOUD, 0.2);
    expect(feed(watch, QUIET, HANG - 0.1)).toBe("waiting");
  });
});

/**
 * Nothing is sent unless somebody spoke. A recording of a quiet room
 * transcribes to Whisper's own noises, not to silence.
 */
describe("giving up", () => {
  it("gives up when nothing is ever said", () => {
    const watch = listen(SAMPLE_RATE);
    expect(feed(watch, QUIET, PATIENCE)).toBe("nothing");
  });

  it("gives up on a noise too short to be speech", () => {
    const watch = listen(SAMPLE_RATE);
    feed(watch, LOUD, GATE / 2);
    expect(feed(watch, QUIET, PATIENCE)).toBe("nothing");
  });

  it("still gives someone who starts late their turn", () => {
    // The wait measures silence, not elapsed time, so a slow start is not cut
    // off in the middle of its first word.
    const watch = listen(SAMPLE_RATE);
    feed(watch, QUIET, PATIENCE - 0.1);
    feed(watch, LOUD, GATE);
    expect(feed(watch, QUIET, HANG)).toBe("send");
  });
});
