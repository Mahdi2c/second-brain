import { Composer } from "./components/Composer";
import { ErrorBanner } from "./components/ErrorBanner";
import { MessageList } from "./components/MessageList";
import { useChat } from "./hooks/useChat";
import "./App.css";

function App() {
  const { messages, busy, error, send, stop, dismissError } = useChat();

  return (
    <main className="chat">
      <ErrorBanner message={error} onDismiss={dismissError} />
      <MessageList messages={messages} />
      <Composer busy={busy} onSend={send} onStop={stop} />
    </main>
  );
}

export default App;
