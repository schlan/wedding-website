// Text and language handling. All visible text comes from i18n/<lang>.json.
const LOCALES = { en: "en-GB", de: "de-DE" };
const cache = {};
let strings = {};
let current = "en";
const listeners = [];

export const lang = () => current;
export const locale = () => LOCALES[current];

async function load(l) {
  if (!cache[l]) {
    cache[l] = fetch(`i18n/${l}.json`, { credentials: "same-origin" }).then((r) => {
      if (!r.ok) throw new Error(`i18n ${l}: ${r.status}`);
      return r.json();
    });
  }
  return cache[l];
}

/** t("rsvp.stepOf", { n: 2 }) → "Step 2 of 7". Missing keys fall back to English, then the key. */
export function t(key, vars) {
  let s = lookup(strings, key);
  if (typeof s !== "string") s = lookup(cache.__en || {}, key);
  if (typeof s !== "string") return key;
  return vars ? s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : s;
}

function lookup(obj, key) {
  return key.split(".").reduce((o, k) => (o && typeof o === "object" ? o[k] : undefined), obj);
}

/** Long date for a yyyy-mm-dd string: "Thursday 3 June" / "Donnerstag, 3. Juni". */
export function longDate(iso) {
  return new Intl.DateTimeFormat(locale(), { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(iso + "T12:00:00Z"));
}

/** Short date for chips: "Thu 3" / "Do., 3.". */
export function shortDate(iso) {
  return new Intl.DateTimeFormat(locale(), { weekday: "short", day: "numeric", timeZone: "UTC" }).format(new Date(iso + "T12:00:00Z"));
}

/** "Aoife", "Aoife & Ciarán", "Aoife, Ciarán & Niamh". */
export function joinNames(names) {
  const n = names.filter(Boolean);
  if (n.length <= 1) return n.join("");
  return n.slice(0, -1).join(", ") + " & " + n[n.length - 1];
}

/** Fills every [data-i18n] and [data-i18n-attr="attr:key;attr2:key2"] under root. */
export function apply(root = document) {
  root.querySelectorAll("[data-i18n]").forEach((el) => { el.textContent = t(el.dataset.i18n); });
  root.querySelectorAll("[data-i18n-attr]").forEach((el) => {
    el.dataset.i18nAttr.split(";").forEach((pair) => {
      const [attr, key] = pair.split(":");
      if (attr && key) el.setAttribute(attr.trim(), t(key.trim()));
    });
  });
  root.querySelectorAll("[data-date]").forEach((el) => { el.textContent = longDate(el.dataset.date); });
}

export function onChange(fn) { listeners.push(fn); }

export async function setLang(l, { remember = false } = {}) {
  if (!LOCALES[l]) l = "en";
  if (remember) { try { localStorage.setItem("lang", l); } catch (e) { /* private mode */ } }
  try {
    strings = await load(l);
  } catch (e) {
    l = "en";
    strings = await load("en");
  }
  cache.__en = l === "en" ? strings : cache.__en;
  current = l;
  document.documentElement.lang = l;
  document.title = t("meta.title");
  document.querySelector('meta[name="description"]')?.setAttribute("content", t("meta.description"));
  apply();
  document.querySelectorAll("[data-lang]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.lang === l)));
  document.documentElement.classList.remove("i18n-pending");
  listeners.forEach((fn) => fn(l));
  // Keep English around as the fallback for any missing German key.
  if (!cache.__en) load("en").then((en) => { cache.__en = en; }).catch(() => {});
}
