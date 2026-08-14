import { useEffect, useRef } from "react";

import type { Msg } from "../types";

type Props = {
  messages: Msg[];
};

export function MessageList({ messages }: Props) {
  const end = useRef<HTMLDivElement>(null);

  // Tokens arrive one at a time, so this follows the answer as it is written.
  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [messages]);

  return (
    <div className="messages">
      {messages.map((m, i) => (
        <div key={i} className={`msg ${m.role}`}>
          {m.content || "Thinking..."}
        </div>
      ))}
      <div ref={end} />
    </div>
  );
}
