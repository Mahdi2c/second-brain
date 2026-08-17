import { Composer } from "./components/Composer";
import { ErrorBanner } from "./components/ErrorBanner";
import { MessageList } from "./components/MessageList";
import { useChat } from "./hooks/useChat";
import { useVoiceInput } from "./hooks/useVoiceInput";
import "./App.css";

function App() {
  const { messages, busy, error: chatError, send, stop, dismissError } = useChat();
  const { state, error: voiceError, cancel } = useVoiceInput(send);

  return (
    <main className="chat">
      <ErrorBanner message={voiceError ?? chatError} onDismiss={dismissError} />
      <MessageList messages={messages} />
      <Composer
        busy={busy}
        state={state}
        onSend={send}
        onStop={stop}
        onCancel={cancel}
      />
    </main>
  );
}

export default App;
