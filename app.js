// =====================================================================
// World PC — app logic
// Firebase (Firestore) for shared data · d3-geo for the globe
// =====================================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import {
  getFirestore, collection, doc, setDoc, deleteDoc, onSnapshot,
  serverTimestamp, getDocs,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

// ---------------------------------------------------------------------
// Firebase
// ---------------------------------------------------------------------
const fbApp = initializeApp(firebaseConfig);
const db = getFirestore(fbApp);
const visitsCol = collection(db, "visits");

// ---------------------------------------------------------------------
// People
// ---------------------------------------------------------------------
const PEOPLE = [
  { id: "paksy",  name: "Paksy",  color: "#c9447a", icon: "assets/icons/paksy.jpg" },
  { id: "brian",  name: "Brian",  color: "#3a6ca8", icon: "assets/icons/brian.jpg" },
  { id: "allard", name: "Allard", color: "#b0402e", icon: "assets/icons/allard.jpg" },
  { id: "vosse",  name: "Vosse",  color: "#2b6b4a", icon: "assets/icons/vosse.jpg" },
];
const personById = Object.fromEntries(PEOPLE.map((p) => [p.id, p]));

// A link can open straight to one person's map with ?as=paksy (etc).
// Falls back to whichever person this device last used, then to Vosse.
const urlPerson = new URLSearchParams(location.search).get("as");
let activePerson = (urlPerson && personById[urlPerson])
  ? urlPerson
  : (localStorage.getItem("worldpc_person") || "vosse");
if (!personById[activePerson]) activePerson = "vosse";
if (urlPerson && personById[urlPerson]) {
  localStorage.setItem("worldpc_person", urlPerson);
}

// visits state, kept live from Firestore
// visitsByPerson: { personId: Set(countryId) }
// visitMeta: { "personId_countryId": {countryName} }
const visitsByPerson = Object.fromEntries(PEOPLE.map((p) => [p.id, new Set()]));
const visitMeta = {};

// ---------------------------------------------------------------------
// Reference data
// ---------------------------------------------------------------------
let COUNTRIES = [];       // [{id, a2, name, flag}]
let countryById = {};
let world = null;         // topojson
let countryFeatures = []; // geojson features with .id = alpha3

async function loadData() {
  const [countriesRes, worldRes] = await Promise.all([
    fetch("data/countries.json").then((r) => r.json()),
    fetch("data/world-110m.json").then((r) => r.json()),
  ]);
  COUNTRIES = countriesRes;
  countryById = Object.fromEntries(COUNTRIES.map((c) => [c.id, c]));
  world = worldRes;
  const geo = topojson.feature(world, world.objects.world);
  countryFeatures = geo.features.filter((f) => countryById[f.id]);
}

// ---------------------------------------------------------------------
// Toast
// ---------------------------------------------------------------------
let toastTimer = null;
function toast(msg) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 2200);
}

// =====================================================================
// GLOBE
// =====================================================================
const svg = d3.select("#globe-svg");
let projection, geoPath, gCountries, gGraticule, gSphere;
let rotation = [10, -18];
let autoRotate = true;
let lastInteraction = 0;

function buildGlobe() {
  const wrap = document.querySelector(".globe-wrap");
  const size = wrap.clientWidth;
  svg.attr("viewBox", `0 0 ${size} ${size}`);

  const r = size / 2 - 4;
  projection = d3.geoOrthographic()
    .scale(r)
    .translate([size / 2, size / 2])
    .rotate(rotation)
    .clipAngle(90);
  geoPath = d3.geoPath(projection);

  svg.selectAll("*").remove();

  const defs = svg.append("defs");
  const grad = defs.append("radialGradient")
    .attr("id", "oceanGrad")
    .attr("cx", "38%").attr("cy", "32%").attr("r", "75%");
  grad.append("stop").attr("offset", "0%").attr("stop-color", "#1c5a44");
  grad.append("stop").attr("offset", "55%").attr("stop-color", "#0c3a2c");
  grad.append("stop").attr("offset", "100%").attr("stop-color", "#061224");

  gSphere = svg.append("path")
    .datum({ type: "Sphere" })
    .attr("fill", "url(#oceanGrad)")
    .attr("d", geoPath);

  gGraticule = svg.append("path")
    .datum(d3.geoGraticule10())
    .attr("fill", "none")
    .attr("stroke", "rgba(201,162,74,0.18)")
    .attr("stroke-width", 0.6)
    .attr("d", geoPath);

  gCountries = svg.append("g")
    .selectAll("path")
    .data(countryFeatures)
    .join("path")
    .attr("class", "country-path")
    .attr("stroke", "rgba(241,231,208,0.35)")
    .attr("stroke-width", 0.5)
    .attr("d", geoPath)
    .style("cursor", "pointer");

  // outer rim glow
  svg.append("path")
    .datum({ type: "Sphere" })
    .attr("fill", "none")
    .attr("stroke", "rgba(231,205,142,0.55)")
    .attr("stroke-width", 1.5)
    .attr("d", geoPath);

  colorCountries();
  wirePointerRotation(wrap, size);
}

function colorCountries() {
  const visited = visitsByPerson[activePerson] || new Set();
  const color = personById[activePerson].color;
  gCountries
    .attr("fill", (d) => (visited.has(d.id) ? color : "rgba(241,231,208,0.07)"))
    .attr("fill-opacity", (d) => (visited.has(d.id) ? 0.92 : 1));
}

function renderGlobeFrame() {
  projection.rotate(rotation);
  gSphere.attr("d", geoPath);
  gGraticule.attr("d", geoPath);
  gCountries.attr("d", geoPath);
}

// ---- pointer drag rotation with inertia + idle auto-rotate ----
function wirePointerRotation(wrap, size) {
  let dragging = false;
  let last = null;
  let velocity = [0, 0];
  let moved = false;
  let downAt = 0, downPos = null;

  function pointFromEvent(e) {
    const rect = wrap.getBoundingClientRect();
    return [e.clientX - rect.left, e.clientY - rect.top];
  }

  wrap.addEventListener("pointerdown", (e) => {
    dragging = true;
    autoRotate = false;
    moved = false;
    downAt = performance.now();
    last = pointFromEvent(e);
    downPos = last;
    velocity = [0, 0];
    wrap.setPointerCapture(e.pointerId);
  });

  wrap.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    const p = pointFromEvent(e);
    const dx = p[0] - last[0];
    const dy = p[1] - last[1];
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) moved = true;
    const k = 220 / size;
    rotation[0] += dx * k;
    rotation[1] = clamp(rotation[1] - dy * k, -90, 90);
    velocity = [dx * k, -dy * k];
    last = p;
    renderGlobeFrame();
  });

  function endDrag(e) {
    if (!dragging) return;
    dragging = false;
    lastInteraction = performance.now();

    const dt = performance.now() - downAt;
    const dd = downPos ? Math.hypot(e.clientX - wrap.getBoundingClientRect().left - downPos[0],
                                     e.clientY - wrap.getBoundingClientRect().top - downPos[1]) : 999;
    if (!moved && dt < 450) {
      handleTap(e);
    } else {
      inertiaSpin();
    }
  }

  wrap.addEventListener("pointerup", endDrag);
  wrap.addEventListener("pointercancel", endDrag);

  function inertiaSpin() {
    let vx = velocity[0], vy = velocity[1];
    function step() {
      vx *= 0.94; vy *= 0.94;
      if (Math.abs(vx) < 0.01 && Math.abs(vy) < 0.01) {
        scheduleAutoRotate();
        return;
      }
      rotation[0] += vx;
      rotation[1] = clamp(rotation[1] - vy, -90, 90);
      renderGlobeFrame();
      requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  function handleTap(e) {
    const target = document.elementFromPoint(e.clientX, e.clientY);
    if (target && target.classList.contains("country-path")) {
      const d = d3.select(target).datum();
      onCountryTap(d.id, e.clientX, e.clientY);
    }
    scheduleAutoRotate();
  }
}

function scheduleAutoRotate() {
  lastInteraction = performance.now();
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

// idle auto-rotate loop
let lastFrameT = performance.now();
function tick(t) {
  const dt = t - lastFrameT;
  lastFrameT = t;
  if (projection && t - lastInteraction > 3500) {
    rotation[0] += dt * 0.006;
    renderGlobeFrame();
  }
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);

// ---------------------------------------------------------------------
// Tooltip + tap-to-add / tap-to-view-photos
// ---------------------------------------------------------------------
const tooltipEl = document.getElementById("globe-tooltip");
let tooltipTimer = null;

function onCountryTap(countryId, clientX, clientY) {
  const c = countryById[countryId];
  if (!c) return;
  const visited = visitsByPerson[activePerson].has(countryId);
  const wrapRect = document.querySelector(".globe-wrap").getBoundingClientRect();
  tooltipEl.innerHTML = `${c.flag} <strong>${c.name}</strong> &nbsp; <button class="tt-action" id="tt-action">${visited ? "Photos" : "+ Add"}</button>`;
  tooltipEl.style.left = `${clientX - wrapRect.left}px`;
  tooltipEl.style.top = `${clientY - wrapRect.top}px`;
  tooltipEl.hidden = false;
  clearTimeout(tooltipTimer);
  tooltipTimer = setTimeout(() => { tooltipEl.hidden = true; }, 3200);

  document.getElementById("tt-action").onclick = () => {
    tooltipEl.hidden = true;
    if (visited) {
      openCountryModal(countryId);
    } else {
      addCountry(countryId);
    }
  };
}

// =====================================================================
// FIRESTORE — visits
// =====================================================================
function visitDocId(person, countryId) { return `${person}_${countryId}`; }

async function addCountry(countryId) {
  const c = countryById[countryId];
  if (!c) return;
  const id = visitDocId(activePerson, countryId);
  try {
    await setDoc(doc(visitsCol, id), {
      person: activePerson,
      country: countryId,
      countryName: c.name,
      addedAt: serverTimestamp(),
    });
    toast(`${c.flag} ${c.name} added for ${personById[activePerson].name}`);
  } catch (err) {
    console.error(err);
    toast("Couldn't save — check your connection");
  }
}

async function removeCountry(countryId) {
  const c = countryById[countryId];
  const id = visitDocId(activePerson, countryId);
  try {
    // best-effort cleanup of any photos first
    const photosSnap = await getDocs(collection(db, "visits", id, "photos"));
    await Promise.all(photosSnap.docs.map((d) => deleteDoc(d.ref)));
    await deleteDoc(doc(visitsCol, id));
    toast(`${c ? c.name : "Country"} removed`);
  } catch (err) {
    console.error(err);
    toast("Couldn't remove — check your connection");
  }
}

function subscribeVisits() {
  onSnapshot(visitsCol, (snap) => {
    for (const p of PEOPLE) visitsByPerson[p.id].clear();
    for (const key in visitMeta) delete visitMeta[key];

    snap.forEach((d) => {
      const v = d.data();
      if (!visitsByPerson[v.person]) return;
      visitsByPerson[v.person].add(v.country);
      visitMeta[d.id] = v;
    });

    colorCountries();
    renderLeaderboard();
    renderCounts();
    if (document.getElementById("search-input").value.trim() !== "") {
      renderSearchResults(document.getElementById("search-input").value);
    }
  }, (err) => {
    console.error(err);
    toast("Offline — showing last known data");
  });
}

// =====================================================================
// UI — top bar / person switcher
// =====================================================================
function setActivePerson(id) {
  activePerson = id;
  localStorage.setItem("worldpc_person", id);
  document.getElementById("person-toggle-icon").src = personById[id].icon;
  document.getElementById("active-name").textContent = personById[id].name;
  document.querySelectorAll(".person-row").forEach((row) => {
    row.classList.toggle("active", row.dataset.person === id);
  });
  colorCountries();
  renderCounts();
  renderSearchResults(document.getElementById("search-input").value);
}

function renderCounts() {
  document.getElementById("active-count").textContent = visitsByPerson[activePerson].size;
  for (const p of PEOPLE) {
    const el = document.querySelector(`[data-count="${p.id}"]`);
    if (el) el.textContent = visitsByPerson[p.id].size;
  }
}

function wireTopbar() {
  const toggle = document.getElementById("person-toggle");
  const menu = document.getElementById("person-menu");
  const backdrop = document.getElementById("person-menu-backdrop");

  function openMenu() {
    menu.hidden = false;
    backdrop.hidden = false;
    toggle.setAttribute("aria-expanded", "true");
  }
  function closeMenu() {
    menu.hidden = true;
    backdrop.hidden = true;
    toggle.setAttribute("aria-expanded", "false");
  }
  toggle.addEventListener("click", () => (menu.hidden ? openMenu() : closeMenu()));
  backdrop.addEventListener("click", closeMenu);

  document.querySelectorAll(".person-row").forEach((row) => {
    row.addEventListener("click", () => {
      setActivePerson(row.dataset.person);
      closeMenu();
    });
  });
}

// =====================================================================
// LEADERBOARD
// =====================================================================
function renderLeaderboard() {
  const list = document.getElementById("leaderboard-list");
  const ranked = [...PEOPLE].sort((a, b) => visitsByPerson[b.id].size - visitsByPerson[a.id].size);
  const romans = ["I", "II", "III", "IV"];
  list.innerHTML = ranked.map((p, i) => `
    <li class="lb-row" style="border-color:${p.color}66">
      <span class="lb-rank">${romans[i]}</span>
      <span class="lb-ring" style="border-color:${p.color}"><img src="${p.icon}" alt="" /></span>
      <span class="lb-name">${p.name}</span>
      <span>
        <span class="lb-count">${visitsByPerson[p.id].size}</span>
        <span class="lb-count-label">countries</span>
      </span>
    </li>
  `).join("");
}

// =====================================================================
// SEARCH
// =====================================================================
function renderSearchResults(query) {
  const q = query.trim().toLowerCase();
  const list = q === ""
    ? COUNTRIES
    : COUNTRIES.filter((c) => c.name.toLowerCase().includes(q));
  const el = document.getElementById("search-results");

  if (list.length === 0) {
    el.innerHTML = `<li class="sr-empty">No country matches &ldquo;${escapeHtml(query)}&rdquo;</li>`;
    return;
  }

  const visited = visitsByPerson[activePerson];
  el.innerHTML = list.map((c) => `
    <li class="sr-row">
      <span class="sr-flag">${c.flag}</span>
      <span class="sr-name">${c.name}</span>
      <button class="sr-btn ${visited.has(c.id) ? "added" : ""}" data-id="${c.id}">
        ${visited.has(c.id) ? "Added" : "Add"}
      </button>
    </li>
  `).join("");

  el.querySelectorAll(".sr-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.id;
      if (visited.has(id)) removeCountry(id); else addCountry(id);
    });
  });
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function wireSearch() {
  const input = document.getElementById("search-input");
  input.addEventListener("input", () => renderSearchResults(input.value));
  renderSearchResults("");
}

// =====================================================================
// COUNTRY / PHOTO MODAL
// =====================================================================
let modalCountryId = null;
let modalUnsubscribe = null;

function openCountryModal(countryId) {
  modalCountryId = countryId;
  const c = countryById[countryId];
  document.getElementById("modal-flag").textContent = c.flag;
  document.getElementById("modal-country-name").textContent = c.name;
  document.getElementById("country-modal").hidden = false;
  document.getElementById("modal-backdrop").hidden = false;
  renderModalPhotos();
}

function closeCountryModal() {
  document.getElementById("country-modal").hidden = true;
  document.getElementById("modal-backdrop").hidden = true;
  modalCountryId = null;
  if (modalUnsubscribe) { modalUnsubscribe(); modalUnsubscribe = null; }
}

function renderModalPhotos() {
  if (!modalCountryId) return;
  const visitId = visitDocId(activePerson, modalCountryId);
  const grid = document.getElementById("modal-photo-grid");
  grid.innerHTML = "";
  if (modalUnsubscribe) modalUnsubscribe();
  modalUnsubscribe = onSnapshot(collection(db, "visits", visitId, "photos"), (snap) => {
    grid.innerHTML = snap.docs.map((d) => `
      <div class="mp-item">
        <img src="${d.data().dataUrl}" alt="" />
        <button class="mp-del" data-id="${d.id}">&times;</button>
      </div>
    `).join("");
    grid.querySelectorAll(".mp-del").forEach((btn) => {
      btn.addEventListener("click", async () => {
        await deleteDoc(doc(db, "visits", visitId, "photos", btn.dataset.id));
      });
    });
  });
}

async function handlePhotoUpload(file) {
  if (!modalCountryId || !file) return;
  toast("Adding photo…");
  try {
    const dataUrl = await compressImage(file, 900, 0.72);
    const visitId = visitDocId(activePerson, modalCountryId);
    await setDoc(doc(collection(db, "visits", visitId, "photos")), {
      dataUrl,
      addedAt: serverTimestamp(),
    });
    toast("Photo added");
  } catch (err) {
    console.error(err);
    toast("Couldn't add photo");
  }
}

function compressImage(file, maxDim, quality) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();
    reader.onload = () => { img.src = reader.result; };
    reader.onerror = reject;
    img.onload = () => {
      let { width, height } = img;
      if (width > height && width > maxDim) { height *= maxDim / width; width = maxDim; }
      else if (height > maxDim) { width *= maxDim / height; height = maxDim; }
      const canvas = document.createElement("canvas");
      canvas.width = width; canvas.height = height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function wireModal() {
  document.getElementById("modal-close").addEventListener("click", closeCountryModal);
  document.getElementById("modal-backdrop").addEventListener("click", closeCountryModal);
  document.getElementById("modal-photo-input").addEventListener("change", (e) => {
    const file = e.target.files[0];
    handlePhotoUpload(file);
    e.target.value = "";
  });
}

// =====================================================================
// SWIPE TRACK (leaderboard | globe | search)
// =====================================================================
function wireTrack() {
  const track = document.getElementById("track");
  const dots = document.querySelectorAll(".dot");
  let page = 1; // 0 leaderboard, 1 globe, 2 search
  let widthPx = track.parentElement.clientWidth;

  function setPage(p) {
    page = clamp(p, 0, 2);
    dragOffset = 0;
    track.style.transition = "";
    track.classList.remove("dragging");
    track.style.transform = `translateX(${-page * widthPx}px)`;
    dots.forEach((d, i) => d.classList.toggle("active", i === page));
  }

  let dragging = false, startX = 0, dragOffset = 0, startedOnControl = false;

  track.addEventListener("pointerdown", (e) => {
    // ignore drags starting on interactive globe / inputs
    if (e.target.closest(".globe-wrap") || e.target.closest("input") || e.target.closest("button")) {
      startedOnControl = true;
      return;
    }
    startedOnControl = false;
    dragging = true;
    startX = e.clientX;
    track.setPointerCapture(e.pointerId);
  });
  track.addEventListener("pointermove", (e) => {
    if (!dragging || startedOnControl) return;
    dragOffset = startX - e.clientX;
    track.style.transition = "none";
    track.classList.add("dragging");
    track.style.transform = `translateX(${-page * widthPx - dragOffset}px)`;
  });
  function endTrackDrag() {
    if (!dragging) return;
    dragging = false;
    track.classList.remove("dragging");
    if (Math.abs(dragOffset) > widthPx * 0.18) {
      setPage(page + (dragOffset > 0 ? 1 : -1));
    } else {
      setPage(page);
    }
    dragOffset = 0;
  }
  track.addEventListener("pointerup", endTrackDrag);
  track.addEventListener("pointercancel", endTrackDrag);

  document.getElementById("nav-left").addEventListener("click", () => setPage(page - 1));
  document.getElementById("nav-right").addEventListener("click", () => setPage(page + 1));
  dots.forEach((d) => d.addEventListener("click", () => setPage(Number(d.dataset.dot))));

  window.addEventListener("resize", () => {
    widthPx = track.parentElement.clientWidth;
    setPage(page);
  });

  setPage(1);
}

// =====================================================================
// BOOT
// =====================================================================
async function boot() {
  await loadData();

  document.getElementById("person-toggle-icon").src = personById[activePerson].icon;
  document.getElementById("active-name").textContent = personById[activePerson].name;
  document.querySelectorAll(".person-row").forEach((row) => {
    row.classList.toggle("active", row.dataset.person === activePerson);
  });

  wireTopbar();
  wireTrack();
  wireSearch();
  wireModal();
  buildGlobe();
  subscribeVisits();

  let resizeTimer = null;
  window.addEventListener("resize", () => {
    if (document.getElementById("app").hidden) return;
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(buildGlobe, 150);
  });

  document.getElementById("splash").addEventListener("click", enterApp, { once: true });
}

let entered = false;
function enterApp() {
  if (entered) return;
  entered = true;
  const splash = document.getElementById("splash");
  splash.style.opacity = "0";
  splash.style.transition = "opacity 260ms ease";
  setTimeout(() => { splash.hidden = true; }, 260);
  document.getElementById("app").hidden = false;
  // #app was display:none until now, so the globe's container had no
  // real size when buildGlobe() first ran — rebuild it now that it does.
  buildGlobe();
  window.dispatchEvent(new Event("resize"));
}

boot();
