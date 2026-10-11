import test from "node:test";
import assert from "node:assert/strict";
import {
  BREAK_TICKETS, createBreakClock, remainingBreakTime,
  startBreakClock, pauseBreakClock, completeBreakClock
} from "../take-a-break.js";

test("all five poster tickets provide replayable challenges and short durations", () => {
  assert.deepEqual(BREAK_TICKETS.map((ticket) => ticket.id), ["do-nothing", "sip-slow", "brain-off", "zero-flucks", "leave-earth"]);
  for (const ticket of BREAK_TICKETS) {
    assert.equal(ticket.challenges.length, 4);
    assert.ok(ticket.seconds >= 45 && ticket.seconds <= 90);
    assert.equal(new Set(ticket.challenges.map(([title]) => title)).size, 4);
    for (const [title, prompt] of ticket.challenges) assert.ok(title && prompt);
  }
});

test("paused time is preserved across a long absence and resume", () => {
  const started = startBreakClock(createBreakClock(60), 1000);
  const paused = pauseBreakClock(started, 11500);
  assert.equal(paused.phase, "paused");
  assert.equal(remainingBreakTime(paused, 999999), 49500);
  const resumed = startBreakClock(paused, 1000000);
  assert.equal(remainingBreakTime(resumed, 1000500), 49000);
  assert.equal(startBreakClock(resumed, 1000600), resumed, "Starting twice must not reset a running break");
});

test("expired and completed breaks cannot restart or produce negative time", () => {
  const expired = pauseBreakClock(startBreakClock(createBreakClock(45), 0), 100000);
  assert.equal(expired.phase, "finished");
  assert.equal(remainingBreakTime(expired, 200000), 0);
  assert.equal(startBreakClock(expired, 200000), expired);
  const complete = completeBreakClock(startBreakClock(createBreakClock(90), 0));
  assert.equal(complete.phase, "complete");
  assert.equal(remainingBreakTime(complete, 1), 0);
  assert.equal(startBreakClock(complete, 1), complete);
  assert.deepEqual(completeBreakClock(complete), complete);
  assert.throws(() => createBreakClock(0), RangeError);
  assert.throws(() => createBreakClock(NaN), RangeError);
});
