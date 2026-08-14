type Props = {
  message: string | null;
  onDismiss: () => void;
};

/** Sits above the conversation, so a failure is not mistaken for an answer. */
export function ErrorBanner({ message, onDismiss }: Props) {
  if (!message) return null;

  return (
    <div className="error" role="alert">
      <span>Something went wrong — {message}</span>
      <button type="button" onClick={onDismiss} aria-label="Dismiss">
        ×
      </button>
    </div>
  );
}
