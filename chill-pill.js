/* PASS THE CHILL PILL / 36 original A305X challenges */
(() => {
  const cards = [
  {
    "title": "COFFEE BETRAYAL",
    "prompt": "Apologize to your coffee for cheating on it with tea.",
    "question": "Was the tea decaf?"
  },
  {
    "title": "WI-FI BREAKUP",
    "prompt": "Give a dramatic breakup speech to your Wi-Fi.",
    "question": "Can you still be friends on Bluetooth?"
  },
  {
    "title": "UBER FLAMINGO",
    "prompt": "Explain why a flamingo was fired from Uber.",
    "question": "Was it the one-star honking?"
  },
  {
    "title": "SECRET SOCK",
    "prompt": "Convince everyone your missing sock is a secret agent.",
    "question": "What is its code name?"
  },
  {
    "title": "LATE-NIGHT TV",
    "prompt": "Sell the Chill Pill like an overexcited shopping-channel presenter.",
    "question": "Does it come in emotional support pink?"
  },
  {
    "title": "OCEAN OUT OF ORDER",
    "prompt": "As a customer-service flamingo, explain why the ocean is closed today.",
    "question": "Can I speak to the tide manager?"
  },
  {
    "title": "TOASTER RESIGNATION",
    "prompt": "Give your toaster a formal resignation speech.",
    "question": "Who will lead the breakfast department?"
  },
  {
    "title": "MIAMI WEATHER",
    "prompt": "Report a Miami forecast with a 90 percent chance of flying sandwiches.",
    "question": "Are the sandwiches toasted?"
  },
  {
    "title": "FRIDGE POLITICS",
    "prompt": "Give a campaign speech to become president of the refrigerator.",
    "question": "What is your policy on expired yogurt?"
  },
  {
    "title": "PIGEON AIRLINES",
    "prompt": "Be a flight attendant on an airline run entirely by pigeons.",
    "question": "Is the baggage allowance one breadcrumb?"
  },
  {
    "title": "LEFT SHOE LAWYER",
    "prompt": "Defend your left shoe in court. It is accused of squeaking in public.",
    "question": "Where was the right shoe that night?"
  },
  {
    "title": "BANANA INTERVIEW",
    "prompt": "Interview a banana for a very serious office job.",
    "question": "Can it work under peeling pressure?"
  },
  {
    "title": "MONDAY COMPLAINT",
    "prompt": "Call the Universe complaint line and demand a refund for Monday.",
    "question": "Do you still have the cosmic receipt?"
  },
  {
    "title": "VACUUM SECRET",
    "prompt": "Give a press conference admitting your vacuum is scared of dust.",
    "question": "Has it considered a desk job?"
  },
  {
    "title": "NOBEL NAP",
    "prompt": "Accept a major scientific award for inventing the afternoon nap.",
    "question": "What inspired your horizontal research?"
  },
  {
    "title": "GPS THERAPY",
    "prompt": "As a dramatic GPS, explain why you are tired of saying recalculating.",
    "question": "Do you know where you are going in life?"
  },
  {
    "title": "ALARM APOLOGY",
    "prompt": "As an alarm clock, apologize for ruining everyone's morning.",
    "question": "Why do you scream before coffee?"
  },
  {
    "title": "ALIEN CHECK-IN",
    "prompt": "Check an alien into a Miami hotel with extremely strange requests.",
    "question": "Will it need parking for the saucer?"
  },
  {
    "title": "GHOST RENTAL",
    "prompt": "Advertise a haunted apartment where the ghost does the dishes.",
    "question": "Does the ghost pay utilities?"
  },
  {
    "title": "PASSWORD CAT",
    "prompt": "Teach a cat how to choose a secure password.",
    "question": "Is meow123 really that bad?"
  },
  {
    "title": "ROBOT DATE",
    "prompt": "Introduce a nervous robot to its date: a very elegant toaster.",
    "question": "Did it bring flowers or spare batteries?"
  },
  {
    "title": "FLAMINGO MAYOR",
    "prompt": "As a flamingo mayor, announce a ban on boring shoes.",
    "question": "Do flip-flops count as a political statement?"
  },
  {
    "title": "PLASTIC BAG OPERA",
    "prompt": "Give a dramatic monologue as a plastic bag trying to escape the wind.",
    "question": "What was your finest grocery moment?"
  },
  {
    "title": "BATTERY SPEECH",
    "prompt": "Give a motivational speech to a phone with one percent battery.",
    "question": "Is it time to say goodbye to the group chat?"
  },
  {
    "title": "CACTUS INFLUENCER",
    "prompt": "Promote your luxury skincare routine as a cactus influencer.",
    "question": "How do you achieve that prickly glow?"
  },
  {
    "title": "UMBRELLA INTERVIEW",
    "prompt": "Interview an umbrella that only opens after the rain stops.",
    "question": "How do you explain that gap on your resume?"
  },
  {
    "title": "PRINTER CRISIS",
    "prompt": "Be a printer dramatically refusing to print one final page.",
    "question": "Will it help if we promise new ink?"
  },
  {
    "title": "LAUNDRY LUXURY",
    "prompt": "Pitch an enormous laundry pile as a luxury mountain resort.",
    "question": "Does the sock suite have a view?"
  },
  {
    "title": "SWAMP TOUR",
    "prompt": "Give a fancy museum tour of your kitchen sink.",
    "question": "Is that spoon part of the permanent collection?"
  },
  {
    "title": "FLAMINGO BOUNCER",
    "prompt": "As a nightclub flamingo, deny entry to an overly confident seagull.",
    "question": "What exactly is wrong with its shoes?"
  },
  {
    "title": "MOON NEIGHBOR",
    "prompt": "Introduce yourself to your new next-door neighbor on the Moon.",
    "question": "Can they lend you a cup of gravity?"
  },
  {
    "title": "SOFA CEO",
    "prompt": "As a sofa CEO, announce a bold new plan to lose more remote controls.",
    "question": "Will the cushions receive a bonus?"
  },
  {
    "title": "CELEBRITY SNEEZE",
    "prompt": "Announce your latest celebrity scandal: you sneezed at a houseplant.",
    "question": "Will the fern accept a public apology?"
  },
  {
    "title": "CARROT COACH",
    "prompt": "Give a sports pep talk to a team of exhausted carrots.",
    "question": "Can the potatoes join the starting lineup?"
  },
  {
    "title": "OFFICIAL PAUSE",
    "prompt": "Announce that you are appointing yourself Minister of Doing Nothing.",
    "question": "When does the mandatory nap period start?"
  },
  {
    "title": "THE CHILL EXPERT",
    "prompt": "Teach a serious masterclass on staying calm when your socks are wet.",
    "question": "What if only one sock is wet?"
  }
];
  const setup = document.querySelector('#pill-setup');
  if (!setup) return;
  const byId = id => document.getElementById(id);
  const count = byId('pill-count');
  const nameFields = [...byId('pill-names').querySelectorAll('input')];
  const roundPanel = byId('pill-round');
  const resultPanel = byId('pill-result');
  const start = byId('pill-start');
  const success = byId('pill-success');
  const laugh = byId('pill-laugh');
  const pass = byId('pill-pass');
  let players = [];
  let active = [];
  let position = 0;
  let round = 1;
  let finalRound = false;
  let tieBreak = false;
  let deck = [];
  let remaining = 30000;
  let deadline = 0;
  let interval = null;
  let phase = 'setup';

  function stopClock() {
    clearInterval(interval);
    interval = null;
  }

  function paintClock() {
    const seconds = Math.max(0, Math.ceil(remaining / 1000));
    byId('pill-timer').textContent = String(seconds).padStart(2, '0');
    byId('pill-timer').setAttribute('aria-label', `${seconds} seconds remaining`);
  }

  function tick() {
    remaining = Math.max(0, deadline - performance.now());
    paintClock();
    if (remaining === 0) {
      stopClock();
      phase = 'finished';
      start.textContent = 'Time’s up!';
      start.disabled = true;
      success.disabled = false;
      byId('pill-timer-status').textContent = 'Did you keep it together? Score your turn.';
    }
  }

  function shuffledDeck() {
    const fresh = cards.map((_, i) => i);
    for (let i = fresh.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [fresh[i], fresh[j]] = [fresh[j], fresh[i]];
    }
    return fresh;
  }

  function paintScores(target, current = -1) {
    target.replaceChildren();
    players.forEach((player, index) => {
      const row = document.createElement('div');
      row.className = `chill-player-score${index === current ? ' is-current' : ''}`;
      if (index === current) row.setAttribute('aria-current', 'true');
      const name = document.createElement('span');
      const score = document.createElement('strong');
      name.textContent = player.name;
      score.textContent = `${player.score} ${player.score === 1 ? 'point' : 'points'}`;
      row.append(name, score);
      target.append(row);
    });
  }

  function deal() {
    stopClock();
    if (!deck.length) deck = shuffledDeck();
    const number = deck.pop();
    const card = cards[number];
    remaining = 30000;
    phase = 'reading';
    paintClock();
    start.disabled = false;
    start.textContent = 'Start 30 seconds';
    success.disabled = true;
    byId('pill-card-number').textContent = `${String(number + 1).padStart(2, '0')} / 36`;
    byId('pill-card-title').textContent = card.title;
    byId('pill-card-prompt').textContent = card.prompt;
    byId('pill-card-question').textContent = card.question;
    byId('pill-turn').textContent = `${players[active[position]].name}, take the pill.`;
    byId('pill-round-label').textContent = tieBreak ? `TIEBREAKER ${round}` : `${finalRound ? 'FINAL' : 'ROUND'} ${round}`;
    byId('pill-timer-status').textContent = finalRound ? 'Final round: everyone gets equal turns.' : 'Read the card, then start the timer.';
    paintScores(byId('pill-scoreboard'), active[position]);
    byId('pill-turn').focus({preventScroll: true});
  }

  function showWinner(index) {
    phase = 'result';
    roundPanel.hidden = true;
    resultPanel.hidden = false;
    byId('pill-winner').textContent = `${players[index].name} wins.`;
    byId('pill-result-copy').textContent = `${players[index].score} points. A very serious champion of very serious nonsense.`;
    paintScores(byId('pill-final-scores'));
    byId('pill-winner').focus({preventScroll: true});
  }

  function scoreTurn(points) {
    if (!['reading', 'running', 'paused', 'finished'].includes(phase)) return;
    if (points === 1 && phase !== 'finished') return;
    stopClock();
    const player = players[active[position]];
    player.score += points;
    if (!tieBreak && player.score >= 5) finalRound = true;
    position++;
    if (position === active.length) {
      position = 0;
      if (finalRound || tieBreak) {
        const highest = Math.max(...active.map(i => players[i].score));
        const leaders = active.filter(i => players[i].score === highest);
        if (leaders.length === 1) {
          showWinner(leaders[0]);
          return;
        }
        active = leaders;
        round = tieBreak ? round + 1 : 1;
        tieBreak = true;
      } else round++;
    }
    deal();
  }

  function reset() {
    stopClock();
    phase = 'setup';
    players = [];
    deck = [];
    setup.hidden = false;
    roundPanel.hidden = true;
    resultPanel.hidden = true;
    byId('pill-setup-error').hidden = true;
    nameFields[0].focus({preventScroll: true});
  }

  count.addEventListener('change', () => {
    nameFields.forEach((field, index) => {
      const visible = index < Number(count.value);
      field.parentElement.hidden = !visible;
      field.disabled = !visible;
      field.required = visible;
    });
  });

  setup.addEventListener('submit', event => {
    event.preventDefault();
    const names = nameFields.slice(0, Number(count.value)).map(field => field.value.trim());
    const error = byId('pill-setup-error');
    if (names.some(name => !name) || new Set(names.map(name => name.toLowerCase())).size !== names.length) {
      error.textContent = 'Give each player a different, non-empty name.';
      error.hidden = false;
      return;
    }
    error.hidden = true;
    players = names.map(name => ({name, score: 0}));
    active = players.map((_, index) => index);
    position = 0;
    round = 1;
    finalRound = false;
    tieBreak = false;
    deck = shuffledDeck();
    setup.hidden = true;
    resultPanel.hidden = true;
    roundPanel.hidden = false;
    deal();
  });

  start.addEventListener('click', () => {
    if (phase === 'running') {
      remaining = Math.max(0, deadline - performance.now());
      stopClock();
      if (remaining === 0) { tick(); return; }
      phase = 'paused';
      paintClock();
      start.textContent = 'Resume timer';
      byId('pill-timer-status').textContent = 'Paused. Take a breath, then continue.';
    } else if (phase === 'reading' || phase === 'paused') {
      phase = 'running';
      deadline = performance.now() + remaining;
      start.textContent = 'Pause timer';
      byId('pill-timer-status').textContent = 'Stay in character. Your friends may ask one question each.';
      interval = setInterval(tick, 100);
      tick();
    }
  });

  success.addEventListener('click', () => scoreTurn(1));
  laugh.addEventListener('click', () => scoreTurn(0));
  pass.addEventListener('click', () => scoreTurn(0));
  document.querySelectorAll('[data-pill-reset]').forEach(button => button.addEventListener('click', reset));
  window.addEventListener('pagehide', stopClock);
})();
