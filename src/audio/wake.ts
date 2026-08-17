/**
 * Decides when the wake phrase has been heard. Kept apart from the model so it
 * stays a pure function: scores in, a verdict out, testable without audio.
 */

/**
 * Set from a real voice in the real room, not from synthetic clips — those
 * score far higher, and a threshold picked from them sat halfway up a person's
 * attempts and ignored a third of them.
 *
 * A starting point for this model rather than a settled number. It is trained
 * against 200,000 near-misses and is unusually sure of itself: over 500 clips
 * it woke to none of them at 0.3 and 0.8% at 0.1, where the previous model
 * woke to 0.4% at 0.3. That buys room to sit low.
 *
 * Raise it if the television starts waking him. How to measure a model, and
 * how this number was arrived at, is `docs/wake-word-training.md`.
 */
export const THRESHOLD = 0.1;

/** Watches one run of scores. Feed it every score; it answers each time. */
export function spot() {
  let woken = false;

  return (score: number): boolean => {
    // The rising edge only: a phrase scores high for several frames running,
    // and every one of them after the first is the same "hey winston".
    const heard = score >= THRESHOLD;
    const wake = heard && !woken;
    woken = heard;
    return wake;
  };
}
