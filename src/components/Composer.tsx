import { FormEvent, useState } from "react";

import { record } from "../audio/recorder";

type Props = {
  busy: boolean;
  onSend: (text: string) => void;
  onStop: () => void;
};

export function Composer({ busy, onSend, onStop }: Props) {
  const [input, setInput] = useState("");
  const [listening, setListening] = useState(false);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!input.trim() || busy) return;
    onSend(input);
    setInput("");
  }

  /** Starts the microphone. Nothing stops it by hand; it ends itself. */
  function dictate() {
    setListening(true);
    record((said) => {
      setListening(false);
      // Never through the box, so anything typed is left alone, and `send`
      // already declines the empty string a silent recording gives.
      onSend(said);
    }).catch(() => setListening(false)); // or a mic that will not open sticks the button
  }

  return (
    <form className="composer" onSubmit={submit}>
      <input
        value={input}
        onChange={(e) => setInput(e.currentTarget.value)}
        placeholder="Ask something..."
        disabled={busy || listening}
      />
      <button type="button" onClick={dictate} disabled={busy || listening}>
        {listening ? "Listening..." : "Mic"}
      </button>
      {busy ? (
        <button type="button" className="stop" onClick={onStop}>
          Stop
        </button>
      ) : (
        <button type="submit" disabled={listening}>
          Send
        </button>
      )}
    </form>
  );
}
