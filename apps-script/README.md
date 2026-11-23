# RSVP backend: Google Sheet + Apps Script

About 10 minutes, no coding. You need a Google account. The Sheet stays private to you; guests never see it.

## 1. Create the Sheet and paste the script

1. Go to <https://sheets.new> and name the spreadsheet, e.g. **Wedding RSVPs**.
2. Menu **Extensions → Apps Script**. A code editor opens in a new tab.
3. Delete everything in `Code.gs`, paste in the whole contents of [`Code.gs`](Code.gs) from this folder, and click **Save** (disk icon).
4. In the toolbar, pick **`setupSheet`** in the function dropdown and click **Run**.
5. Google asks for permission the first time: **Review permissions** → choose your account → *"Google hasn't verified this app"* → **Advanced** → **Go to … (unsafe)** → **Allow**.
   That warning appears because this is your own private script, not a published app. It only gets access to this one spreadsheet.
6. Go back to the Sheet tab and **reload** it. You now have the tabs **Guests, Settings, Responses, Latest, Summary** and a **Wedding** menu.

## 2. Add guests

1. **Settings** tab: put the website address in `site_url` (B2), e.g. `https://schlan.github.io/wedding-website`. You can change it later; the invite links update on their own.
2. **Guests** tab: one row per person.
   | Column | What to type |
   |---|---|
   | `household` | The same text for everyone in one household, e.g. `Murphy family` |
   | `name` | First name as it should appear: "Dear Aoife & Ciarán," |
   | `child` | Tick for children |
   | `lang` | `en` or `de` (the language the site opens in for them) |
   | `notes` | Anything for yourselves |

   Leave `code`, `guest_id` and `invite_url` empty.
3. Menu **Wedding → Fill in codes & links**. Each household gets a private code, and `invite_url` shows its personal link. Send that link to the household.
   Adding more guests later: add rows and run it again. Existing codes never change.

## 3. Put the backend online

1. In the Apps Script tab: **Deploy → New deployment**.
2. Click the gear next to *Select type* → **Web app**.
3. Set **Execute as: Me** and **Who has access: Anyone**.
   It must be "Anyone", not "Anyone with a Google account", or guests without one get an error. "Anyone" only means anyone with the address can use the RSVP functions; nobody can open the Sheet.
4. **Deploy**, then copy the **Web app URL** (it ends in `/exec`).
5. In the website folder, open `site/config.js` and replace `"mock"` with that URL:
   ```js
   APPS_SCRIPT_URL: "https://script.google.com/macros/s/AKfy…/exec",
   ```
   Then redeploy the website (commit and push; see the main README).

## 4. Test it

1. Menu **Wedding → Send a test RSVP**. It sends a full RSVP for the first household. Check that rows appear in **Responses** and **Latest** and that the **Summary** numbers change, then delete the test rows from Responses and Latest.
2. Open one household's invite link: you should see "Dear …," with their names. Send an RSVP and check **Latest**. Reopen the link: it should say you've already replied and keep the answers.

## Changing the script later

Saving isn't enough. After pasting a new version of `Code.gs`:
**Deploy → Manage deployments → pencil icon → Version: New version → Deploy.** The URL stays the same, so `config.js` doesn't change.

If you add columns or the Summary looks broken, run **Wedding → Set up sheet** again. It rebuilds the Summary and adds missing headers, and never deletes guests or answers.

## What's in each tab

- **Guests**: your list (you edit it).
- **Responses**: every submission ever made, newest at the bottom, including the full answer (`payload_json`). Don't edit.
- **Latest**: one row per household with its current answers. Overwritten when a household changes its RSVP. Don't edit.
- **Summary**: headcounts, arrivals and departures, pick-ups (full list in columns H–L), pizza and wine numbers, diets and allergies, and the fridge shopping list. Formulas only.

## Privacy

The answers include allergies and diets. Keep the Sheet private (don't share it with "anyone with the link"), and delete it after the wedding (open item 10).
