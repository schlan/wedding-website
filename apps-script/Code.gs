/**
 * @OnlyCurrentDoc  ← limits this script to the one spreadsheet it's attached to (not all your Sheets).
 *
 * Éadaoin & Sebastian · RSVP backend.
 * Paste this whole file into Extensions → Apps Script of the RSVP Google Sheet.
 * See README.md in this folder for the 10-minute setup.
 *
 * Web app:  GET  ?action=guest&code=XXXX  → { ok, household, lang, guests, response }
 *           POST (text/plain JSON body)    → { ok } and saves to Responses + Latest
 * Menu:     Wedding → Set up sheet / Fill in codes & links / Send a test RSVP
 */

// ---------------------------------------------------------------------------
// Settings and vocabularies
// ---------------------------------------------------------------------------
var SHEETS = { guests: 'Guests', settings: 'Settings', responses: 'Responses', latest: 'Latest', summary: 'Summary' };
var GUEST_HEADERS = ['code', 'household', 'guest_id', 'name', 'child', 'lang', 'invite_url', 'notes', 'plus_one'];
var MAX_ADDED = 6;
var MAX_TEXT = 500;
var CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'; // no 0 O o 1 l I

var LABELS = {
  arrival_day: { thu: '3 June (Thu)', fri: '4 June (Fri)', sat: '5 June (Sat)' },
  arrival_time: { morning: 'Morning', afternoon: 'Afternoon', evening: 'Evening' },
  departure_day: { sun: '6 June (Sun)', mon: '7 June (Mon)' },
  travel_mode: { fly: 'Flying', train: 'Train', drive: 'Driving' },
  airport: { psa: 'Pisa airport', flr: 'Florence airport' },
  station: { pisa_centrale: 'Pisa Centrale', firenze_smn: 'Florence S.M. Novella', smf: 'San Miniato-Fucecchio', granaiolo: 'Granaiolo' },
  pizza: { yes: 'Yes', later: 'Arriving later' },
  wine: { yes: 'Yes', maybe: 'Maybe', no: 'No' },
  diet: { any: 'Anything goes', vegetarian: 'Vegetarian', vegan: 'Vegan', gluten_free: 'Gluten-free', other: 'Other' }
};

var FLAT_HEADERS = [
  'status', 'attending_names', 'not_attending_names', 'n_adults', 'n_kids', 'n_people', 'n_plus_ones',
  'arrival_day', 'arrival_time', 'departure_day',
  'travel_mode', 'airport', 'station', 'pickup', 'travel_details',
  'pizza', 'pizza_people', 'wine', 'wine_people', 'wine_maybe_people',
  'diet_any', 'diet_vegetarian', 'diet_vegan', 'diet_gluten_free', 'diet_other', 'diet_other_text', 'diets_detail', 'allergies',
  'fridge_wishes', 'email', 'note', 'lang'
];

var LATEST_HEADERS = ['updated', 'code', 'household'].concat(FLAT_HEADERS);
var RESPONSES_HEADERS = ['timestamp', 'code', 'household', 'payload_json'].concat(FLAT_HEADERS);

// ---------------------------------------------------------------------------
// Web app entry points
// ---------------------------------------------------------------------------
function doGet(e) {
  try {
    var p = (e && e.parameter) || {};
    if (p.action === 'guest') return json(lookupGuest(String(p.code || '')));
    return json({ ok: true, service: 'rsvp' });
  } catch (err) {
    console.error(err);
    return json({ ok: false, error: 'server' });
  }
}

function doPost(e) {
  try {
    var payload;
    try { payload = JSON.parse(e.postData.contents); } catch (x) { return json({ ok: false, error: 'invalid' }); }
    return json(handleSubmit(payload));
  } catch (err) {
    console.error(err);
    return json({ ok: false, error: 'server' });
  }
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// ---------------------------------------------------------------------------
// Lookup
// ---------------------------------------------------------------------------
function lookupGuest(code) {
  var h = findHousehold(code);
  if (!h) return { ok: false, error: 'unknown_code' };
  return {
    ok: true,
    household: h.household,
    lang: h.lang,
    guests: h.guests.map(function (g) { var o = { id: g.id, name: g.name, child: g.child }; if (g.plus_one) o.plus_one = true; return o; }),
    response: latestPayload(code)
  };
}

/** Reads the Guests tab and returns { household, lang, guests:[{id,name,child}] } for a code, or null. */
function findHousehold(code) {
  code = String(code || '').trim();
  if (!/^[A-Za-z0-9]{4,32}$/.test(code)) return null;
  var rows = readTable(SHEETS.guests);
  var mine = rows.filter(function (r) { return String(r.code).trim() === code && String(r.name).trim(); });
  if (!mine.length) return null;
  return {
    household: String(mine[0].household || '').trim(),
    lang: String(mine[0].lang || '').trim().toLowerCase() === 'de' ? 'de' : 'en',
    guests: mine.map(function (r) {
      return {
        id: String(r.guest_id).trim(), name: String(r.name).trim(),
        child: r.child === true || String(r.child).toUpperCase() === 'TRUE',
        plus_one: r.plus_one === true || String(r.plus_one).toUpperCase() === 'TRUE'
      };
    })
  };
}

function latestPayload(code) {
  var sh = sheet(SHEETS.responses);
  var last = sh.getLastRow();
  if (last < 2) return null;
  var values = sh.getRange(2, 2, last - 1, 3).getValues(); // code, household, payload_json
  for (var i = values.length - 1; i >= 0; i--) {
    if (String(values[i][0]) === code) {
      try { return JSON.parse(values[i][2]); } catch (x) { return null; }
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Submit
// ---------------------------------------------------------------------------
function handleSubmit(payload) {
  if (!payload || typeof payload !== 'object') return { ok: false, error: 'invalid' };
  var h = findHousehold(payload.code);
  if (!h) return { ok: false, error: 'unknown_code' };
  if (payload.website) return { ok: true }; // honeypot: pretend it worked, save nothing

  var clean = validatePayload(payload, h);
  if (!clean) return { ok: false, error: 'invalid' };

  var flat = flatten(clean, h);
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var now = new Date();
    appendRow(SHEETS.responses, RESPONSES_HEADERS, Object.assign({ timestamp: now, code: clean.code, household: h.household, payload_json: JSON.stringify(clean) }, flat));
    upsertLatest(Object.assign({ updated: now, code: clean.code, household: h.household }, flat));
    SpreadsheetApp.flush();
  } finally {
    lock.releaseLock();
  }
  return { ok: true };
}

/** Returns a cleaned copy of the payload, or null if anything is off. */
function validatePayload(p, h) {
  var known = {};
  h.guests.forEach(function (g) { known[g.id] = g; });
  if (!Array.isArray(p.guests) || !p.guests.length) return null;

  var seen = {}, added = 0, plusOnes = {}, guests = [];
  for (var i = 0; i < p.guests.length; i++) {
    var g = p.guests[i] || {};
    var isAdded = g.added === true;
    var plusOf = isAdded && g.plus_one_of ? String(g.plus_one_of) : null;
    if (plusOf) {
      // Only someone ticked in Guests → plus_one may bring one, and only one.
      if (!known[plusOf] || !known[plusOf].plus_one || plusOnes[plusOf]) return null;
      plusOnes[plusOf] = true;
    } else if (isAdded) {
      if (++added > MAX_ADDED) return null;
    } else if (!known[g.id] || seen[g.id]) {
      return null;
    }
    if (!isAdded) seen[g.id] = true;
    if (typeof g.attending !== 'boolean') return null;
    var name = isAdded ? text(g.name, 100) : known[g.id].name;
    if (!name && !plusOf) return null; // a plus one's name is optional
    var diet = g.attending ? g.diet : null;
    if (g.attending && !LABELS.diet[diet]) return null;
    guests.push({
      id: plusOf ? 'plus-' + plusOf : (isAdded ? 'added-' + added : g.id), name: name,
      child: plusOf ? false : (isAdded ? g.child !== false : known[g.id].child),
      added: isAdded || undefined, plus_one_of: plusOf || undefined, attending: g.attending, diet: diet,
      diet_other: diet === 'other' ? text(g.diet_other) : ''
    });
  }
  // Every invited person must have an answer.
  for (var id in known) if (!seen[id]) return null;
  // A plus one comes with their inviter.
  for (var inviter in plusOnes) {
    if (!guests.some(function (x) { return x.id === inviter && x.attending; })) return null;
  }

  var anyone = guests.some(function (g) { return g.attending; });
  var out = { code: String(p.code), lang: p.lang === 'de' ? 'de' : 'en', guests: guests, email: text(p.email, 200), note: text(p.note) };
  if (out.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(out.email)) return null;

  if (!anyone) {
    ['arrival_day', 'arrival_time', 'departure_day', 'travel_mode', 'airport', 'station', 'pickup', 'travel_details', 'pizza', 'wine', 'allergies', 'fridge_wishes']
      .forEach(function (k) { out[k] = null; });
    return out;
  }

  var need = { arrival_day: 1, arrival_time: 1, departure_day: 1, travel_mode: 1, pizza: 1, wine: 1 };
  for (var k in need) { if (!LABELS[k][p[k]]) return null; out[k] = p[k]; }
  var moving = p.travel_mode === 'fly' || p.travel_mode === 'train';
  out.airport = p.travel_mode === 'fly' ? p.airport : null;
  out.station = p.travel_mode === 'train' ? p.station : null;
  if (p.travel_mode === 'fly' && !LABELS.airport[out.airport]) return null;
  if (p.travel_mode === 'train' && !LABELS.station[out.station]) return null;
  out.pickup = moving ? p.pickup : null;
  if (moving && typeof out.pickup !== 'boolean') return null;
  out.travel_details = moving ? text(p.travel_details) : '';
  out.allergies = text(p.allergies);
  out.fridge_wishes = text(p.fridge_wishes);
  return out;
}

function text(v, max) {
  if (v === null || v === undefined) return '';
  return String(v).trim().slice(0, max || MAX_TEXT);
}

/** Turns a clean payload into the readable columns used by Latest/Responses. */
function flatten(p, h) {
  var nameOf = function (g) {
    if (g.name) return g.name;
    var inviter = p.guests.filter(function (x) { return x.id === g.plus_one_of; })[0];
    return 'Plus one of ' + (inviter ? inviter.name : '?');
  };
  var inviterName = function (g) {
    var inviter = p.guests.filter(function (x) { return x.id === g.plus_one_of; })[0];
    return inviter ? inviter.name : '?';
  };
  var yes = p.guests.filter(function (g) { return g.attending; });
  var no = p.guests.filter(function (g) { return !g.attending; });
  var nAdults = yes.filter(function (g) { return !g.child; }).length;
  var nKids = yes.length - nAdults;
  var n = yes.length;
  var lbl = function (k) { return p[k] ? LABELS[k][p[k]] : ''; };
  var dietCount = function (d) { return yes.filter(function (g) { return g.diet === d; }).length; };
  var f = {
    status: !n ? 'not coming' : (no.length ? 'partly' : 'coming'),
    attending_names: yes.map(function (g) {
      if (g.plus_one_of) return g.name ? g.name + ' (plus one of ' + inviterName(g) + ')' : nameOf(g);
      return g.name + (g.child ? ' (child)' : '');
    }).join(', '),
    not_attending_names: no.map(nameOf).join(', '),
    n_adults: nAdults, n_kids: nKids, n_people: n,
    n_plus_ones: yes.filter(function (g) { return g.plus_one_of; }).length,
    arrival_day: lbl('arrival_day'), arrival_time: lbl('arrival_time'), departure_day: lbl('departure_day'),
    travel_mode: lbl('travel_mode'), airport: lbl('airport'), station: lbl('station'),
    pickup: p.pickup === true ? true : (p.pickup === false ? false : ''),
    travel_details: p.travel_details || '',
    pizza: lbl('pizza'), pizza_people: p.pizza === 'yes' ? n : 0,
    wine: lbl('wine'), wine_people: p.wine === 'yes' ? n : 0, wine_maybe_people: p.wine === 'maybe' ? n : 0,
    diet_any: dietCount('any'), diet_vegetarian: dietCount('vegetarian'), diet_vegan: dietCount('vegan'),
    diet_gluten_free: dietCount('gluten_free'), diet_other: dietCount('other'),
    diet_other_text: yes.filter(function (g) { return g.diet === 'other' && g.diet_other; }).map(function (g) { return nameOf(g) + ': ' + g.diet_other; }).join('; '),
    diets_detail: yes.map(function (g) { return nameOf(g) + ': ' + LABELS.diet[g.diet]; }).join('; '),
    allergies: p.allergies || '',
    fridge_wishes: p.fridge_wishes || '', email: p.email || '', note: p.note || '', lang: p.lang
  };
  return f;
}

// ---------------------------------------------------------------------------
// Sheet helpers
// ---------------------------------------------------------------------------
function sheet(name) {
  var sh = SpreadsheetApp.getActive().getSheetByName(name);
  if (!sh) throw new Error('Missing tab "' + name + '". Run Wedding → Set up sheet.');
  return sh;
}

/** Reads a tab into objects keyed by its header row. */
function readTable(name) {
  var sh = sheet(name);
  var last = sh.getLastRow();
  if (last < 2) return [];
  var values = sh.getRange(1, 1, last, sh.getLastColumn()).getValues();
  var head = values[0].map(function (x) { return String(x).trim(); });
  return values.slice(1).map(function (row) {
    var o = {};
    head.forEach(function (k, i) { o[k] = row[i]; });
    return o;
  });
}

/** Text starting with = + - @ would be run as a formula; a leading apostrophe makes the Sheet keep it as text. */
function cell(v) {
  if (v === undefined || v === null) return '';
  return typeof v === 'string' && /^[=+\-@]/.test(v) ? "'" + v : v;
}

function appendRow(name, headers, obj) {
  sheet(name).appendRow(headers.map(function (k) { return cell(obj[k]); }));
}

function upsertLatest(obj) {
  var sh = sheet(SHEETS.latest);
  var row = LATEST_HEADERS.map(function (k) { return cell(obj[k]); });
  var last = sh.getLastRow();
  if (last >= 2) {
    var codes = sh.getRange(2, 2, last - 1, 1).getValues();
    for (var i = 0; i < codes.length; i++) {
      if (String(codes[i][0]) === obj.code) {
        sh.getRange(i + 2, 1, 1, row.length).setValues([row]);
        return;
      }
    }
  }
  sh.appendRow(row);
}

// ---------------------------------------------------------------------------
// Menu
// ---------------------------------------------------------------------------
function onOpen() {
  SpreadsheetApp.getUi().createMenu('Wedding')
    .addItem('Set up sheet', 'setupSheet')
    .addItem('Fill in codes & links', 'fillCodes')
    .addSeparator()
    .addItem('Send a test RSVP', 'testSubmit')
    .addToUi();
}

/** Creates any missing tabs and headers, and (re)builds the Summary. Never deletes guest or response data. */
function setupSheet() {
  var ss = SpreadsheetApp.getActive();
  var ensure = function (name, headers) {
    var sh = ss.getSheetByName(name) || ss.insertSheet(name);
    if (headers) {
      var width = Math.max(sh.getLastColumn(), headers.length);
      var old = width ? sh.getRange(1, 1, 1, width).getValues()[0].map(String) : [];
      var same = old.join('|').replace(/\|+$/, '') === headers.join('|');
      if (!same && old.some(Boolean) && sh.getLastRow() > 1 && name !== SHEETS.guests && name !== SHEETS.settings) {
        throw new Error('The "' + name + '" tab has answers saved in an older column layout. ' +
          'If they are only test RSVPs, delete those rows (keep row 1) and run Set up sheet again. Otherwise ask for help before continuing.');
      }
      if (width > headers.length) sh.getRange(1, headers.length + 1, 1, width - headers.length).clearContent();
      sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold').setBackground('#E4E8D6');
      sh.setFrozenRows(1);
    }
    return sh;
  };
  var guests = ensure(SHEETS.guests, GUEST_HEADERS);
  guests.getRange('E2:E').insertCheckboxes();
  guests.getRange('I2:I').insertCheckboxes(); // plus_one
  guests.getRange('F2:F').setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(['en', 'de'], true).setAllowInvalid(false).build());
  guests.setColumnWidth(7, 320);

  var settings = ensure(SHEETS.settings, ['setting', 'value']);
  if (!settings.getRange('A2').getValue()) {
    settings.getRange('A2:B3').setValues([['site_url', 'https://YOUR-SITE.netlify.app'], ['tz', 'Europe/Dublin']]);
  }
  var tz = String(settings.getRange('B3').getValue() || 'Europe/Dublin');
  ss.setSpreadsheetTimeZone(tz);

  ensure(SHEETS.responses, RESPONSES_HEADERS);
  var latest = ensure(SHEETS.latest, LATEST_HEADERS);
  latest.getRange('A2:A').setNumberFormat('yyyy-mm-dd hh:mm');
  sheet(SHEETS.responses).getRange('A2:A').setNumberFormat('yyyy-mm-dd hh:mm');
  buildSummary(ensure(SHEETS.summary));

  var blank = ss.getSheetByName('Sheet1');
  if (blank && blank.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(blank);
  ss.setActiveSheet(guests);
  notify('Sheet is set up. Next: fill in Settings → site_url, add guests to the Guests tab, then run Wedding → Fill in codes & links.');
}

/** Gives every household without a code a new one, fills guest_id and invite_url. Never changes existing codes. */
function fillCodes() {
  var sh = sheet(SHEETS.guests);
  var last = sh.getLastRow();
  if (last < 2) { notify('Add some guests to the Guests tab first.'); return; }
  var range = sh.getRange(2, 1, last - 1, GUEST_HEADERS.length);
  var rows = range.getValues();
  var used = {}, byHousehold = {}, idsUsed = {};
  rows.forEach(function (r) {
    if (r[0]) { used[r[0]] = true; if (r[1]) byHousehold[String(r[1]).trim()] = r[0]; }
    if (r[2]) idsUsed[r[2]] = true;
  });
  var made = 0;
  rows.forEach(function (r, i) {
    var household = String(r[1]).trim();
    if (!String(r[3]).trim()) return; // no name → skip
    if (!r[0]) {
      if (!household) throw new Error('Row ' + (i + 2) + ' has a name but no household.');
      if (!byHousehold[household]) {
        var c; do { c = randomCode(10); } while (used[c]);
        used[c] = true; byHousehold[household] = c; made++;
      }
      r[0] = byHousehold[household];
    }
    if (!r[2]) { var id; do { id = 'g' + randomCode(6); } while (idsUsed[id]); idsUsed[id] = true; r[2] = id; }
    if (!r[5]) r[5] = 'en';
  });
  // Write code, household, guest_id, name, child, lang back (not invite_url, which gets a formula).
  sh.getRange(2, 1, rows.length, 6).setValues(rows.map(function (r) { return r.slice(0, 6); }));
  var formulas = rows.map(function (r, i) {
    return ['=IF(A' + (i + 2) + '="","",REGEXREPLACE(Settings!$B$2,"/+$","")&"/?g="&A' + (i + 2) + ')'];
  });
  sh.getRange(2, 7, rows.length, 1).setFormulas(formulas);
  notify(made + ' new household code(s) created. Invite links are in the invite_url column.');
}

/** Shows a message in the Sheet, or logs it when run from the script editor. */
function notify(msg) {
  try { SpreadsheetApp.getUi().alert(msg); } catch (x) { console.log(msg); }
}

function randomCode(len) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, Utilities.getUuid() + Utilities.getUuid());
  var s = '';
  for (var i = 0; i < len; i++) s += CODE_ALPHABET.charAt((bytes[i] + 256) % CODE_ALPHABET.length);
  return s;
}

/** Sends a full RSVP for the first household in Guests, so you can check Responses, Latest and Summary. */
function testSubmit() {
  var first = readTable(SHEETS.guests).filter(function (r) { return r.code && r.name; })[0];
  if (!first) { notify('Add a guest and run "Fill in codes & links" first.'); return; }
  var h = findHousehold(first.code);
  var payload = {
    code: String(first.code), lang: 'en', website: '',
    guests: h.guests.map(function (g) { return { id: g.id, attending: true, diet: 'any', diet_other: '' }; })
      .concat([{ added: true, name: 'Test child', child: true, attending: true, diet: 'other', diet_other: 'no nuts' }]),
    arrival_day: 'thu', arrival_time: 'afternoon', departure_day: 'mon',
    travel_mode: 'fly', airport: 'flr', station: null, pickup: true, travel_details: 'TEST 123, lands 14:35',
    pizza: 'yes', wine: 'maybe', allergies: 'Test: nuts', fridge_wishes: 'Test: oat milk, coffee', email: '', note: 'This is a test RSVP. Delete its rows in Responses and Latest.'
  };
  var res = handleSubmit(payload);
  notify('Test RSVP for "' + h.household + '": ' + JSON.stringify(res) +
    '\n\nCheck the Responses, Latest and Summary tabs, then delete the test rows from Responses and Latest.');
}

// ---------------------------------------------------------------------------
// Summary (formulas only, rebuilt by "Set up sheet")
// ---------------------------------------------------------------------------
function buildSummary(sh) {
  sh.clear();
  var col = function (name) { // whole data column of Latest, e.g. Latest!$I$2:$I
    var i = LATEST_HEADERS.indexOf(name);
    if (i < 0) throw new Error('No Latest column ' + name);
    var letter = columnLetter(i + 1);
    return 'Latest!$' + letter + '$2:$' + letter;
  };
  var q = function (s) { return '"' + s.replace(/"/g, '""') + '"'; };
  var rows = [];
  var title = function (t) { rows.push([t, '', '', '', '', '']); };
  var line = function (label, formula) { rows.push([label, formula, '', '', '', '']); };
  var gap = function () { rows.push(['', '', '', '', '', '']); };

  title('HEADCOUNT');
  line('Households invited', '=COUNTUNIQUE(Guests!$A$2:$A)');
  line('Households replied', '=COUNTA(' + col('code') + ')');
  line('Households not coming', '=COUNTIF(' + col('status') + ',"not coming")');
  line('People coming', '=SUM(' + col('n_people') + ')');
  line('  adults', '=SUM(' + col('n_adults') + ')');
  line('  kids', '=SUM(' + col('n_kids') + ')');
  line('  of whom plus ones', '=SUM(' + col('n_plus_ones') + ')');
  gap();

  title('ARRIVALS (people)');
  rows.push(['', 'Morning', 'Afternoon', 'Evening', 'Total', '']);
  ['thu', 'fri', 'sat'].forEach(function (d) {
    var day = LABELS.arrival_day[d];
    var cells = ['morning', 'afternoon', 'evening'].map(function (t) {
      return '=SUMIFS(' + col('n_people') + ',' + col('arrival_day') + ',' + q(day) + ',' + col('arrival_time') + ',' + q(LABELS.arrival_time[t]) + ')';
    });
    rows.push([day].concat(cells).concat(['=SUMIFS(' + col('n_people') + ',' + col('arrival_day') + ',' + q(day) + ')', '']));
  });
  title('DEPARTURES (people)');
  ['sun', 'mon'].forEach(function (d) {
    line(LABELS.departure_day[d], '=SUMIFS(' + col('n_people') + ',' + col('departure_day') + ',' + q(LABELS.departure_day[d]) + ')');
  });
  gap();

  title('PICK-UPS (people)');
  [['airport', 'psa'], ['airport', 'flr'], ['station', 'pisa_centrale'], ['station', 'firenze_smn'], ['station', 'smf'], ['station', 'granaiolo']].forEach(function (pl) {
    line(LABELS[pl[0]][pl[1]], '=SUMIFS(' + col('n_people') + ',' + col('pickup') + ',TRUE,' + col(pl[0]) + ',' + q(LABELS[pl[0]][pl[1]]) + ')');
  });
  line('Full pick-up list', '→ see columns H–L');
  gap();

  title('EVENTS (people)');
  line('Thursday pizza night', '=SUM(' + col('pizza_people') + ')');
  line('Wine tasting: yes', '=SUM(' + col('wine_people') + ')');
  line('Wine tasting: maybe', '=SUM(' + col('wine_maybe_people') + ')');
  gap();

  title('FOOD (people)');
  ['any', 'vegetarian', 'vegan', 'gluten_free', 'other'].forEach(function (d) {
    line(LABELS.diet[d], '=SUM(' + col('diet_' + d) + ')');
  });
  line('Other, details', '=TEXTJOIN("; ",TRUE,' + col('diet_other_text') + ')');
  line('Allergies', '=TEXTJOIN("; ",TRUE,ARRAYFORMULA(IF(' + col('allergies') + '="","",' + col('household') + '&": "&' + col('allergies') + ')))');
  gap();

  title('FRIDGE');
  line('Households with wishes', '=COUNTIF(' + col('fridge_wishes') + ',"?*")');
  line('Full list of wishes', '→ see columns N–O');

  sh.getRange(1, 1, rows.length, 6).setValues(rows.map(function (r) { return r.map(function (c) { return typeof c === 'string' && c.charAt(0) === '=' ? '' : c; }); }));
  rows.forEach(function (r, ri) {
    r.forEach(function (c, ci) { if (typeof c === 'string' && c.charAt(0) === '=') sh.getRange(ri + 1, ci + 1).setFormula(c); });
    if (r[0] && r[0] === r[0].toUpperCase() && /[A-Z]/.test(r[0]) && !r[1]) sh.getRange(ri + 1, 1).setFontWeight('bold').setBackground('#E4E8D6');
  });
  // Pick-up list in columns H–L (open-ended, so it can grow): households that asked for a lift, by arrival day.
  var place = col('airport') + '&' + col('station');
  sh.getRange('H1:L1').setValues([['PICK-UP LIST', 'Where', 'Arrival day', 'Time', 'People · details']]).setFontWeight('bold').setBackground('#E4E8D6');
  sh.getRange('H2').setFormula(
    '=IFERROR(SORT(FILTER({' + col('household') + ',' + place + ',' + col('arrival_day') + ',' + col('arrival_time') + ',' +
    col('n_people') + '&" people · "&' + col('travel_details') + '},' + col('pickup') + '=TRUE),3,TRUE),"No pick-ups yet")');
  // Fridge wishes in columns N–O.
  sh.getRange('N1:O1').setValues([['FRIDGE WISHES', 'Wishes']]).setFontWeight('bold').setBackground('#E4E8D6');
  sh.getRange('N2').setFormula('=IFERROR(FILTER({' + col('household') + ',' + col('fridge_wishes') + '},' + col('fridge_wishes') + '<>""),"No wishes yet")');
  sh.setColumnWidth(14, 180);
  sh.setColumnWidth(15, 360);
  sh.setColumnWidth(1, 220);
  sh.setColumnWidths(2, 5, 150);
  sh.setColumnWidth(8, 180);
  sh.setColumnWidth(12, 320);
  sh.setFrozenRows(0);
}

function columnLetter(n) {
  var s = '';
  while (n > 0) { var m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
  return s;
}
