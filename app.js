import { firebaseConfig } from "./firebase-config.js";

const $ = (selector) => document.querySelector(selector);
const els = {
  intro: $("#intro"), create: $("#createButton"), write: $("#writeButton"),
  landing: $("#landingActions"), jarActions: $("#jarActions"), share: $("#shareButton"),
  modal: $("#wishModal"), input: $("#wishInput"), submit: $("#submitWish"),
  close: $("#closeModal"), chars: $("#characterCount"), stars: $("#starLayer"),
  jar: $("#jar"), jarWrap: $("#jarWrap"), empty: $("#emptyPrompt"),
  count: $("#wishCount"), number: $("#wishNumber"), instruction: $("#jarInstruction"),
  topStatus: $("#topStatus"), caption: $("#jarCaption"), toast: $("#toast")
};

const params = new URLSearchParams(location.search);
let jarId = params.get("jar");
let wishes = [];
let firebase = null;
let unsubscribe = null;
let toastTimer;
let physicsFrame = 0;
const palette = ["rose", "peach", "sunshine", "leaf", "sky", "cobalt", "lilac", "coral"];
const starHue = { rose: "295deg", peach: "350deg", sunshine: "15deg", leaf: "110deg", sky: "150deg", cobalt: "190deg", lilac: "245deg", coral: "330deg" };

const firebaseReady = Object.values(firebaseConfig).every((value) => Boolean(value));
if (firebaseReady) {
  const [appSdk, dbSdk] = await Promise.all([
    import("https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js"),
    import("https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js")
  ]);
  const app = appSdk.initializeApp(firebaseConfig);
  const db = dbSdk.getFirestore(app);
  firebase = {
    create: async (id) => dbSdk.setDoc(dbSdk.doc(db, "jars", id), { wishes: [], createdAt: Date.now() }),
    listen: (id, callback) => dbSdk.onSnapshot(dbSdk.doc(db, "jars", id), (snapshot) => callback(snapshot.exists() ? snapshot.data().wishes ?? [] : [])),
    add: async (id, wish) => dbSdk.updateDoc(dbSdk.doc(db, "jars", id), { wishes: dbSdk.arrayUnion(wish) })
  };
}

function localKey(id) { return `wishing-jar:${id}`; }
function readLocal(id) {
  try { return JSON.parse(localStorage.getItem(localKey(id)) || "[]"); }
  catch { return []; }
}
function writeLocal(id, list) { localStorage.setItem(localKey(id), JSON.stringify(list)); }
function makeId() {
  return crypto.randomUUID ? crypto.randomUUID().replaceAll("-", "").slice(0, 12) : Math.random().toString(36).slice(2, 14);
}
function jarUrl(id) {
  const url = new URL(location.href);
  url.searchParams.set("jar", id);
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
  els.share.hidden = false;
  els.topStatus.textContent = "A jar made just for you";
  els.caption.textContent = "Leave something lovely for the next person.";
}
function openModal(readWish = null) {
  const reading = Boolean(readWish);
  $("#noteKicker").textContent = reading ? "A wish from the jar" : "A wish for the jar";
  $("#noteHeading").textContent = reading ? "Someone wished for…" : "What are you wishing for?";
  els.input.value = reading ? readWish.text : "";
  els.input.readOnly = reading;
  els.input.placeholder = "Let it be something good…";
  els.chars.textContent = reading ? "folded with hope" : "0 / 240";
  els.submit.hidden = reading;
  els.modal.classList.add("open");
  els.modal.setAttribute("aria-hidden", "false");
  if (!reading) setTimeout(() => els.input.focus(), 200);
}
function closeModal() {
  els.modal.classList.remove("open");
  els.modal.setAttribute("aria-hidden", "true");
  els.input.readOnly = false;
  els.submit.hidden = false;
}
function starSvg(color, id) {
  const hue = starHue[color] || starHue.rose;
  return `<img class="star-art" src="origami-star.png" alt="" aria-hidden="true" draggable="false" style="--star-hue:${hue}" data-star-id="${id}">`;
}
function renderStars(animateLast = false) {
  els.stars.innerHTML = "";
  const count = wishes.length;
  const maxVisible = 30;
  const visible = wishes.slice(-maxVisible);
  const width = els.stars.clientWidth || 184;
  const height = els.stars.clientHeight || 218;
  const spacingX = 42;
  const spacingY = 31;
  const bodies = [];
  visible.forEach((wish, index) => {
    const originalIndex = count - visible.length + index;
    const row = Math.floor(index / 4);
    const col = index % 4;
    const stagger = row % 2 ? 18 : 0;
    const el = document.createElement("button");
    el.type = "button";
    el.className = "paper-star";
    const size = 48 + ((originalIndex * 17) % 10);
    el.style.width = `${size}px`;
    el.style.height = `${size}px`;
    el.dataset.color = wish.color || "rose";
    el.setAttribute("aria-label", `Read wish ${originalIndex + 1}`);
    const radius = size * 0.44;
    const x = Math.max(radius, Math.min(width - radius, 5 + col * spacingX + stagger + ((originalIndex * 19) % 9)));
    const y = Math.max(radius, height - 28 - (row + 1) * spacingY - ((originalIndex * 11) % 7));
    const falling = animateLast && index === visible.length - 1;
    const body = { x: falling ? width * .5 : x, y: falling ? -radius : y, vx: falling ? (Math.random() - .5) * 1.4 : 0, vy: 0, radius, el, falling, rotation: ((originalIndex * 31) % 34) - 17, spin: falling ? (Math.random() - .5) * 2 : 0 };
    bodies.push(body);
    el.style.left = `${body.x - radius}px`;
    el.style.top = `${body.y - radius}px`;
    el.style.transform = `rotate(${body.rotation}deg)`;
    el.style.zIndex = String(2 + row);
    el.style.animationDelay = `${(index % 7) * 32}ms`;
    el.innerHTML = starSvg(wish.color, originalIndex) + `<span class="star-note">${escapeHtml(wish.text)}</span>`;
    el.addEventListener("click", (event) => { event.stopPropagation(); openModal(wish); });
    els.stars.append(el);
  });
  if (animateLast && bodies.length) runDropPhysics(bodies, width, height);
  els.jarWrap.classList.toggle("empty", count === 0);
  els.jarWrap.classList.toggle("has-wishes", count > 0);
  els.count.textContent = count === 1 ? "one little wish" : count ? `${count} little wishes` : "your wishing jar";
  els.number.textContent = String(count).padStart(2, "0");
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
  showJarView();
  if (firebase) {
    unsubscribe?.();
    unsubscribe = firebase.listen(id, (next) => {
      const fresh = next.filter((wish) => !wishes.some((old) => old.id === wish.id));
      wishes = next;
      renderStars(fresh.length > 0);
    });
  } else {
    wishes = readLocal(id);
    renderStars();
  }
}

els.create.addEventListener("click", async () => {
  const id = makeId();
  if (firebase) await firebase.create(id);
  else writeLocal(id, []);
  history.pushState({}, "", jarUrl(id));
  await initJar(id);
  showToast("Your jar is ready to share ✦");
});
els.write.addEventListener("click", () => openModal());
els.close.addEventListener("click", closeModal);
els.modal.addEventListener("click", (event) => { if (event.target === els.modal) closeModal(); });
document.addEventListener("keydown", (event) => { if (event.key === "Escape") closeModal(); });
els.input.addEventListener("input", () => { els.chars.textContent = `${els.input.value.length} / 240`; });
els.jar.addEventListener("click", () => {
  if (!wishes.length) { if (jarId) openModal(); return; }
  const wish = wishes[Math.floor(Math.random() * wishes.length)];
  openModal(wish);
});
els.jar.addEventListener("keydown", (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); els.jar.click(); } });
els.share.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(jarUrl(jarId));
    showToast("Jar link copied ✦");
  } catch {
    prompt("Copy your wishing jar link", jarUrl(jarId));
  }
});

els.submit.addEventListener("click", async () => {
  const text = els.input.value.trim();
  if (!text) { els.input.focus(); showToast("Every wish starts with a few words"); return; }
  if (!jarId) return;
  const wish = { id: makeId(), text, color: palette[Math.floor(Math.random() * palette.length)], createdAt: Date.now() };
  const note = document.createElement("div");
  note.className = "flight-note";
  note.textContent = text;
  document.body.append(note);
  closeModal();
  els.jar.classList.add("opening");
  requestAnimationFrame(() => note.classList.add("folding"));
  await new Promise((resolve) => setTimeout(resolve, 760));
  note.remove();
  if (firebase) await firebase.add(jarId, wish);
  else {
    wishes = [...readLocal(jarId), wish];
    writeLocal(jarId, wishes);
    renderStars(true);
  }
  els.jar.classList.remove("receiving");
  void els.jar.offsetWidth;
  els.jar.classList.add("receiving");
  showToast("Your wish has found its way ✦");
});

window.addEventListener("storage", (event) => {
  if (jarId && event.key === localKey(jarId) && !firebase) {
    wishes = readLocal(jarId);
    renderStars();
  }
});
window.addEventListener("popstate", () => {
  const id = new URLSearchParams(location.search).get("jar");
  if (id) initJar(id);
  else location.reload();
});

if (jarId) initJar(jarId);
else renderStars();
