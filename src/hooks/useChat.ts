import { useCallback, useState } from "react";
import { Channel, invoke } from "@tauri-apps/api/core";

import type { Msg } from "../types";

/** Rewrites the answer in flight, which is always the last message. */
function replaceAnswer(messages: Msg[], content: string): Msg[] {
  return [...messages.slice(0, -1), { role: "assistant", content }];
}

/**
 * Grows the answer in flight.
 *
 * The role check is not about stale turns — a channel belongs to one question,
 * so tokens cannot cross between them. It covers a last token arriving after
 * `dropEmptyAnswer` has removed the placeholder, which would otherwise
 * overwrite the user's own question.
 */
function appendToken(messages: Msg[], token: string): Msg[] {
  const answer = messages[messages.length - 1];
  if (answer?.role !== "assistant") return messages;
  return replaceAnswer(messages, answer.content + token);
}

/** Removes the placeholder when an answer was stopped before it said anything. */
function dropEmptyAnswer(messages: Msg[]): Msg[] {
  const answer = messages[messages.length - 1];
  if (answer?.role === "assistant" && answer.content === "") {
    return messages.slice(0, -1);
  }
  return messages;
}

/** Owns the conversation: sends questions to Rust and collects streamed tokens. */
export function useChat() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = useCallback(
    async (text: string) => {
      if (!text.trim() || busy) return;
      setError(null);

      // The empty answer is the message the tokens stream into.
      setMessages((prev) => [
        ...prev,
        { role: "user", content: text },
        { role: "assistant", content: "" },
      ]);
      setBusy(true);

      // A fresh channel per question. Tokens from an answer that was stopped
      // go to the previous channel, which nothing is reading any more, so they
      // cannot leak into this one.
      const onToken = new Channel<string>();
      onToken.onmessage = (token) => setMessages((prev) => appendToken(prev, token));

      try {
        // Resolves when the answer finishes or is stopped — both are normal.
        await invoke("ask", { text, onToken });
        setMessages(dropEmptyAnswer);
      } catch (err) {
        // Kept out of the transcript: a failure is not something the
        // assistant said. Any tokens that did arrive stay put.
        setMessages(dropEmptyAnswer);
        setError(String(err));
      } finally {
        setBusy(false);
      }
    },
    [busy],
  );

  /** Cut the assistant off. Harmless when it is not talking. */
  const stop = useCallback(() => {
    invoke("stop").catch(() => {});
  }, []);

  const dismissError = useCallback(() => setError(null), []);

  return { messages, busy, error, send, stop, dismissError };
}
