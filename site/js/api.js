// Talks to the Google Apps Script web app, or to a fake one in demo mode.
const cfg = window.SITE_CONFIG || {};
export const isMock = cfg.APPS_SCRIPT_URL === "mock";
// Apps Script can take 5–10 s to wake up after a quiet spell.
const LOOKUP_TIMEOUT_MS = 15000;

/** Returns { ok:true, household, lang, guests, response } or { ok:false, error }. Throws on network failure/timeout. */
export async function lookupGuest(code) {
  if (isMock) return withTimeout(mockLookup(code), LOOKUP_TIMEOUT_MS);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), LOOKUP_TIMEOUT_MS);
  try {
    const url = `${cfg.APPS_SCRIPT_URL}?action=guest&code=${encodeURIComponent(code)}`;
    const res = await fetch(url, { signal: ctrl.signal, credentials: "omit" });
    if (!res.ok) throw new Error(`lookup ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/** Returns { ok:true } or { ok:false, error }. Throws on network failure. */
export async function submitRsvp(payload) {
  if (isMock) return mockSubmit(payload);
  const res = await fetch(cfg.APPS_SCRIPT_URL, {
    method: "POST",
    // text/plain avoids a CORS preflight, which Apps Script can't answer.
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(payload),
    credentials: "omit",
  });
  if (!res.ok) throw new Error(`submit ${res.status}`);
  return res.json();
}

function withTimeout(promise, ms) {
  return Promise.race([promise, new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))]);
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- Demo mode -------------------------------------------------------------
const MOCK = {
  test: { household: "Murphy family", lang: "en", guests: [
    { id: "g1", name: "Aoife", child: false },
    { id: "g2", name: "Ciarán", child: false },
    { id: "g3", name: "Niamh", child: true },
  ] },
  de: { household: "Familie Schmidt", lang: "de", guests: [
    { id: "g4", name: "Anna", child: false },
    { id: "g5", name: "Jonas", child: false },
  ] },
  solo: { household: "Tom", lang: "en", guests: [{ id: "g6", name: "Tom", child: false }] },
  plus: { household: "Tom & Lea", lang: "en", guests: [
    { id: "g8", name: "Tom", child: false, plus_one: true },
    { id: "g9", name: "Lea", child: false },
  ] },
  sendfail: { household: "Send-fail test", lang: "en", guests: [{ id: "g7", name: "Pat", child: false }] },
};

function mockKey(code) { return "mock-response:" + code; }

async function mockLookup(code) {
  await wait(400);
  if (code === "fail") throw new Error("mock network failure");
  if (code === "slow") return new Promise(() => {}); // never answers → timeout
  const h = MOCK[code];
  if (!h) return { ok: false, error: "unknown_code" };
  let response = null;
  try { response = JSON.parse(localStorage.getItem(mockKey(code)) || "null"); } catch (e) {}
  return { ok: true, household: h.household, lang: h.lang, guests: h.guests, response };
}

async function mockSubmit(payload) {
  await wait(700);
  if (payload.code === "sendfail") throw new Error("mock submit failure");
  if (!MOCK[payload.code]) return { ok: false, error: "unknown_code" };
  try { localStorage.setItem(mockKey(payload.code), JSON.stringify(payload)); } catch (e) {}
  console.info("[demo] RSVP payload", payload);
  return { ok: true };
}
