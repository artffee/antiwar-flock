const menuButton = document.querySelector(".menu-button");
const siteNav = document.querySelector(".site-nav");
const header = document.querySelector("[data-header]");
const year = document.querySelector("[data-year]");
const revealItems = document.querySelectorAll(".reveal");
const tiltTarget = document.querySelector("[data-tilt]");

if (year) {
  year.textContent = String(new Date().getFullYear());
}

function closeMenu() {
  if (!menuButton || !siteNav) return;
  menuButton.setAttribute("aria-expanded", "false");
  siteNav.classList.remove("is-open");
}

if (menuButton && siteNav) {
  menuButton.addEventListener("click", () => {
    const shouldOpen = menuButton.getAttribute("aria-expanded") !== "true";
    menuButton.setAttribute("aria-expanded", String(shouldOpen));
    siteNav.classList.toggle("is-open", shouldOpen);
  });

  siteNav.querySelectorAll("a").forEach((link) => link.addEventListener("click", closeMenu));

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeMenu();
      menuButton.focus();
    }
  });
}

let lastScrollY = window.scrollY;
let ticking = false;

function updateHeader() {
  if (header) {
    header.classList.toggle("is-compact", window.scrollY > 36);
  }
  lastScrollY = window.scrollY;
  ticking = false;
}

window.addEventListener(
  "scroll",
  () => {
    if (!ticking && window.scrollY !== lastScrollY) {
      window.requestAnimationFrame(updateHeader);
      ticking = true;
    }
  },
  { passive: true },
);

if ("IntersectionObserver" in window) {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      });
    },
    { rootMargin: "0px 0px -10%", threshold: 0.08 },
  );

  revealItems.forEach((item, index) => {
    item.style.transitionDelay = `${Math.min(index % 3, 2) * 80}ms`;
    observer.observe(item);
  });
} else {
  revealItems.forEach((item) => item.classList.add("is-visible"));
}

const hasFinePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

if (tiltTarget && hasFinePointer && !reducedMotion) {
  tiltTarget.addEventListener("pointermove", (event) => {
    const bounds = tiltTarget.getBoundingClientRect();
    const x = (event.clientX - bounds.left) / bounds.width - 0.5;
    const y = (event.clientY - bounds.top) / bounds.height - 0.5;
    tiltTarget.style.transform = `perspective(900px) rotateX(${-y * 2.4}deg) rotateY(${x * 2.4}deg)`;
  });

  tiltTarget.addEventListener("pointerleave", () => {
    tiltTarget.style.transform = "";
  });
}
