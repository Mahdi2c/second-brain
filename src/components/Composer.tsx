import { FormEvent, useState } from "react";

import type { VoiceState } from "../audio/voiceInput";

type Props = {
  busy: boolean;
  state: VoiceState;
  onSend: (text: string) => void;
  onStop: () => void;
  onCancel: () => void;
};

export function Composer({ busy, state, onSend, onStop, onCancel }: Props) {
  const [input, setInput] = useState("");

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!input.trim() || busy) return;
    onSend(input);
    setInput("");
  }

  const recording = state === "recording";

  return (
    <form className="composer" onSubmit={submit}>
      <input
        value={input}
        onChange={(e) => setInput(e.currentTarget.value)}
        placeholder={recording ? "Listening..." : "Ask something..."}
        disabled={busy || recording}
      />
      {busy ? (
        <button type="button" className="stop" onClick={onStop}>
          Stop
        </button>
      ) : recording ? (
        // The only way out of a room too noisy to fall silent.
        <button type="button" className="stop" onClick={onCancel}>
          Cancel
        </button>
      ) : (
        <button type="submit">Send</button>
      )}
    </form>
  );
}
