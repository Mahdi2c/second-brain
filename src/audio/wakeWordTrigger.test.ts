import { describe, expect, it } from "vitest";

import { WAKE_SCORE_THRESHOLD, wakeDetector } from "./wakeWordTrigger";

const HEARD = WAKE_SCORE_THRESHOLD + 0.1;
const NOT = WAKE_SCORE_THRESHOLD - 0.1;

/**
 * One phrase must wake him once. Scoring every 80ms, a phrase scores high
 * across several frames in a row.
 */
describe("spotting the phrase", () => {
  it("wakes when the score crosses the threshold", () => {
    const isWakePhrase = wakeDetector();
    expect(isWakePhrase(HEARD)).toBe(true);
  });

  it("stays quiet while the score is below the threshold", () => {
    const isWakePhrase = wakeDetector();
    expect(isWakePhrase(NOT)).toBe(false);
  });

  it("wakes only once while the score stays high", () => {
    const isWakePhrase = wakeDetector();
    isWakePhrase(HEARD);
    expect(isWakePhrase(HEARD)).toBe(false);
    expect(isWakePhrase(HEARD)).toBe(false);
  });

  it("wakes again for a second phrase", () => {
    const isWakePhrase = wakeDetector();
    isWakePhrase(HEARD);
    isWakePhrase(NOT);
    expect(isWakePhrase(HEARD)).toBe(true);
  });
});
