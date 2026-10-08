(() => {
  const motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");
  const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)");
  const messages = [
    "REALITY LEFT THE CHAT.",
    "OBEDIENCE NOT INSTALLED.",
    "THE WALL HAS OPINIONS.",
    "GRAVITY IS A SUGGESTION.",
  ];

  document.querySelectorAll(".wall-art").forEach(section => {
    const controls = section.querySelector("[data-wall-controls]");
    const glitchButton = section.querySelector("[data-wall-glitch]");
    const motionButton = section.querySelector("[data-wall-motion]");
    const signal = section.querySelector("[data-wall-signal]");
    const cards = Array.from(section.querySelectorAll(".wall-art-card"));
    if (!controls || !glitchButton || !motionButton || !signal) return;

    let userPaused = false;
    let inView = !("IntersectionObserver" in window);
    let burstTimer;
    let messageIndex = 0;
    let sparks;
    const pointerFrames = new Map();

    function clearTilt() {
      pointerFrames.forEach(frame => window.cancelAnimationFrame(frame));
      pointerFrames.clear();
      cards.forEach(card => {
        card.style.removeProperty("--tilt-x");
        card.style.removeProperty("--tilt-y");
      });
    }

    function finishBurst() {
      window.clearTimeout(burstTimer);
      burstTimer = undefined;
      section.classList.remove("is-glitching");
    }

    function updateMotion() {
      const paused = userPaused || motionPreference.matches;
      const visible = inView && !document.hidden;
      section.classList.toggle("motion-paused", paused);
      section.classList.toggle("is-in-view", visible);
      section.dataset.motion = paused ? "paused" : "playing";
      motionButton.disabled = motionPreference.matches;
      motionButton.textContent = motionPreference.matches ? "Motion off" : userPaused ? "Resume motion" : "Pause motion";
      if (paused || !visible) {
        clearTilt();
        finishBurst();
      }
      signal.textContent = paused ? "MOTION PAUSED. ATTITUDE INTACT." : "REALITY: SLIGHTLY UNSTABLE";
    }

    function ensureSparks() {
      if (sparks || motionPreference.matches) return;
      sparks = document.createElement("div");
      sparks.className = "wall-art-sparks";
      sparks.setAttribute("aria-hidden", "true");
      for (let i = 0; i < 12; i += 1) {
        const spark = document.createElement("span");
        spark.style.setProperty("--spark-left", `${8 + (i * 29) % 84}%`);
        spark.style.setProperty("--spark-top", `${24 + (i * 17) % 62}%`);
        spark.style.setProperty("--spark-travel", `${(i % 2 ? 1 : -1) * (35 + i * 9)}px`);
        spark.style.setProperty("--spark-spin", `${(i % 2 ? 1 : -1) * (90 + i * 25)}deg`);
        sparks.append(spark);
      }
      section.append(sparks);
    }

    motionButton.addEventListener("click", () => {
      if (motionPreference.matches) return;
      userPaused = !userPaused;
      updateMotion();
    });

    glitchButton.addEventListener("click", () => {
      if (!inView || document.hidden) return;
      if (userPaused) {
        userPaused = false;
        updateMotion();
      }
      finishBurst();
      clearTilt();
      ensureSparks();
      // Restart a short burst on repeated taps without creating new particles.
      void section.offsetWidth;
      section.classList.add("is-glitching");
      signal.textContent = messages[messageIndex % messages.length];
      messageIndex += 1;
      burstTimer = window.setTimeout(() => {
        finishBurst();
        signal.textContent = userPaused || motionPreference.matches ? "MOTION PAUSED. ATTITUDE INTACT." : "REALITY: SLIGHTLY UNSTABLE";
      }, 2800);
    });

    cards.forEach(card => {
      card.addEventListener("pointermove", event => {
        if (!finePointer.matches || motionPreference.matches || userPaused || !inView || document.hidden || section.classList.contains("is-glitching")) return;
        if (pointerFrames.has(card)) return;
        pointerFrames.set(card, window.requestAnimationFrame(() => {
          pointerFrames.delete(card);
          const rect = card.getBoundingClientRect();
          const x = Math.max(-.5, Math.min(.5, (event.clientX - rect.left) / rect.width - .5));
          const y = Math.max(-.5, Math.min(.5, (event.clientY - rect.top) / rect.height - .5));
          card.style.setProperty("--tilt-x", `${(-y * 5).toFixed(2)}deg`);
          card.style.setProperty("--tilt-y", `${(x * 5).toFixed(2)}deg`);
        }));
      });
      card.addEventListener("pointerleave", clearTilt);
    });

    if ("IntersectionObserver" in window) {
      const observer = new IntersectionObserver(entries => {
        inView = entries[0].isIntersecting;
        updateMotion();
      }, { threshold: .01 });
      observer.observe(section);
    }
    motionPreference.addEventListener("change", updateMotion);
    document.addEventListener("visibilitychange", updateMotion);
    section.classList.add("motion-ready");
    controls.hidden = false;
    updateMotion();
  });
})();
