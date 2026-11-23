# Éadaoin & Sebastian · wedding website

A static site (plain HTML, CSS and JavaScript, no build step) plus a Google Apps Script backend that stores RSVPs in a Google Sheet. The brief is in `handoff/wedding-site-handoff/HANDOFF.md`, which is kept out of git on purpose (see below).

```
site/          ← the website; this folder is what gets deployed
  config.js    ← settings: Apps Script URL, contact email, Maps link, ceremony time
  i18n/        ← all text, English and German
apps-script/   ← the RSVP backend: Code.gs + setup guide
tools/prep-images.sh   ← makes web-ready photos (run again if better photos arrive)
```

## Run it locally

```sh
python3 -m http.server 8000 -d site
```

Open <http://localhost:8000/?g=test>. While `APPS_SCRIPT_URL` in `config.js` is `"mock"`, the site runs in **demo mode**: a fake guest list, and answers are saved only in your browser. Demo links:

| Link | What it shows |
|---|---|
| `?g=test` | English household of three (one child) |
| `?g=de` | German household of two |
| `?g=solo` | One person |
| no `?g=`, or `?g=anything-else` | The "use your personal link" message |
| `?g=fail` / `?g=slow` | The lookup fails / times out → "Try again" |
| `?g=sendfail` | Sending the RSVP fails |

To reset demo answers, clear the site's data in the browser.

## Edit text or settings

- Words: `site/i18n/en.json` and `site/i18n/de.json` (same keys in both).
- Settings: `site/config.js`.
- Photos: put new originals in `handoff/wedding-site-handoff/assets/photos/` with the same names and run `sh tools/prep-images.sh` (needs `cwebp`: `brew install webp`).

## Going live, in order

The site is hosted on **GitHub Pages** at <https://schlan.github.io/wedding-website/>. Every push to `main` that changes `site/` publishes it automatically (`.github/workflows/pages.yml`); watch progress under the repo's **Actions** tab.

1. **Set up the RSVP Sheet**: follow [`apps-script/README.md`](apps-script/README.md). Use `https://schlan.github.io/wedding-website` as `site_url`.
2. **Connect them**: in `site/config.js`, set `APPS_SCRIPT_URL` to the web app URL, and fill in `CONTACT_EMAIL` (plus `MAPS_URL` / `CEREMONY_TIME` if you have them). Commit and push.
3. **Test with a real link** from the Guests tab (`invite_url`), on your phone: greeting, a full RSVP, then reopen the link to check the answers come back. Delete the test rows from Responses and Latest.
4. **Send the links.**

Until step 2, the live site runs in demo mode (with a "Demo mode" badge).

### Notes on GitHub Pages

- The repo is public (free Pages needs that). The guest list lives only in the Google Sheet, never in the repo. `handoff/` (the brief and design files) is git-ignored and stays on your computer, so keep a backup of it.
- `site/_headers` is only used by Netlify; GitHub Pages ignores it. The page itself carries `noindex` and a Content-Security-Policy, so search engines stay away and the security basics are covered.
- `robots.txt` isn't at the domain root on a project page, so crawlers won't read it; the `noindex` tag still applies.
- Custom domain (optional): repo **Settings → Pages → Custom domain**, then update `site_url` in the Sheet.

**Moving to Netlify instead** also works without code changes: import the repo with *Base directory* `site`, no build command, *Publish directory* `site`.

## Open items (TODO)

1. Casa Bini's exact address → `MAPS_URL` in `config.js` and the map pin in `index.html`.
2. Drive time from Pisa airport → `travel.psa.text` in both i18n files.
3. Ceremony time → `CEREMONY_TIME` in `config.js`.
4. Winery for Saturday, once booked.
5. Contact email → `CONTACT_EMAIL` in `config.js`. **Needed before launch.**
6. German copy review (`site/i18n/de.json`).
7. Higher-resolution venue photos, especially the hero.
8. Domain name (optional).
9. Can guests leave on Saturday?
10. Privacy line wording, and when to delete the Sheet.
11. Re-check travel facts before launch.
12. Apps Script backend: set it up (`apps-script/README.md`), then put its URL in `APPS_SCRIPT_URL` (replacing `"mock"`).
