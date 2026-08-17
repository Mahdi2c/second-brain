import { useEffect, useRef, useState } from "react";

import { openMicrophone, type VoiceState } from "../audio/voiceInput";

/** Opens the microphone once and reports what he is doing with it. */
export function useVoiceInput(onQuestion: (text: string) => Promise<void>) {
  const [state, setState] = useState<VoiceState>("waitingForWakeWord");
  const [error, setError] = useState<string | null>(null);
  const cancel = useRef(() => {});

  // `onQuestion` is a new function whenever the conversation changes, and the
  // microphone must not be reopened for that.
  const latest = useRef(onQuestion);
  latest.current = onQuestion;

  const opened = useRef(false);
  useEffect(() => {
    // StrictMode runs this twice in development, taking the microphone and
    // loading the models twice over.
    if (opened.current) return;
    opened.current = true;

    // Surfaced, because a microphone that will not open leaves him asleep for
    // good and there is no Mic button to press to find that out.
    openMicrophone((text) => latest.current(text), setState).then(
      (cancelRecording) => (cancel.current = cancelRecording),
      (err) => setError(`the microphone did not open: ${err}`),
    );
  }, []);

  return { state, error, cancel: () => cancel.current() };
}
