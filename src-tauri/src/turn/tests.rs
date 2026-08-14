//! Tests for `turn.rs`.

use super::Turn;

#[test]
fn a_fresh_turn_is_running() {
    let turn = Turn::default();

    let cancel = turn.start();

    assert!(!cancel.is_cancelled());
}

#[test]
fn stopping_cancels_the_answer_in_flight() {
    let turn = Turn::default();
    let cancel = turn.start();

    turn.stop();

    assert!(cancel.is_cancelled());
}

#[test]
fn asking_again_abandons_the_previous_answer() {
    // This is barge-in: a new question supersedes the one being answered,
    // without the caller having to stop it first.
    let turn = Turn::default();
    let first = turn.start();

    let second = turn.start();

    assert!(first.is_cancelled(), "the superseded answer kept running");
    assert!(!second.is_cancelled(), "the new answer was stopped too");
}

#[test]
fn stopping_when_nothing_is_running_is_harmless() {
    let turn = Turn::default();

    turn.stop();
    turn.stop();
}

#[test]
fn stopping_twice_does_not_reach_into_a_later_answer() {
    let turn = Turn::default();
    turn.start();
    turn.stop();

    let next = turn.start();
    turn.stop();
    turn.stop();

    assert!(next.is_cancelled());
}
