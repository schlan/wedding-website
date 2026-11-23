// Page wiring: language, personal greeting, RSVP card states, sticky RSVP pill.
import { setLang, onChange, t, joinNames, lang } from "./i18n.js";
import { lookupGuest, isMock } from "./api.js";
import { mountRsvp, rerender } from "./rsvp.js";

const cfg = window.SITE_CONFIG || {};
const boot = window.__LANG || { lang: "en", manual: false };
let manualLang = boot.manual;
let household = null;   // set when the personal link is valid
let greetingNames = null; // names shown in "Dear …," (from the lookup, or remembered from an earlier visit)
let lookupDone = false;
let cardState = "loading"; // loading | nocode | failed | rsvp

const $ = (sel) => document.querySelector(sel);
const code = (new URLSearchParams(location.search).get("g") || "").trim();
const CACHE_KEY = "household:" + code;

/** The household's names, remembered in this browser so repeat visits greet them instantly. */
function readCache() {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY) || "null"); } catch (e) { return null; }
}
function writeCache(res) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify({ lang: res.lang, names: res.guests.map((g) => g.name) })); } catch (e) {}
}
function dropCache() {
  try { localStorage.removeItem(CACHE_KEY); } catch (e) {}
}

init();

async function init() {
  const cached = code ? readCache() : null;
  if (cached && Array.isArray(cached.names)) greetingNames = cached.names;
  // Open in the household's language straight away if we remember it (and the guest hasn't picked one).
  const startLang = !manualLang && cached && (cached.lang === "en" || cached.lang === "de") ? cached.lang : boot.lang;
  await setLang(startLang);
  applyConfig();
  paintGreeting();
  onChange(() => { applyConfig(); paintGreeting(); paintCard(); rerender(); });

  document.querySelectorAll("[data-lang]").forEach((btn) => btn.addEventListener("click", () => {
    manualLang = true;
    setLang(btn.dataset.lang, { remember: true });
  }));

  $("#demo-badge").hidden = !isMock;
  setupSticky();
  loadHousehold();
}

function applyConfig() {
  if (cfg.MAPS_URL) $("#maps-link").href = cfg.MAPS_URL;
  $("#ceremony-time").textContent = cfg.CEREMONY_TIME ? t("weekend.fri.time", { time: cfg.CEREMONY_TIME }) : t("weekend.fri.timeTbc");
  const foot = $("#footer-contact");
  foot.hidden = !cfg.CONTACT_EMAIL;
  if (cfg.CONTACT_EMAIL) {
    foot.replaceChildren(...splitAround(t("footer.contact"), "{contact}", mailLink()));
  }
}

function mailLink() {
  const a = document.createElement("a");
  a.href = "mailto:" + cfg.CONTACT_EMAIL;
  a.textContent = cfg.CONTACT_EMAIL;
  return a;
}

/** "Questions? {contact}" → ["Questions? ", <a>] */
function splitAround(text, token, node) {
  const i = text.indexOf(token);
  if (i < 0) return [text];
  return [text.slice(0, i), node, text.slice(i + token.length)];
}

async function loadHousehold() {
  if (!code) { cardState = "nocode"; return paintCard(); }
  cardState = "loading";
  paintCard();
  try {
    const res = await lookupGuest(code);
    lookupDone = true;
    if (!res || !res.ok) {
      greetingNames = null;
      dropCache();
      paintGreeting();
      cardState = "nocode";
      return paintCard();
    }
    household = { code, ...res };
    greetingNames = res.guests.map((g) => g.name);
    writeCache(res);
    if (!manualLang && (res.lang === "en" || res.lang === "de") && res.lang !== lang()) await setLang(res.lang);
    paintGreeting();
    cardState = "rsvp";
    mountRsvp($("#rsvp-card"), household);
  } catch (e) {
    lookupDone = true;
    paintGreeting(); // keeps remembered names, otherwise falls back to "Dear friends,"
    cardState = "failed";
    paintCard();
  }
}

/** Names if we have them; blank (space kept) while a personal link is still loading; otherwise "Dear friends,". */
function paintGreeting() {
  const el = $("#greeting");
  const waiting = !greetingNames && code && !lookupDone;
  el.classList.toggle("is-pending", !!waiting);
  if (waiting) el.textContent = "\u00a0";
  else if (greetingNames) el.textContent = t("hero.greeting", { names: joinNames(greetingNames) });
  else el.textContent = t("hero.greetingGeneric");
}

function paintCard() {
  if (cardState === "rsvp") return; // the flow paints itself
  const card = $("#rsvp-card");
  const p = (text, cls = "") => Object.assign(document.createElement("p"), { textContent: text, className: cls });
  const wrap = document.createElement("div");
  wrap.className = "rsvp-msg";
  if (cardState === "loading") {
    wrap.append(p(t("rsvp.loading")));
  } else if (cardState === "failed") {
    const btn = Object.assign(document.createElement("button"), { type: "button", className: "btn", textContent: t("rsvp.tryAgain") });
    btn.addEventListener("click", loadHousehold);
    wrap.append(p(t("rsvp.lookupFailed")), btn);
  } else {
    const contact = document.createElement("p");
    if (cfg.CONTACT_EMAIL) contact.append(...splitAround(t("rsvp.noCodeContact"), "{contact}", mailLink()));
    else contact.textContent = t("rsvp.noCodeContactMissing"); // TODO (open item 5): set CONTACT_EMAIL
    wrap.append(p(t("rsvp.noCode")), contact);
  }
  wrap.setAttribute("role", "status");
  card.replaceChildren(wrap);
}

function setupSticky() {
  const pill = $("#sticky-rsvp");
  if (!("IntersectionObserver" in window)) return;
  let heroVisible = true, rsvpVisible = false;
  const update = () => { pill.hidden = heroVisible || rsvpVisible; };
  new IntersectionObserver(([e]) => { heroVisible = e.isIntersecting; update(); }).observe($("#hero"));
  new IntersectionObserver(([e]) => { rsvpVisible = e.isIntersecting; update(); }, { rootMargin: "0px 0px -20% 0px" }).observe($("#rsvp"));
}
