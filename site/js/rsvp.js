// The 7-step RSVP flow. State lives in memory; every change re-renders the card and restores focus.
import { t, shortDate, longDate, joinNames, lang } from "./i18n.js";
import { submitRsvp } from "./api.js";

const DAYS = { thu: "2027-06-03", fri: "2027-06-04", sat: "2027-06-05", sun: "2027-06-06", mon: "2027-06-07" };
const DIETS = ["any", "vegetarian", "vegan", "gluten_free", "other"];
const MAX_ADDED = 6;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

let card, body, live, code, s, ui, addCounter = 0;

// ---- Public -----------------------------------------------------------------
export function mountRsvp(cardEl, household) {
  card = cardEl;
  code = household.code;
  s = initialState(household.guests, household.response);
  ui = { step: household.response ? "thanks" : 1, errors: new Set(), alert: "", sending: false, already: !!household.response, focus: null };
  card.replaceChildren();
  body = h("div", { class: "rsvp-body" });
  live = h("p", { class: "sr-only", "aria-live": "polite" });
  card.append(body, live);
  render();
}

export function rerender() { if (s) render(); }

// ---- State ------------------------------------------------------------------
function initialState(guests, r) {
  const st = {
    guests: guests.map((g) => ({ id: g.id, name: g.name, child: !!g.child, attending: null, diet: null, diet_other: "" })),
    arrival_day: null, arrival_time: null, departure_day: null,
    travel_mode: null, airport: null, station: null, pickup: null, travel_details: "",
    pizza: null, pizzaAuto: false, wine: null,
    allergies: "", fridge_wishes: "",
    email: "", note: "", website: "",
  };
  if (!r) return st;
  for (const g of st.guests) {
    const prev = (r.guests || []).find((x) => x.id === g.id);
    if (prev) Object.assign(g, { attending: prev.attending ?? null, diet: prev.diet ?? null, diet_other: prev.diet_other || "" });
  }
  for (const prev of (r.guests || []).filter((x) => x.added)) {
    st.guests.push({ id: `new-${++addCounter}`, added: true, name: prev.name || "", child: prev.child !== false, attending: prev.attending ?? true, diet: prev.diet ?? null, diet_other: prev.diet_other || "" });
  }
  for (const k of ["arrival_day", "arrival_time", "departure_day", "travel_mode", "airport", "station", "pickup", "pizza", "wine"]) {
    if (r[k] !== undefined) st[k] = r[k];
  }
  for (const k of ["travel_details", "allergies", "fridge_wishes", "email", "note"]) st[k] = r[k] || "";
  return st;
}

const coming = () => s.guests.filter((g) => g.attending === true);
const nobodyComing = () => s.guests.length > 0 && s.guests.every((g) => g.attending === false);
const displayName = (g) => (g.name || "").trim() || t("rsvp.s1.littleOne");

function payload() {
  const anyone = coming().length > 0;
  const guests = s.guests.map((g) => ({
    id: g.id, name: g.name.trim(), child: g.child, ...(g.added ? { added: true } : {}),
    attending: g.attending,
    diet: g.attending ? g.diet : null,
    diet_other: g.attending && g.diet === "other" ? g.diet_other.trim() : "",
  }));
  const moving = s.travel_mode === "fly" || s.travel_mode === "train";
  const trip = anyone ? {
    arrival_day: s.arrival_day, arrival_time: s.arrival_time, departure_day: s.departure_day,
    travel_mode: s.travel_mode,
    airport: s.travel_mode === "fly" ? s.airport : null,
    station: s.travel_mode === "train" ? s.station : null,
    pickup: moving ? s.pickup : null,
    travel_details: moving ? s.travel_details.trim() : "",
    pizza: s.pizza, wine: s.wine,
    allergies: s.allergies.trim(),
    fridge_wishes: s.fridge_wishes.trim(),
  } : {
    arrival_day: null, arrival_time: null, departure_day: null, travel_mode: null, airport: null, station: null,
    pickup: null, travel_details: null, pizza: null, wine: null, allergies: null, fridge_wishes: null,
  };
  return { code, lang: lang(), website: s.website, guests, ...trip, email: s.email.trim(), note: s.note.trim() };
}

// ---- Validation & navigation ------------------------------------------------
function missingFor(step) {
  const m = [];
  if (step === 1) {
    for (const g of s.guests) {
      if (g.added && !g.name.trim()) m.push(`name:${g.id}`);
      if (g.attending === null) m.push(`att:${g.id}`);
    }
  } else if (step === 2) {
    if (!s.arrival_day) m.push("arrival_day");
    if (!s.arrival_time) m.push("arrival_time");
    if (!s.departure_day) m.push("departure_day");
  } else if (step === 3) {
    if (!s.travel_mode) m.push("travel_mode");
    if (s.travel_mode === "fly" && !s.airport) m.push("airport");
    if (s.travel_mode === "train" && !s.station) m.push("station");
    if ((s.travel_mode === "fly" || s.travel_mode === "train") && s.pickup === null) m.push("pickup");
  } else if (step === 4) {
    if (!s.pizza) m.push("pizza");
    if (!s.wine) m.push("wine");
  } else if (step === 5) {
    for (const g of coming()) if (!g.diet) m.push(`diet:${g.id}`);
  } else if (step === 7) {
    if (s.email.trim() && !EMAIL_RE.test(s.email.trim())) m.push("email");
  }
  return m;
}

function showMissing(missing) {
  ui.errors = new Set(missing);
  ui.alert = missing.includes("email") && missing.length === 1 ? t("rsvp.s7.emailInvalid") : t("rsvp.missing");
  ui.focus = { err: missing[0] };
  announce(ui.alert);
  render();
}

function clearError(key) {
  if (ui.errors.delete(key) && ui.errors.size === 0) ui.alert = "";
}

function goTo(step) {
  if (step === 4 && !s.pizza && (s.arrival_day === "fri" || s.arrival_day === "sat")) {
    s.pizza = "later";
    s.pizzaAuto = true;
  }
  ui.step = step;
  ui.errors.clear();
  ui.alert = "";
  ui.focus = { heading: true };
  render();
}

function next() {
  const missing = missingFor(ui.step);
  if (missing.length) return showMissing(missing);
  if (ui.step === 1 && nobodyComing()) return goTo(7);
  goTo(ui.step + 1);
}

function back() {
  if (ui.step === 7 && nobodyComing()) return goTo(1);
  goTo(Math.max(1, ui.step - 1));
}

async function send() {
  const missing = missingFor(7);
  if (missing.length) return showMissing(missing);
  ui.sending = true;
  ui.alert = "";
  render();
  let ok = false;
  try {
    const res = await submitRsvp(payload());
    ok = !!(res && res.ok);
  } catch (e) {
    ok = false;
  }
  ui.sending = false;
  if (ok) {
    ui.already = false;
    ui.step = "thanks";
    ui.focus = { heading: true };
  } else {
    ui.alert = t("rsvp.sendFailed");
    ui.focus = { key: "send" };
    announce(ui.alert);
  }
  render();
}

// ---- Rendering helpers ------------------------------------------------------
function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === "on") for (const [ev, fn] of Object.entries(v)) el.addEventListener(ev, fn);
    else if (k === "class") el.className = v;
    else if (k === "value") el.value = v;
    else if (k === "checked") el.checked = !!v;
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const c of children.flat()) if (c !== null && c !== undefined && c !== false) el.append(c);
  return el;
}

let uid = 0;
const id = (p) => `${p}-${++uid}`;

function announce(msg) {
  live.textContent = "";
  setTimeout(() => { live.textContent = msg; }, 50);
}

/** A labelled group of single-choice chips. */
function choice(key, label, options, current, pick, { hint, small, labelClass } = {}) {
  const labelId = id("lbl");
  const errId = id("err");
  const missing = ui.errors.has(key);
  return h("div", { class: "field" + (missing ? " is-missing" : ""), role: "group", "aria-labelledby": labelId, "aria-describedby": missing ? errId : null, "data-err": key },
    h("span", { class: labelClass || "field__label", id: labelId }, label),
    hint ? h("span", { class: "field__hint" }, hint) : null,
    h("div", { class: "chips" + (small ? " chips--small" : "") },
      options.map(([value, text]) => h("button", {
        type: "button", class: "chip", "aria-pressed": String(current === value), "data-key": `${key}:${value}`,
        on: { click: () => { pick(value); clearError(key); ui.focus = { key: `${key}:${value}` }; render(); } },
      }, text))),
    missing ? h("span", { class: "field__error", id: errId }, t("rsvp.chooseOne")) : null);
}

function textInput(key, label, value, onInput, { placeholder, type = "text", multiline = false, autocomplete, invalid } = {}) {
  const errId = id("err");
  const ctrl = h(multiline ? "textarea" : "input", {
    class: "input", type: multiline ? null : type, placeholder, autocomplete, rows: multiline ? "3" : null,
    "data-key": key, "data-err": key, maxlength: "500",
    "aria-invalid": invalid ? "true" : null, "aria-describedby": invalid ? errId : null,
    on: { input: (e) => onInput(e.target.value) },
  });
  ctrl.value = value || "";
  return h("label", { class: "input-label" }, label, ctrl, invalid ? h("span", { class: "field__error", id: errId }, invalid) : null);
}

// ---- Steps ------------------------------------------------------------------
function stepHeading(text) {
  return h("h3", { class: "step__title", tabindex: "-1", "data-heading": "" }, text);
}

function step1() {
  const rows = s.guests.map((g) => {
    const att = choice(`att:${g.id}`, displayName(g),
      [[true, t("rsvp.yes")], [false, t("rsvp.no")]], g.attending, (v) => { g.attending = v; },
      { labelClass: g.added ? "sr-only" : "person__name" });
    if (!g.added) return h("div", { class: "person" }, att);
    const nameMissing = ui.errors.has(`name:${g.id}`);
    return h("div", { class: "person" },
      h("div", { class: "added-row" },
        textInput(`name:${g.id}`, t("rsvp.s1.addedName"), g.name, (v) => { g.name = v; },
          { autocomplete: "off", invalid: nameMissing ? t("rsvp.s1.nameMissing") : null }),
        h("label", { class: "check" },
          h("input", { type: "checkbox", checked: g.child, "data-key": `child:${g.id}`, on: { change: (e) => { g.child = e.target.checked; } } }),
          t("rsvp.s1.addedChild")),
        h("button", {
          type: "button", class: "remove-btn", "data-key": `remove:${g.id}`,
          "aria-label": g.name.trim() ? t("rsvp.s1.remove", { name: g.name.trim() }) : t("rsvp.s1.removeUnnamed"),
          on: { click: () => {
            s.guests = s.guests.filter((x) => x !== g);
            clearError(`name:${g.id}`); clearError(`att:${g.id}`);
            ui.focus = { key: "add" }; render();
          } },
        }, "×")),
      att);
  });
  const addedCount = s.guests.filter((g) => g.added).length;
  return [
    stepHeading(t("rsvp.s1.title")),
    h("p", { class: "step__intro" }, t("rsvp.s1.intro")),
    ...rows,
    addedCount < MAX_ADDED ? h("button", {
      type: "button", class: "link-btn", style: "align-self:flex-start", "data-key": "add",
      on: { click: () => {
        const g = { id: `new-${++addCounter}`, added: true, name: "", child: true, attending: true, diet: null, diet_other: "" };
        s.guests.push(g);
        ui.focus = { key: `name:${g.id}` }; render();
      } },
    }, t("rsvp.s1.add")) : null,
  ];
}

function step2() {
  return [
    stepHeading(t("rsvp.s2.title")),
    choice("arrival_day", t("rsvp.s2.arrive"), ["thu", "fri", "sat"].map((d) => [d, shortDate(DAYS[d])]), s.arrival_day, (v) => {
      s.arrival_day = v;
      if (s.pizzaAuto && v === "thu") { s.pizza = null; s.pizzaAuto = false; }
    }),
    choice("arrival_time", t("rsvp.s2.time"), ["morning", "afternoon", "evening"].map((v) => [v, t(`rsvp.s2.${v}`)]), s.arrival_time, (v) => { s.arrival_time = v; }),
    choice("departure_day", t("rsvp.s2.leave"), ["sun", "mon"].map((d) => [d, shortDate(DAYS[d])]), s.departure_day, (v) => { s.departure_day = v; }),
  ];
}

function step3() {
  const moving = s.travel_mode === "fly" || s.travel_mode === "train";
  return [
    stepHeading(t("rsvp.s3.title")),
    choice("travel_mode", t("rsvp.s3.mode"), ["fly", "train", "drive"].map((v) => [v, t(`rsvp.s3.${v}`)]), s.travel_mode, (v) => {
      s.travel_mode = v;
      if (v !== "fly") s.airport = null;
      if (v !== "train") s.station = null;
      if (v === "drive") s.pickup = null;
      ["airport", "station", "pickup"].forEach(clearError);
    }),
    s.travel_mode === "fly" ? choice("airport", t("rsvp.s3.airport"), [["psa", t("rsvp.s3.psa")], ["flr", t("rsvp.s3.flr")]], s.airport, (v) => { s.airport = v; }) : null,
    s.travel_mode === "train" ? choice("station", t("rsvp.s3.station"), [["smf", t("rsvp.s3.smf")], ["granaiolo", t("rsvp.s3.granaiolo")]], s.station, (v) => { s.station = v; }) : null,
    moving ? choice("pickup", t("rsvp.s3.pickup"), [[true, t("rsvp.s3.pickupYes")], [false, t("rsvp.s3.pickupNo")]], s.pickup, (v) => { s.pickup = v; }) : null,
    moving ? textInput("travel_details", t("rsvp.s3.details"), s.travel_details, (v) => { s.travel_details = v; }, { placeholder: t("rsvp.s3.detailsPlaceholder"), autocomplete: "off" }) : null,
  ];
}

function step4() {
  return [
    stepHeading(t("rsvp.s4.title")),
    h("p", { class: "step__intro" }, t("rsvp.s4.intro")),
    h("div", { class: "box" },
      choice("pizza", t("rsvp.s4.pizza"), [["yes", t("rsvp.s4.pizzaYes")], ["later", t("rsvp.s4.pizzaLater")]], s.pizza, (v) => { s.pizza = v; s.pizzaAuto = false; })),
    h("div", { class: "box" },
      choice("wine", t("rsvp.s4.wine"), [["yes", t("rsvp.s4.wineYes")], ["maybe", t("rsvp.s4.wineMaybe")], ["no", t("rsvp.s4.wineNo")]], s.wine, (v) => { s.wine = v; }, { hint: t("rsvp.s4.wineText") })),
  ];
}

function step5() {
  return [
    stepHeading(t("rsvp.s5.title")),
    ...coming().map((g) => h("div", { class: "person" },
      choice(`diet:${g.id}`, displayName(g), DIETS.map((d) => [d, t(`rsvp.s5.${d}`)]), g.diet, (v) => { g.diet = v; }, { small: true, labelClass: "person__name" }),
      g.diet === "other" ? h("div", {},
        textInput(`diet_other:${g.id}`, t("rsvp.s5.otherLabel"), g.diet_other, (v) => { g.diet_other = v; }, { autocomplete: "off" })) : null)),
    textInput("allergies", t("rsvp.s5.allergies"), s.allergies, (v) => { s.allergies = v; }, { placeholder: t("rsvp.s5.allergiesPlaceholder"), autocomplete: "off" }),
  ];
}

function step6() {
  return [
    stepHeading(t("rsvp.s6.title")),
    h("p", { class: "step__intro" }, t("rsvp.s6.intro")),
    textInput("fridge_wishes", t("rsvp.s6.wishes"), s.fridge_wishes, (v) => { s.fridge_wishes = v; }, { placeholder: t("rsvp.s6.placeholder"), multiline: true }),
  ];
}

function summaryRow(label, value) {
  return h("span", {}, h("b", {}, label), " ", value);
}

function step7() {
  const none = nobodyComing();
  const notComing = s.guests.filter((g) => g.attending === false).map(displayName);
  let summary;
  if (none) {
    summary = h("div", { class: "summary" }, h("span", {}, t("rsvp.s7.missYou")), summaryRow(t("rsvp.s7.notComing"), joinNames(notComing)));
  } else {
    const travel = s.travel_mode === "drive" ? t("rsvp.s7.travelDrive")
      : (s.travel_mode === "fly" ? t("rsvp.s7.travelFly", { place: t(`rsvp.s3.${s.airport}`) }) : t("rsvp.s7.travelTrain", { place: t(`rsvp.s3.${s.station}`) }))
        + (s.pickup ? t("rsvp.s7.travelPickup") : "");
    const wine = { yes: t("rsvp.s4.wineYes"), maybe: t("rsvp.s4.wineMaybe"), no: t("rsvp.s4.wineNo") }[s.wine];
    summary = h("div", { class: "summary" },
      summaryRow(t("rsvp.s7.coming"), joinNames(coming().map(displayName))),
      notComing.length ? summaryRow(t("rsvp.s7.notComing"), joinNames(notComing)) : null,
      summaryRow(t("rsvp.s7.dates"), t("rsvp.s7.datesValue", {
        arrive: longDate(DAYS[s.arrival_day]), time: t(`rsvp.s2.${s.arrival_time}`).toLowerCase(), leave: longDate(DAYS[s.departure_day]),
      })),
      summaryRow(t("rsvp.s7.travel"), travel),
      summaryRow(t("rsvp.s7.wine"), wine));
  }
  return [
    stepHeading(t("rsvp.s7.title")),
    summary,
    textInput("email", t("rsvp.s7.email"), s.email, (v) => { s.email = v; }, {
      type: "email", placeholder: t("rsvp.s7.emailPlaceholder"), autocomplete: "email",
      invalid: ui.errors.has("email") ? t("rsvp.s7.emailInvalid") : null,
    }),
    h("p", { class: "privacy" }, t("rsvp.s7.privacy")),
    textInput("note", t("rsvp.s7.note"), s.note, (v) => { s.note = v; }, { multiline: true }),
    // Honeypot: people never see or fill this; simple bots do.
    h("div", { class: "honeypot", "aria-hidden": "true" },
      h("label", {}, "Website", h("input", { type: "text", tabindex: "-1", autocomplete: "off", on: { input: (e) => { s.website = e.target.value; } } }))),
  ];
}

function thanks() {
  const none = nobodyComing();
  return h("div", { class: "thanks" },
    h("svg", { viewBox: "0 0 120 60", "aria-hidden": "true" }),
    h("h3", { class: "thanks__title", tabindex: "-1", "data-heading": "" }, t("rsvp.thanks.title")),
    ui.already ? h("p", {}, t("rsvp.thanks.already")) : h("p", {}, none ? t("rsvp.thanks.textNotComing") : t("rsvp.thanks.text")),
    h("button", { type: "button", class: "link-btn", "data-key": "change", on: { click: () => { ui.already = false; goTo(1); } } }, t("rsvp.thanks.change")));
}

const THANKS_SVG = '<path d="M10 45 C 40 20, 80 20, 110 45" fill="none" stroke="#6E7F52" stroke-width="1.5" stroke-linecap="round"/><ellipse cx="28" cy="33" rx="10" ry="3.5" fill="#8A9A6B" transform="rotate(-30 28 33)"/><ellipse cx="92" cy="33" rx="10" ry="3.5" fill="#8A9A6B" transform="rotate(30 92 33)"/><ellipse cx="60" cy="22" rx="13" ry="10" fill="#E9C440"/>';

// ---- Render -----------------------------------------------------------------
function render() {
  const nodes = [];
  if (ui.step === "thanks") {
    nodes.push(thanks());
  } else {
    const step = ui.step;
    nodes.push(h("div", { class: "progress" },
      h("div", { class: "progress__top" },
        h("span", { class: "progress__label" }, t("rsvp.label")),
        h("span", { class: "progress__count" }, t("rsvp.stepOf", { n: step }))),
      h("div", { class: "progress__bar", "aria-hidden": "true" },
        [1, 2, 3, 4, 5, 6, 7].map((n) => h("span", { class: n <= step ? "is-done" : null })))));
    nodes.push(h("div", { class: "step" }, [step1, step2, step3, step4, step5, step6, step7][step - 1]()));
    nodes.push(h("p", { class: "rsvp-alert" }, ui.alert));
    nodes.push(h("div", { class: "rsvp-nav" },
      step > 1 ? h("button", { type: "button", class: "btn btn--ghost", "data-key": "back", on: { click: back } }, t("rsvp.back")) : h("span"),
      step < 7
        ? h("button", { type: "button", class: "btn", "data-key": "next", on: { click: next } }, t("rsvp.next"))
        : h("button", { type: "button", class: "btn btn--dark", "data-key": "send", disabled: ui.sending, "aria-busy": ui.sending ? "true" : null, on: { click: send } },
          ui.sending ? t("rsvp.sending") : t("rsvp.send"))));
  }
  body.replaceChildren(...nodes);
  const svg = body.querySelector(".thanks svg");
  if (svg) svg.innerHTML = THANKS_SVG;
  restoreFocus();
}

function restoreFocus() {
  const f = ui.focus;
  ui.focus = null;
  if (!f) return;
  let el = null;
  if (f.heading) {
    el = body.querySelector("[data-heading]");
    const top = card.getBoundingClientRect().top;
    if (top < 0 || top > window.innerHeight * 0.6) {
      card.scrollIntoView({ block: "start", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    }
  } else if (f.key) {
    el = body.querySelector(`[data-key="${CSS.escape(f.key)}"]`);
  } else if (f.err) {
    const box = body.querySelector(`[data-err="${CSS.escape(f.err)}"]`);
    el = box && (box.matches("input, textarea") ? box : box.querySelector("button, input, textarea"));
  }
  if (el) el.focus({ preventScroll: !f.heading && !f.err });
}
