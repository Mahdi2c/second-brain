/**
 * Hands every block of samples the microphone produces to the main thread.
 *
 * Runs on the audio thread, which has its own globals — `registerProcessor` does
 * not exist in the main thread, so importing this file would only throw. It is
 * fetched by URL instead, and lives here because `public/` is served verbatim.
 */
registerProcessor(
  "tap",
  class extends AudioWorkletProcessor {
    process([input]) {
      // The block is reused by the next call, so it has to be copied out.
      if (input[0]) this.port.postMessage(input[0].slice(0));
      return true;
    }
  },
);
