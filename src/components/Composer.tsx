import { FormEvent, useState } from "react";

import { record } from "../audio/recorder";

type Props = {
  busy: boolean;
  onSend: (text: string) => void;
  onStop: () => void;
};

export function Composer({ busy, onSend, onStop }: Props) {
  const [input, setInput] = useState("");
  /** The function that ends the recording, and so also the fact there is one. */
  const [recording, setRecording] = useState<(() => Promise<string>) | null>(null);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!input.trim() || busy) return;
    onSend(input);
    setInput("");
  }

  /** Starts the microphone, or stops it and puts what was said in the box. */
  async function dictate() {
    if (!recording) {
      const finish = await record();
      // Wrapped, or React would call it to compute the next state.
      setRecording(() => finish);
      return;
    }

    setRecording(null);
    setInput(await recording());
  }

  return (
    <form className="composer" onSubmit={submit}>
      <input
        value={input}
        onChange={(e) => setInput(e.currentTarget.value)}
        placeholder="Ask something..."
        disabled={busy}
      />
      <button type="button" onClick={dictate} disabled={busy}>
        {recording ? "Listening..." : "Mic"}
      </button>
      {busy ? (
        <button type="button" className="stop" onClick={onStop}>
          Stop
        </button>
      ) : (
        <button type="submit">Send</button>
      )}
    </form>
  );
}
