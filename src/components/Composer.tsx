import { FormEvent, useState } from "react";

type Props = {
  busy: boolean;
  onSend: (text: string) => void;
  onStop: () => void;
};

export function Composer({ busy, onSend, onStop }: Props) {
  const [input, setInput] = useState("");

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!input.trim() || busy) return;
    onSend(input);
    setInput("");
  }

  return (
    <form className="composer" onSubmit={submit}>
      <input
        value={input}
        onChange={(e) => setInput(e.currentTarget.value)}
        placeholder="Ask something..."
        disabled={busy}
      />
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
