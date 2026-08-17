/**
 * Decides when the wake phrase has been heard. Kept apart from the model so it
 * stays a pure function: scores in, a verdict out, testable without audio.
 */

/**
 * Set from a real voice in a real room — synthetic clips score far higher, and
 * a threshold picked from them ignored a third of a person's attempts. It can
 * sit this low because the model mistakes near-misses so rarely; raise it if
 * the television starts waking him. See `docs/wake-word-training.md`.
 */
export const THRESHOLD = 0.1;

/** Watches one run of scores. Feed it every score; it answers each time. */
export function spot() {
  let woken = false;

  return (score: number): boolean => {
    // The rising edge only: a phrase scores high for several frames running,
    // and every frame after the first is the same "hey winston".
    const heard = score >= THRESHOLD;
    const wake = heard && !woken;
    woken = heard;
    return wake;
  };
}
