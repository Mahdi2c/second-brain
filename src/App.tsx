import { Composer } from "./components/Composer";
import { ErrorBanner } from "./components/ErrorBanner";
import { MessageList } from "./components/MessageList";
import { useChat } from "./hooks/useChat";
import { useEars } from "./hooks/useEars";
import "./App.css";

function App() {
  const {
    messages,
    busy,
    error: chatError,
    send,
    stop,
    dismissError,
  } = useChat();
  const { state, error: earError, cancel } = useEars(send);

  return (
    <main className="chat">
      <ErrorBanner message={earError ?? chatError} onDismiss={dismissError} />
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
