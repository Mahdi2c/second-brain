/** Tests for `wake.ts`. */

import { describe, expect, it } from "vitest";

import { THRESHOLD, spot } from "./wake";

const HEARD = THRESHOLD + 0.1;
const NOT = THRESHOLD - 0.1;

/**
 * One phrase must wake him once. The spotter scores every 80ms, so a phrase
 * scores high across several frames in a row, and a detector that answered
 * each of them would wake him repeatedly for a single "hey winston".
 */
describe("spotting the phrase", () => {
  it("wakes when the score crosses the threshold", () => {
    const watch = spot();
    expect(watch(HEARD)).toBe(true);
  });

  it("stays quiet while the score is below the threshold", () => {
    const watch = spot();
    expect(watch(NOT)).toBe(false);
  });

  it("wakes only once while the score stays high", () => {
    const watch = spot();
    watch(HEARD);
    expect(watch(HEARD)).toBe(false);
    expect(watch(HEARD)).toBe(false);
  });

  it("wakes again for a second phrase", () => {
    const watch = spot();
    watch(HEARD);
    watch(NOT);
    expect(watch(HEARD)).toBe(true);
  });
});
