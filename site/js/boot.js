// Runs before the page renders: picks the starting language and starts loading its text.
(function () {
  var saved = null;
  try { saved = localStorage.getItem("lang"); } catch (e) {}
  if (saved !== "en" && saved !== "de") saved = null;
  var lang = saved || (/^de/i.test(navigator.language || "") ? "de" : "en");
  window.__LANG = { lang: lang, manual: !!saved };
  document.documentElement.lang = lang;

  var link = document.createElement("link");
  link.rel = "preload";
  link.as = "fetch";
  link.crossOrigin = "anonymous";
  link.href = "i18n/" + lang + ".json";
  document.head.appendChild(link);

  // Start the guest lookup right away (it takes ~2 s); app.js picks it up when it loads.
  var cfg = window.SITE_CONFIG || {};
  var m = /[?&]g=([^&#]*)/.exec(location.search);
  var code = m ? decodeURIComponent(m[1].replace(/\+/g, " ")).trim() : "";
  if (code && cfg.APPS_SCRIPT_URL && cfg.APPS_SCRIPT_URL !== "mock" && window.fetch) {
    var p = fetch(cfg.APPS_SCRIPT_URL + "?action=guest&code=" + encodeURIComponent(code), { credentials: "omit" })
      .then(function (r) { if (!r.ok) throw new Error("lookup " + r.status); return r.json(); });
    p.catch(function () {}); // handled in app.js
    window.__earlyLookup = { code: code, promise: p };
  }

  // Never keep the page hidden for long, even if a script fails to load.
  setTimeout(function () { document.documentElement.classList.remove("i18n-pending"); }, 2500);
  setTimeout(function () { document.documentElement.classList.add("is-ready"); }, 8000);
})();
