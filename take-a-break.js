import { setupFlamingoMotion } from "./flamingo-motion.js";

export const BREAK_TICKETS = [
  {
    id: "do-nothing", label: "DO NOTHING", seconds: 60,
    challenges: [
      ["Become a very expensive houseplant.", "Sit comfortably. Look at one ordinary thing. For this minute, you have absolutely no job to do."],
      ["Observe the ceiling. It has been through a lot.", "Let your shoulders settle and look around. Pick the least interesting object in the room. Admire its commitment to doing nothing."],
      ["Your inner manager has left the building.", "Find a comfortable spot. Let the next thought arrive and leave without turning it into a task."],
      ["Practice competitive unbotheredness.", "Put down whatever you are doing. Take this minute without improving, optimizing, fixing, or explaining a single thing."]
    ]
  },
  {
    id: "sip-slow", label: "SIP SLOW", seconds: 60,
    challenges: [
      ["You are the CEO of a very small sip.", "If a drink is nearby, take a small, comfortable sip. Notice its taste. Put it down. The next sip has no deadline."],
      ["Open your invisible beach café.", "Imagine a tiny café where the only menu item is taking your time. Take a sip if you have a drink, or simply watch the imaginary waves."],
      ["Give your cup a dramatic backstory.", "Look at your drink and invent its ridiculous movie title. No drink? Cast an ordinary object as the mysterious star instead."],
      ["Drink at flamingo speed.", "Take your time with one sip, if you have a drink. Notice something pleasant around you. Your inbox can survive the suspense."]
    ]
  },
  {
    id: "brain-off", label: "BRAIN OFF", seconds: 45,
    challenges: [
      ["The loading screen is your personality now.", "Look away from the screen. Find three shapes around you. Give each a terrible band name. No cleverness allowed."],
      ["Install absolutely no updates.", "Listen for one sound nearby. Imagine a tiny flamingo making it. Let that be your entire assignment."],
      ["A cloud has borrowed your thinking department.", "Look around and pick a color. Notice three things wearing it. Pretend they belong to a secret, deeply incompetent society."],
      ["Enter airplane mode. With imaginary wings.", "Let your hands rest. Imagine your thoughts as small paper planes drifting past. You do not have to catch them."]
    ]
  },
  {
    id: "zero-flucks", label: "ZERO FLUCKS", seconds: 75,
    challenges: [
      ["Submit your resignation from unnecessary urgency.", "Pick one small, non-urgent thing you can leave for later. Silently tell it: 'You are not the main character right now.'"],
      ["Your perfectionism has been put on hold.", "Imagine a flamingo receptionist telling your inner critic, 'Please wait.' Settle into a comfortable position and enjoy the hold music."],
      ["Award yourself a medal for existing.", "Invent the title of your very unserious award. Accept it with one small smile. No achievement speech required."],
      ["Be beautifully unavailable for a minute.", "Give yourself permission to stop performing for a moment. Notice where your feet rest. Let ordinary be enough."]
    ]
  },
  {
    id: "leave-earth", label: "LEAVE EARTH", seconds: 90,
    challenges: [
      ["Your UFO is parked outside.", "Imagine a planet where nobody asks what you do for a living. Name it. Choose its most ridiculous national snack."],
      ["Take the scenic route through your imagination.", "Picture a turquoise moon, a pink beach, and a flamingo with no responsibilities. Decide what the alien souvenir shop sells."],
      ["Earth has been muted.", "Look at the sky if you can, or imagine it. Invent a constellation shaped like something completely useless. Give it a heroic name."],
      ["Send one postcard from Planet Nope.", "Imagine a postcard that says, 'Having a lovely time. Not fixing anything.' Picture the strange little place it came from."]
    ]
  }
];

export function createBreakClock(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) throw new RangeError("A break needs a positive duration.");
  return { phase: "ready", remainingMs: seconds * 1000, deadline: null };
}

export function remainingBreakTime(clock, now) {
  return clock.phase === "running" ? Math.max(0, clock.deadline - now) : clock.remainingMs;
}

export function startBreakClock(clock, now) {
  if (!["ready", "paused"].includes(clock.phase) || clock.remainingMs <= 0) return clock;
  return { ...clock, phase: "running", deadline: now + clock.remainingMs };
}

export function pauseBreakClock(clock, now) {
  if (clock.phase !== "running") return clock;
  const remainingMs = remainingBreakTime(clock, now);
  return { ...clock, phase: remainingMs ? "paused" : "finished", remainingMs, deadline: null };
}

export function completeBreakClock(clock) {
  return { ...clock, phase: "complete", remainingMs: 0, deadline: null };
}

function bootBreakGame() {
  const buttons = [...document.querySelectorAll("[data-ticket]")];
  const surprise = document.getElementById("break-surprise");
  const dialog = document.getElementById("break-dialog");
  const slip = dialog.querySelector(".permission-slip");
  const close = dialog.querySelector(".slip-close");
  const title = document.getElementById("slip-title");
  const prompt = document.getElementById("slip-prompt");
  const challenge = document.getElementById("slip-challenge");
  const number = document.getElementById("slip-number");
  const timer = document.getElementById("break-timer");
  const progress = document.getElementById("break-progress");
  const status = document.getElementById("break-status");
  const start = document.getElementById("break-start");
  const done = document.getElementById("break-done");
  const again = document.getElementById("break-again");
  const stamp = dialog.querySelector(".slip-stamp");
  const count = document.getElementById("break-count");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const flamingos = setupFlamingoMotion(reducedMotion);
  let clock = null;
  let interval = null;
  let revealing = false;
  let lastTrigger = null;
  let selectedButton = null;
  let ticketsTaken = 0;
  let breaksTaken = 0;
  let durationMs = 0;
  const lastChallenges = new Map();

  function stopTicking() {
    if (interval !== null) window.clearInterval(interval);
    interval = null;
  }

  function paintClock() {
    const remaining = remainingBreakTime(clock, performance.now());
    const seconds = Math.ceil(remaining / 1000);
    timer.textContent = Math.floor(seconds / 60) + ":" + String(seconds % 60).padStart(2, "0");
    timer.setAttribute("aria-label", seconds + " seconds remaining");
    progress.value = durationMs - remaining;
    slip.dataset.phase = clock.phase;
    if (clock.phase === "running" && !remaining) {
      clock = pauseBreakClock(clock, performance.now());
      slip.dataset.phase = "finished";
      stopTicking();
      start.hidden = true;
      status.textContent = "Time's up. Your chaos waited. Take as much extra peace as you like.";
    }
  }

  function pauseTimer(message) {
    if (!clock || clock.phase !== "running") return;
    clock = pauseBreakClock(clock, performance.now());
    stopTicking();
    paintClock();
    start.textContent = "Resume my break";
    start.hidden = clock.phase === "finished";
    status.textContent = clock.phase === "finished" ? "Time's up. Your chaos waited." : message;
  }

  function openTicket(category, trigger) {
    if (revealing || dialog.open) return;
    revealing = true;
    stopTicking();
    lastTrigger = trigger;
    selectedButton = buttons.find((button) => button.dataset.ticket === category.id);
    buttons.forEach((button) => { button.disabled = true; });
    surprise.disabled = true;
    selectedButton.classList.add("is-peeling");
    const reactionDelay = flamingos.react(category.id);
    const previous = lastChallenges.get(category.id);
    const choices = category.challenges.map((_, index) => index).filter((index) => index !== previous);
    const choice = choices[Math.floor(Math.random() * choices.length)];
    lastChallenges.set(category.id, choice);
    const selected = category.challenges[choice];
    clock = createBreakClock(category.seconds);
    durationMs = category.seconds * 1000;
    ticketsTaken += 1;
    title.textContent = category.label;
    prompt.textContent = selected[0];
    challenge.textContent = selected[1];
    number.textContent = "TICKET " + String(ticketsTaken).padStart(3, "0") + " / " + category.seconds + "-SECOND ESCAPE";
    progress.max = durationMs;
    start.hidden = false;
    start.textContent = "Start my " + category.seconds + "-second break";
    done.hidden = false;
    stamp.hidden = true;
    again.textContent = "Choose a different ticket";
    status.textContent = "Your timer is optional. Your break is yours.";
    paintClock();
    window.setTimeout(() => {
      flamingos.setDialogOpen(true);
      dialog.showModal();
      title.focus();
      revealing = false;
      buttons.forEach((button) => { button.disabled = false; });
      surprise.disabled = false;
    }, reducedMotion.matches ? 0 : Math.max(420, reactionDelay));
  }

  buttons.forEach((button) => {
    button.disabled = false;
    button.addEventListener("click", () => openTicket(BREAK_TICKETS.find((ticket) => ticket.id === button.dataset.ticket), button));
  });
  surprise.disabled = false;
  surprise.addEventListener("click", () => openTicket(BREAK_TICKETS[Math.floor(Math.random() * BREAK_TICKETS.length)], surprise));
  start.addEventListener("click", () => {
    if (clock.phase === "running") {
      pauseTimer("Paused. Your break can wait.");
      return;
    }
    clock = startBreakClock(clock, performance.now());
    if (clock.phase !== "running") return;
    start.textContent = "Pause my break";
    status.textContent = "Break in progress. The system can manage without you.";
    paintClock();
    stopTicking();
    interval = window.setInterval(paintClock, 200);
  });
  done.addEventListener("click", () => {
    if (!clock || clock.phase === "complete") return;
    stopTicking();
    clock = completeBreakClock(clock);
    breaksTaken += 1;
    count.textContent = String(breaksTaken).padStart(2, "0");
    slip.dataset.phase = "complete";
    start.hidden = true;
    done.hidden = true;
    stamp.hidden = false;
    again.textContent = "Take another ticket";
    status.textContent = "Break taken. One tiny act of disobedience, beautifully done.";
    again.focus();
  });
  close.addEventListener("click", () => dialog.close());
  again.addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", (event) => { if (event.target === dialog) dialog.close(); });
  dialog.addEventListener("close", () => {
    flamingos.setDialogOpen(false);
    pauseTimer("Paused.");
    stopTicking();
    selectedButton?.classList.remove("is-peeling");
    lastTrigger?.focus({ preventScroll: true });
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) pauseTimer("Paused while you were away. Resume whenever you like.");
  });
  window.addEventListener("pagehide", () => { pauseTimer("Paused."); stopTicking(); });
}

if (typeof document !== "undefined" && document.querySelector("[data-break-game]")) bootBreakGame();
