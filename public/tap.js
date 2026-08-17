/**
 * Hands every block of samples the microphone produces to the main thread.
 *
 * Runs on the audio thread and uses its globals, so importing this file would
 * only throw. It is fetched by URL from `public/`, which Vite serves verbatim.
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
