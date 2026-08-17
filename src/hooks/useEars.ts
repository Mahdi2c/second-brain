import { useEffect, useRef, useState } from "react";

import { open, type State } from "../audio/ears";

/** Opens the microphone once and reports what he is doing with it. */
export function useEars(said: (text: string) => Promise<void>) {
  const [state, setState] = useState<State>("asleep");
  const [error, setError] = useState<string | null>(null);
  const cancel = useRef(() => {});

  // `said` is a new function whenever the conversation changes, and the
  // microphone must not be reopened for that.
  const latest = useRef(said);
  latest.current = said;

  const opened = useRef(false);
  useEffect(() => {
    // StrictMode runs this twice in development, taking the microphone and
    // loading the models twice over.
    if (opened.current) return;
    opened.current = true;

    // Surfaced, because a microphone that will not open leaves him asleep for
    // good and there is no Mic button to press to find that out.
    open((text) => latest.current(text), setState).then(
      (bin) => (cancel.current = bin),
      (err) => setError(`the microphone did not open: ${err}`),
    );
  }, []);

  return { state, error, cancel: () => cancel.current() };
}
