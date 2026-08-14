//! Which answer is being generated right now, and how to stop it.

use std::sync::Mutex;

use tokio_util::sync::CancellationToken;

#[cfg(test)]
mod tests;

/// The answer in flight, if there is one.
///
/// Only one answer runs at a time, so starting another abandons the first —
/// that is barge-in, and it is the same mechanism the stop button uses.
#[derive(Default)]
pub struct Turn(Mutex<Option<CancellationToken>>);

impl Turn {
    /// Begins an answer, abandoning whatever was running. The returned token is
    /// what the stream watches to know it has been stopped.
    pub fn start(&self) -> CancellationToken {
        let token = CancellationToken::new();
        if let Some(previous) = self.swap(Some(token.clone())) {
            previous.cancel();
        }
        token
    }

    /// Stops the answer in flight. Harmless when nothing is running.
    pub fn stop(&self) {
        if let Some(current) = self.swap(None) {
            current.cancel();
        }
    }

    /// A poisoned lock would only mean a previous panic; treat it as "nothing
    /// is running" rather than bringing the app down with it.
    fn swap(&self, next: Option<CancellationToken>) -> Option<CancellationToken> {
        match self.0.lock() {
            Ok(mut slot) => std::mem::replace(&mut slot, next),
            Err(_) => None,
        }
    }
}
