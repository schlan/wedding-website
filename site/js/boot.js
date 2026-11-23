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

  // Never keep the page hidden for long, even if the text fails to load.
  setTimeout(function () { document.documentElement.classList.remove("i18n-pending"); }, 2500);
})();
