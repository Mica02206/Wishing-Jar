import { firebaseConfig } from "./firebase-config.js";

const $ = (selector) => document.querySelector(selector);
const els = {
  intro: $("#intro"), create: $("#createButton"),
  landing: $("#landingActions"), jarActions: $("#jarActions"),
  palette: $("#notePalette"), tray: $("#silverTray"), trayDrafts: $("#trayDrafts"), stage: $(".stage"),
  modal: $("#wishModal"), input: $("#wishInput"), submit: $("#submitWish"),
  close: $("#closeModal"), chars: $("#characterCount"), stars: $("#starLayer"),
  jar: $("#jar"), jarWrap: $("#jarWrap"), empty: $("#emptyPrompt"),
  count: $("#wishCount"), number: $("#wishNumber"),
  jarNameLabel: $("#jarNameLabel"),
  finishShare: $("#finishShareButton"),
  caption: $("#jarCaption"), toast: $("#toast")
};

const params = new URLSearchParams(location.search);
let jarId = params.get("jar");
let jarName = "My wishing jar";
let readOnly = params.get("view") === "readonly";
let wishes = [];
let drafts = [];
let firebase = null;
let unsubscribe = null;
let toastTimer;
let physicsFrame = 0;
let composingColor = null;
let editingDraftId = null;
let activeDrag = null;
let activeObjectDrag = null;
let suppressNextClick = false;
const palette = ["rose", "peach", "sunshine", "leaf", "sky", "cobalt", "lilac", "coral"];
const starHue = { rose: "295deg", peach: "350deg", sunshine: "15deg", leaf: "110deg", sky: "150deg", cobalt: "190deg", lilac: "245deg", coral: "330deg" };
const noteTheme = {
  rose: { paper: "#f5a7c4", hue: "270deg" }, peach: { paper: "#ffd09a", hue: "335deg" },
  sunshine: { paper: "#ffe68a", hue: "0deg" }, leaf: { paper: "#b8e2b6", hue: "92deg" },
  sky: { paper: "#a8e3e8", hue: "145deg" }, cobalt: { paper: "#b4c6f5", hue: "175deg" },
  lilac: { paper: "#d9b9e8", hue: "225deg" }, coral: { paper: "#ffb0a1", hue: "310deg" }
};

const firebaseReady = Object.values(firebaseConfig).every((value) => Boolean(value));
if (firebaseReady) {
  const [appSdk, dbSdk] = await Promise.all([
    import("https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js"),
    import("https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js")
  ]);
  const app = appSdk.initializeApp(firebaseConfig);
  const db = dbSdk.getFirestore(app);
  firebase = {
    create: async (id) => dbSdk.setDoc(dbSdk.doc(db, "jars", id), { name: jarName, wishes: [], createdAt: Date.now() }),
    listen: (id, callback) => dbSdk.onSnapshot(dbSdk.doc(db, "jars", id), (snapshot) => callback(snapshot.exists() ? snapshot.data() : { name: "My wishing jar", wishes: [] })),
    add: async (id, wish) => dbSdk.updateDoc(dbSdk.doc(db, "jars", id), { wishes: dbSdk.arrayUnion(wish) }),
    remove: async (id, wish) => dbSdk.updateDoc(dbSdk.doc(db, "jars", id), { wishes: dbSdk.arrayRemove(wish) }),
    rename: async (id, name) => dbSdk.updateDoc(dbSdk.doc(db, "jars", id), { name })
  };
}

function localKey(id) { return `wishing-jar:${id}`; }
function draftKey(id) { return `wishing-jar-drafts:${id}`; }
function nameKey(id) { return `wishing-jar-name:${id}`; }
function readLocal(id) {
  try { return JSON.parse(localStorage.getItem(localKey(id)) || "[]"); }
  catch { return []; }
}
function readDrafts(id) {
  try { return JSON.parse(localStorage.getItem(draftKey(id)) || "[]"); }
  catch { return []; }
}
function writeLocal(id, list) { localStorage.setItem(localKey(id), JSON.stringify(list)); }
function writeDrafts() { if (jarId) localStorage.setItem(draftKey(jarId), JSON.stringify(drafts)); }
function writeJarName() {
  if (!jarId) return;
  els.jarNameLabel.textContent = jarName;
  document.title = `${jarName} — wishing jar`;
}
function makeId() {
  return crypto.randomUUID ? crypto.randomUUID().replaceAll("-", "").slice(0, 12) : Math.random().toString(36).slice(2, 14);
}
function jarUrl(id, readOnlyLink = false) {
  const url = new URL(location.href);
  url.searchParams.set("jar", id);
  if (readOnlyLink) {
    url.searchParams.set("view", "readonly");
    url.searchParams.set("title", jarName);
  } else {
    url.searchParams.delete("view");
    url.searchParams.delete("title");
  }
  return url.toString();
}
function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => els.toast.classList.remove("show"), 2500);
}
function showJarView() {
  els.landing.hidden = true;
  els.jarActions.hidden = false;
  els.stage.classList.add("has-jar");
  els.stage.classList.toggle("read-only-view", readOnly);
  els.finishShare.hidden = readOnly;
  els.caption.textContent = "Tap a star to read";
}
function openModal(readWish = null, selectedColor = null, draftWish = null) {
  if (readOnly && !readWish) return;
  const reading = Boolean(readWish);
  const editing = Boolean(draftWish);
  const currentWish = readWish || draftWish;
  composingColor = currentWish ? (currentWish.color || "rose") : (selectedColor || palette[Math.floor(Math.random() * palette.length)]);
  editingDraftId = editing ? draftWish.id : null;
  const theme = noteTheme[composingColor] || noteTheme.rose;
  els.modal.style.setProperty("--note-paper", theme.paper);
  els.modal.style.setProperty("--note-hue", theme.hue);
  $("#noteKicker").textContent = reading ? "A wish from the jar" : "A wish for the jar";
  $("#noteHeading").textContent = reading ? "A wish" : editing ? "Edit your wish" : "Write a wish";
  els.input.value = currentWish ? currentWish.text : "";
  els.input.readOnly = reading;
  els.input.placeholder = "";
  els.chars.textContent = reading ? "" : "0 / 240";
  els.submit.hidden = reading;
  els.modal.classList.toggle("reading", reading);
  els.chars.textContent = reading ? "" : `${els.input.value.length} / 240`;
  els.modal.classList.add("open");
  els.modal.setAttribute("aria-hidden", "false");
  if (!reading) setTimeout(() => els.input.focus(), 200);
}
function closeModal() {
  els.modal.classList.remove("open");
  els.modal.setAttribute("aria-hidden", "true");
  els.input.readOnly = false;
  els.submit.hidden = false;
  editingDraftId = null;
}
function starSvg(color, id) {
  const hue = starHue[color] || starHue.rose;
  return `<img class="star-art" src="origami-star.png" alt="" aria-hidden="true" draggable="false" style="--star-hue:${hue}" data-star-id="${id}">`;
}
function seededRandom(seedText) {
  let seed = 2166136261;
  for (const char of seedText) seed = Math.imul(seed ^ char.charCodeAt(0), 16777619);
  return () => {
    seed += 0x6D2B79F5;
    let value = seed;
    value = Math.imul(value ^ value >>> 15, value | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}
function renderStars(animateLast = false) {
  els.stars.innerHTML = "";
  const count = wishes.length;
  const maxVisible = 30;
  const visible = wishes.slice(-maxVisible);
  const width = els.stars.clientWidth || 184;
  const height = els.stars.clientHeight || 218;
  const bodies = [];
  visible.forEach((wish, index) => {
    const originalIndex = count - visible.length + index;
    const row = Math.floor(index / 4);
    const random = seededRandom(wish.id || wish.text);
    const el = document.createElement("button");
    el.type = "button";
    el.className = "paper-star";
    const size = 48 + ((originalIndex * 17) % 10);
    el.style.width = `${size}px`;
    el.style.height = `${size}px`;
    el.dataset.color = wish.color || "rose";
    el.setAttribute("aria-label", `Read wish ${originalIndex + 1}`);
    const radius = size * 0.44;
    let x = radius;
    let y = height - radius - 5 - row * 30;
    for (let attempt = 0; attempt < 16; attempt += 1) {
      const candidateX = radius + random() * Math.max(1, width - radius * 2);
      const candidateY = Math.max(radius, Math.min(height - radius, y + (random() - .5) * 22));
      const clear = bodies.every((other) => Math.hypot(candidateX - other.x, candidateY - other.y) > radius + other.radius - 12);
      x = candidateX;
      y = candidateY;
      if (clear) break;
    }
    const falling = animateLast && index === visible.length - 1;
    const body = { x: falling ? width * .5 : x, y: falling ? -radius : y, vx: falling ? (Math.random() - .5) * 1.4 : 0, vy: 0, radius, el, falling, rotation: (random() - .5) * 42, spin: falling ? (Math.random() - .5) * 2 : 0 };
    bodies.push(body);
    el.style.left = `${body.x - radius}px`;
    el.style.top = `${body.y - radius}px`;
    el.style.transform = `rotate(${body.rotation}deg)`;
    el.style.zIndex = String(2 + row);
    el.style.animationDelay = `${(index % 7) * 32}ms`;
    el.innerHTML = starSvg(wish.color, originalIndex) + `<span class="star-note">${escapeHtml(wish.text)}</span>`;
    el.addEventListener("click", (event) => {
      event.stopPropagation();
      if (suppressNextClick) { suppressNextClick = false; return; }
      openModal(wish);
    });
    wireStarDrag(el, wish, "jar");
    els.stars.append(el);
  });
  if (animateLast && bodies.length) runDropPhysics(bodies, width, height);
  els.jarWrap.classList.toggle("empty", count === 0);
  els.count.textContent = count === 1 ? "one little wish" : count ? `${count} little wishes` : "your wishing jar";
  els.number.textContent = String(count).padStart(2, "0");
}
function renderTray() {
  els.tray.classList.toggle("has-drafts", drafts.length > 0);
  els.trayDrafts.innerHTML = "";
  drafts.slice(-8).forEach((wish, index) => {
    const random = seededRandom(wish.id);
    const spots = [[16, 15], [86, 3], [46, 42], [143, 19], [117, 41], [9, 38], [156, 42], [66, 25]];
    const el = document.createElement("button");
    el.type = "button";
    el.className = "tray-draft";
    el.style.left = `${spots[index][0] + (random() - .5) * 7}px`;
    el.style.top = `${spots[index][1] + (random() - .5) * 7}px`;
    el.style.transform = `rotate(${(random() - .5) * 34}deg)`;
    el.setAttribute("aria-label", `Edit draft: ${wish.text}`);
    el.title = wish.text;
    el.innerHTML = starSvg(wish.color, wish.id);
    el.addEventListener("click", (event) => {
      event.stopPropagation();
      if (suppressNextClick) { suppressNextClick = false; return; }
      openModal(null, null, wish);
    });
    wireStarDrag(el, wish, "tray");
    els.trayDrafts.append(el);
  });
}
function wireStarDrag(element, wish, origin) {
  element.addEventListener("pointerdown", (event) => {
    if (event.button !== undefined && event.button !== 0) return;
    event.preventDefault();
    const rect = element.getBoundingClientRect();
    const ghost = element.cloneNode(true);
    ghost.classList.add("drag-ghost");
    ghost.style.width = `${rect.width}px`;
    ghost.style.height = `${rect.height}px`;
    ghost.style.left = `${rect.left}px`;
    ghost.style.top = `${rect.top}px`;
    ghost.style.transform = "scale(1.08) rotate(8deg)";
    document.body.append(ghost);
    element.classList.add("dragging-source");
    activeDrag = { pointerId: event.pointerId, origin, wish, element, ghost, x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY, moved: false };
  });
}
function wireMovable(element) {
  element.addEventListener("pointerdown", (event) => {
    if (activeDrag || (event.button !== undefined && event.button !== 0)) return;
    if (event.target.closest("button, a, textarea, input, .paper-star, .tray-draft, .note-color")) return;
    const rect = element.getBoundingClientRect();
    activeObjectDrag = {
      pointerId: event.pointerId, element, startX: event.clientX, startY: event.clientY,
      rect, x: Number(element.dataset.moveX || 0), y: Number(element.dataset.moveY || 0), moved: false
    };
  });
}
wireMovable(els.jarWrap);
wireMovable(els.tray);
window.addEventListener("pointermove", (event) => {
  const drag = activeObjectDrag;
  if (!drag || event.pointerId !== drag.pointerId) return;
  const dx = event.clientX - drag.startX;
  const dy = event.clientY - drag.startY;
  if (!drag.moved && Math.hypot(dx, dy) > 6) {
    drag.moved = true;
    drag.element.classList.add("dragging-object");
  }
  if (!drag.moved) return;
  event.preventDefault();
  const bounds = els.stage.getBoundingClientRect();
  const scale = drag.rect.width / Math.max(drag.element.offsetWidth, 1) || 1;
  const minX = drag.rect.width > bounds.width ? bounds.left + bounds.width / 2 - (drag.rect.left + drag.rect.width / 2) : bounds.left - drag.rect.left;
  const maxX = drag.rect.width > bounds.width ? minX : bounds.right - drag.rect.right;
  const minY = drag.rect.height > bounds.height ? bounds.top + bounds.height / 2 - (drag.rect.top + drag.rect.height / 2) : bounds.top - drag.rect.top;
  const maxY = drag.rect.height > bounds.height ? minY : bounds.bottom - drag.rect.bottom;
  const screenX = Math.max(minX, Math.min(maxX, dx));
  const screenY = Math.max(minY, Math.min(maxY, dy));
  drag.element.dataset.moveX = String(drag.x + screenX / scale);
  drag.element.dataset.moveY = String(drag.y + screenY / scale);
  drag.element.style.translate = `${drag.element.dataset.moveX}px ${drag.element.dataset.moveY}px`;
});
window.addEventListener("pointerup", (event) => {
  const drag = activeObjectDrag;
  if (!drag || event.pointerId !== drag.pointerId) return;
  activeObjectDrag = null;
  drag.element.classList.remove("dragging-object");
  if (drag.moved) {
    suppressNextClick = true;
    setTimeout(() => { suppressNextClick = false; }, 150);
  }
});
window.addEventListener("pointercancel", (event) => {
  if (!activeObjectDrag || event.pointerId !== activeObjectDrag.pointerId) return;
  activeObjectDrag.element.classList.remove("dragging-object");
  activeObjectDrag = null;
});
function pointIn(rect, x, y) { return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom; }
window.addEventListener("pointermove", (event) => {
  if (!activeDrag || event.pointerId !== activeDrag.pointerId) return;
  const drag = activeDrag;
  drag.x = event.clientX;
  drag.y = event.clientY;
  if (!drag.moved && Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) > 7) {
    drag.moved = true;
    drag.element.classList.add("dragging-source");
  }
  if (!drag.moved) return;
  event.preventDefault();
  drag.ghost.style.left = `${event.clientX - drag.ghost.offsetWidth / 2}px`;
  drag.ghost.style.top = `${event.clientY - drag.ghost.offsetHeight / 2}px`;
  const destination = drag.origin === "tray" ? els.jar : els.tray;
  const hovering = pointIn(destination.getBoundingClientRect(), event.clientX, event.clientY);
  destination.classList.toggle("drop-target", hovering);
});
window.addEventListener("pointerup", async (event) => {
  if (!activeDrag || event.pointerId !== activeDrag.pointerId) return;
  const drag = activeDrag;
  activeDrag = null;
  drag.ghost.remove();
  drag.element.classList.remove("dragging-source");
  els.jar.classList.remove("drop-target");
  els.tray.classList.remove("drop-target");
  if (!drag.moved) return;
  suppressNextClick = true;
  setTimeout(() => { suppressNextClick = false; }, 100);
  const destination = drag.origin === "tray" ? els.jar : els.tray;
  if (!pointIn(destination.getBoundingClientRect(), event.clientX, event.clientY)) return;
  if (drag.origin === "tray") await moveDraftIntoJar(drag.wish);
  else await moveWishToTray(drag.wish);
});
window.addEventListener("pointercancel", () => {
  if (!activeDrag) return;
  activeDrag.ghost.remove();
  activeDrag.element.classList.remove("dragging-source");
  els.jar.classList.remove("drop-target");
  els.tray.classList.remove("drop-target");
  activeDrag = null;
});
async function moveDraftIntoJar(wish) {
  try {
    els.jar.classList.add("opening");
    if (firebase) await firebase.add(jarId, wish);
    else {
      wishes = [...readLocal(jarId), wish];
      writeLocal(jarId, wishes);
      renderStars(true);
    }
    drafts = drafts.filter((draft) => draft.id !== wish.id);
    writeDrafts();
    renderTray();
    showToast("Wish tucked into the jar");
  } catch (error) {
    els.jar.classList.remove("opening");
    showToast("That wish could not be added yet");
  }
}
async function moveWishToTray(wish) {
  try {
    if (firebase) await firebase.remove(jarId, wish);
    else {
      wishes = wishes.filter((item) => item.id !== wish.id);
      writeLocal(jarId, wishes);
    }
    wishes = wishes.filter((item) => item.id !== wish.id);
    drafts.push(wish);
    writeDrafts();
    renderStars();
    renderTray();
    showToast("Wish moved to the tray to edit");
  } catch (error) {
    showToast("That wish could not be moved yet");
  }
}
function runDropPhysics(bodies, width, height) {
  cancelAnimationFrame(physicsFrame);
  const active = bodies.filter((body) => body.falling);
  let frames = 0;
  const gravity = 0.48;
  const step = () => {
    let moving = false;
    for (const body of active) {
      body.vy = Math.min(body.vy + gravity, 10);
      body.x += body.vx;
      body.y += body.vy;
      body.rotation += body.spin;
      if (body.x < body.radius) { body.x = body.radius; body.vx = Math.abs(body.vx) * 0.45; }
      if (body.x > width - body.radius) { body.x = width - body.radius; body.vx = -Math.abs(body.vx) * 0.45; }
      if (body.y > height - body.radius) { body.y = height - body.radius; body.vy = -Math.abs(body.vy) * 0.2; body.vx *= 0.78; }
      for (const other of bodies) {
        if (other === body) continue;
        const dx = body.x - other.x;
        const dy = body.y - other.y;
        const distance = Math.hypot(dx, dy) || 0.001;
        const minDistance = body.radius + other.radius - 8;
        if (distance < minDistance) {
          const nx = dx / distance;
          const ny = dy / distance;
          const overlap = minDistance - distance;
          body.x += nx * overlap;
          body.y += ny * overlap;
          const impact = body.vx * nx + body.vy * ny;
          if (impact < 0) { body.vx -= 1.45 * impact * nx; body.vy -= 1.45 * impact * ny; }
        }
      }
      body.vx *= 0.992;
      body.vy *= 0.995;
      body.spin *= 0.985;
      body.el.style.left = `${body.x - body.radius}px`;
      body.el.style.top = `${body.y - body.radius}px`;
      body.el.style.transform = `rotate(${body.rotation}deg)`;
      if (Math.abs(body.vx) > 0.08 || Math.abs(body.vy) > 0.16 || body.y < height - body.radius - 1) moving = true;
    }
    frames += 1;
    if (moving && frames < 220) physicsFrame = requestAnimationFrame(step);
    else {
      active.forEach((body) => { body.falling = false; body.vx = 0; body.vy = 0; });
      els.jar.classList.remove("receiving");
      void els.jar.offsetWidth;
      els.jar.classList.add("receiving");
      setTimeout(() => els.jar.classList.remove("opening"), 850);
    }
  };
  physicsFrame = requestAnimationFrame(step);
}
function escapeHtml(text) { return text.replace(/[&<>"']/g, (char) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[char])); }

async function initJar(id) {
  jarId = id;
  readOnly = new URLSearchParams(location.search).get("view") === "readonly";
  jarName = localStorage.getItem(nameKey(id)) || new URLSearchParams(location.search).get("title") || "My wishing jar";
  drafts = readDrafts(id);
  writeJarName();
  showJarView();
  if (firebase) {
    unsubscribe?.();
    unsubscribe = firebase.listen(id, (data) => {
      const next = Array.isArray(data) ? data : (data.wishes ?? []);
      if (data.name) {
        jarName = data.name;
        localStorage.setItem(nameKey(id), jarName);
        writeJarName();
      }
      const fresh = next.filter((wish) => !wishes.some((old) => old.id === wish.id));
      wishes = next;
      renderStars(fresh.length > 0);
    });
  } else {
    wishes = readLocal(id);
    renderStars();
  }
  renderTray();
}

els.create.addEventListener("click", async () => {
  const id = makeId();
  jarName = "My wishing jar";
  readOnly = false;
  localStorage.setItem(nameKey(id), jarName);
  if (firebase) await firebase.create(id);
  else writeLocal(id, []);
  history.pushState({}, "", jarUrl(id));
  await initJar(id);
  showToast("Your jar is ready to share ✦");
});
els.palette.addEventListener("click", (event) => {
  if (readOnly) return;
  const note = event.target.closest("[data-note-color]");
  if (note) openModal(null, note.dataset.noteColor);
});
els.close.addEventListener("click", closeModal);
els.modal.addEventListener("click", (event) => { if (event.target === els.modal) closeModal(); });
document.addEventListener("keydown", (event) => { if (event.key === "Escape") closeModal(); });
els.input.addEventListener("input", () => { els.chars.textContent = `${els.input.value.length} / 240`; });
els.jar.addEventListener("click", () => {
  if (suppressNextClick) { suppressNextClick = false; return; }
  if (!wishes.length) { showToast("Choose a paper from the tray"); return; }
  const wish = wishes[Math.floor(Math.random() * wishes.length)];
  openModal(wish);
});
els.jar.addEventListener("keydown", (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); els.jar.click(); } });
els.finishShare.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(jarUrl(jarId, true));
    showToast("Finished jar link copied");
  } catch {
    prompt("Copy your finished jar link", jarUrl(jarId, true));
  }
});

els.submit.addEventListener("click", async () => {
  if (readOnly) return;
  const text = els.input.value.trim();
  if (!text) { els.input.focus(); showToast("Every wish starts with a few words"); return; }
  if (!jarId) return;
  const priorDraft = drafts.find((draft) => draft.id === editingDraftId);
  const wish = priorDraft
    ? { ...priorDraft, text, color: composingColor || priorDraft.color }
    : { id: makeId(), text, color: composingColor || "rose", createdAt: Date.now() };
  const note = document.createElement("div");
  note.className = "flight-note";
  const theme = noteTheme[wish.color] || noteTheme.rose;
  note.style.setProperty("--note-paper", theme.paper);
  note.style.setProperty("--note-hue", theme.hue);
  note.innerHTML = `<span class="flight-copy">${escapeHtml(text)}</span><img class="flight-star" src="origami-star.png" alt="" aria-hidden="true" style="--star-hue:${starHue[wish.color] || starHue.rose}">`;
  document.body.append(note);
  closeModal();
  const trayRect = els.tray.getBoundingClientRect();
  const startX = window.innerWidth / 2;
  const startY = window.innerHeight / 2;
  const flightX = trayRect.left + trayRect.width / 2 - startX;
  const flightY = trayRect.top + trayRect.height / 2 - startY;
  note.style.setProperty("--flight-x", `${flightX}px`);
  note.style.setProperty("--flight-y", `${flightY}px`);
  note.style.setProperty("--flight-x-mid", `${flightX * .38}px`);
  note.style.setProperty("--flight-y-mid", `${flightY * .38}px`);
  requestAnimationFrame(() => note.classList.add("folding"));
  await new Promise((resolve) => setTimeout(resolve, 1320));
  note.remove();
  if (priorDraft) drafts = drafts.map((draft) => draft.id === wish.id ? wish : draft);
  else drafts = [...drafts, wish];
  writeDrafts();
  renderTray();
  showToast("Draft ready — drag its star into the jar");
});

window.addEventListener("storage", (event) => {
  if (jarId && event.key === localKey(jarId) && !firebase) {
    wishes = readLocal(jarId);
    renderStars();
  }
  if (jarId && event.key === nameKey(jarId) && !firebase) {
    jarName = localStorage.getItem(nameKey(jarId)) || "My wishing jar";
    writeJarName();
  }
});
window.addEventListener("popstate", () => {
  const id = new URLSearchParams(location.search).get("jar");
  if (id) initJar(id);
  else location.reload();
});

if (jarId) initJar(jarId);
else renderStars();
