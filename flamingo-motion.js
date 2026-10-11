const SVG_NS = "http://www.w3.org/2000/svg";
const ATLAS_WIDTH = 1536;
const ATLAS_HEIGHT = 1024;
const SCENERY_URL = new URL("./assets/a305x-break-scenery-v1.webp", import.meta.url).href;
const ATLAS_URL = new URL("./assets/a305x-break-cast-v1.webp", import.meta.url).href;

const CHARACTERS = [
  {
    id: "do-nothing", box: [41, 60, 464, 395], position: [13, 735, 242],
    parts: [
      { name: "hammock-posts", fixed: true, points: "67,60 101,60 113,370 65,370" },
      { name: "hammock-posts", fixed: true, points: "448,140 505,140 477,372 437,372" }
    ]
  },
  {
    id: "sip-slow", box: [597, 10, 359, 504], position: [239, 651, 245],
    parts: [
      { name: "sunhat", pivot: [780, 254], points: "596,10 956,10 956,239 908,257 815,262 734,271 641,255 596,219" },
      { name: "coconut", pivot: [846, 318], points: "877,181 957,181 956,328 918,355 853,347 827,294 832,270 854,238" }
    ]
  },
  { id: "brain-off", box: [1099, 10, 362, 505], position: [425, 661, 230], blink: true },
  { id: "zero-flucks", box: [65, 523, 421, 479], position: [607, 735, 233] },
  {
    id: "leave-earth", box: [628, 511, 343, 486], position: [803, 701, 216],
    parts: [{ name: "bye-wave", pivot: [825, 741], points: "851,546 971,546 971,775 824,775 807,705 851,691" }]
  },
  { id: "ufo", box: [1123, 620, 318, 307], position: [879, 611, 141] }
];

function svgElement(tag, attributes = {}) {
  const element = document.createElementNS(SVG_NS, tag);
  Object.entries(attributes).forEach(([name, value]) => element.setAttribute(name, String(value)));
  return element;
}

function atlasImage(attributes = {}) {
  return svgElement("image", { href: ATLAS_URL, width: ATLAS_WIDTH, height: ATLAS_HEIGHT, ...attributes });
}

function makeCharacter(character) {
  const { id, box, position, parts = [] } = character;
  const [left, top, width] = position;
  const actor = svgElement("svg", {
    viewBox: "0 0 " + box[2] + " " + box[3], class: "flamingo-character", "data-flamingo": id,
    "aria-hidden": "true", focusable: "false"
  });
  actor.style.left = left / 1024 * 100 + "%";
  actor.style.top = top / 1536 * 100 + "%";
  actor.style.width = width / 1024 * 100 + "%";
  actor.style.height = width * box[3] / box[2] / 1536 * 100 + "%";
  const defs = svgElement("defs");
  const body = svgElement("g", { class: "flamingo-body" });
  actor.append(defs, body);
  const actorClipId = "flamingo-" + id + "-cell";
  const actorClip = svgElement("clipPath", { id: actorClipId, clipPathUnits: "userSpaceOnUse" });
  actorClip.append(svgElement("rect", { width: box[2], height: box[3] }));
  defs.append(actorClip);
  const localImage = (attributes = {}) => atlasImage({ x: -box[0], y: -box[1], ...attributes });

  if (parts.length) {
    const maskId = "flamingo-" + id + "-body-mask";
    const mask = svgElement("mask", {
      id: maskId, maskUnits: "userSpaceOnUse", x: 0, y: 0,
      width: box[2], height: box[3], "mask-type": "luminance"
    });
    mask.append(svgElement("rect", { width: box[2], height: box[3], fill: "white" }));
    parts.forEach((part, index) => {
      const points = part.points.split(" ").map((point) => {
        const [x, y] = point.split(",").map(Number);
        return (x - box[0]) + "," + (y - box[1]);
      }).join(" ");
      mask.append(svgElement("polygon", { points, fill: "black" }));
      const clipId = "flamingo-" + id + "-part-" + index;
      const clip = svgElement("clipPath", { id: clipId, clipPathUnits: "userSpaceOnUse" });
      clip.append(svgElement("polygon", { points }));
      defs.append(clip);
      const piece = svgElement("g", { class: "flamingo-part flamingo-" + part.name });
      if (part.pivot) piece.style.transformOrigin = (part.pivot[0] - box[0]) + "px " + (part.pivot[1] - box[1]) + "px";
      const pieceAttributes = { "clip-path": "url(#" + clipId + ")" };
      if (parts.length > index + 1) {
        const partMaskId = clipId + "-overlap-mask";
        const partMask = svgElement("mask", { id: partMaskId, maskUnits: "userSpaceOnUse", x: 0, y: 0, width: box[2], height: box[3], "mask-type": "luminance" });
        partMask.append(svgElement("rect", { width: box[2], height: box[3], fill: "white" }));
        parts.slice(index + 1).forEach((other) => {
          const otherPoints = other.points.split(" ").map((point) => {
            const [x, y] = point.split(",").map(Number);
            return (x - box[0]) + "," + (y - box[1]);
          }).join(" ");
          partMask.append(svgElement("polygon", { points: otherPoints, fill: "black" }));
        });
        defs.append(partMask);
        pieceAttributes.mask = "url(#" + partMaskId + ")";
      }
      piece.append(localImage(pieceAttributes));
      (part.fixed ? actor : body).append(piece);
    });
    defs.append(mask);
    body.prepend(localImage({ mask: "url(#" + maskId + ")", "clip-path": "url(#" + actorClipId + ")" }));
  } else {
    body.append(localImage({ "clip-path": "url(#" + actorClipId + ")" }));
  }

  if (character.blink) {
    const eyelid = svgElement("g", { class: "flamingo-blink" });
    eyelid.append(
      svgElement("ellipse", { cx: 1317 - box[0], cy: 111 - box[1], rx: 20, ry: 14, fill: "#f4a9b6" }),
      svgElement("path", { d: "M202 100 Q218 116 234 100", fill: "none", stroke: "#18151b", "stroke-width": 3.5, "stroke-linecap": "round" })
    );
    body.append(eyelid);
  }
  return actor;
}

export function setupFlamingoMotion(reducedMotion) {
  const art = document.querySelector(".break-art");
  const stage = document.querySelector("[data-flamingo-stage]");
  const control = document.querySelector("[data-flamingo-motion]");
  if (!art || !stage || !control) return { react: () => 0, setDialogOpen: () => {} };
  let ready = false;
  let inView = true;
  let userPaused = false;
  let dialogOpen = false;
  let reactionTimer = null;

  function canMove() {
    return ready && inView && !document.hidden && !userPaused && !dialogOpen && !reducedMotion.matches;
  }

  function clearReaction() {
    if (reactionTimer !== null) window.clearTimeout(reactionTimer);
    reactionTimer = null;
    stage.querySelectorAll(".is-cheering").forEach((actor) => actor.classList.remove("is-cheering"));
  }

  function updateMotion() {
    const playing = canMove();
    stage.classList.toggle("flamingos-paused", !playing);
    art.dataset.flamingoMotion = reducedMotion.matches ? "off" : playing ? "playing" : "paused";
    control.disabled = reducedMotion.matches;
    control.textContent = reducedMotion.matches ? "Motion off" : userPaused ? "Resume flamingos" : "Pause flamingos";
    control.setAttribute("aria-pressed", String(userPaused || reducedMotion.matches));
    if (!playing) clearReaction();
  }

  control.addEventListener("click", () => { userPaused = !userPaused; updateMotion(); });
  reducedMotion.addEventListener("change", updateMotion);
  document.addEventListener("visibilitychange", updateMotion);
  if ("IntersectionObserver" in window) {
    const observer = new IntersectionObserver((entries) => {
      inView = entries[0].isIntersecting;
      updateMotion();
    }, { threshold: .02 });
    observer.observe(art);
  }

  const scenery = new Image();
  const atlas = new Image();
  scenery.src = SCENERY_URL;
  atlas.src = ATLAS_URL;
  Promise.all([scenery.decode(), atlas.decode()]).then(() => {
    const background = document.createElement("img");
    background.src = SCENERY_URL;
    background.className = "flamingo-scenery";
    background.alt = "";
    background.width = 1024;
    background.height = 1536;
    background.draggable = false;
    stage.append(background);
    // The UFO sits behind the waving flamingo.
    [...CHARACTERS].sort((a, b) => Number(b.id === "ufo") - Number(a.id === "ufo"))
      .forEach((character) => stage.append(makeCharacter(character)));
    ready = true;
    stage.hidden = false;
    control.hidden = false;
    updateMotion();
  }).catch(() => {
    // Keep the original complete illustration if either extra asset is unavailable.
    stage.hidden = true;
    control.hidden = true;
  });

  updateMotion();
  return {
    react(id) {
      if (!canMove()) return 0;
      clearReaction();
      stage.querySelector('[data-flamingo="' + id + '"]')?.classList.add("is-cheering");
      if (id === "leave-earth") stage.querySelector('[data-flamingo="ufo"]')?.classList.add("is-cheering");
      reactionTimer = window.setTimeout(clearReaction, 950);
      return 900;
    },
    setDialogOpen(open) { dialogOpen = open; updateMotion(); }
  };
}
