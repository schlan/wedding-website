# RSVP backend: Google Sheet + Apps Script

About 10 minutes, no coding. You need a Google account. The Sheet stays private to you; guests never see it.

## 1. Create the Sheet and paste the script

1. Go to <https://sheets.new> and name the spreadsheet, e.g. **Wedding RSVPs**.
2. Menu **Extensions → Apps Script**. A code editor opens in a new tab.
3. Click **Untitled project** at the top and rename it, e.g. **Wedding RSVP**. (That's the name Google shows on the permission screen.)
4. Delete everything in `Code.gs`, paste in the whole contents of [`Code.gs`](Code.gs) from this folder, and click **Save** (disk icon). Make sure the first lines, including `@OnlyCurrentDoc`, came along.
5. In the toolbar, pick **`setupSheet`** in the function dropdown and click **Run**.
6. Google asks for permission the first time: *"Wedding RSVP wants access to your Google Account"* → choose your account → *"Google hasn't verified this app"* → **Advanced** → **Go to Wedding RSVP (unsafe)** → **Allow**.
   That warning appears because this is your own private script, not a published app. The permissions listed should be only:
   - *View and manage spreadsheets that this application has been installed in* (just this Sheet), and
   - *Display and run third-party web content in prompts and sidebars inside Google applications* (the Wedding menu's pop-up messages).

   If it asks to *"See, edit, create and delete all your Google Sheets spreadsheets"*, the `@OnlyCurrentDoc` line is missing. Cancel and paste the script again.
7. Go back to the Sheet tab and **reload** it. You now have the tabs **Guests, Settings, Responses, Latest, Summary** and a **Wedding** menu.

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

If a new version changes the columns, **Set up sheet** stops with a message when Latest or Responses still hold rows in the old layout. Delete those rows if they're only tests (keep row 1), then run it again.

Saving isn't enough. After pasting a new version of `Code.gs`:
**Deploy → Manage deployments → pencil icon → Version: New version → Deploy.** The URL stays the same, so `config.js` doesn't change.

If you add columns or the Summary looks broken, run **Wedding → Set up sheet** again. It rebuilds the Summary and adds missing headers, and never deletes guests or answers.

## What's in each tab

- **Guests**: your list (you edit it).
- **Responses**: every submission ever made, newest at the bottom, including the full answer (`payload_json`). Don't edit.
- **Latest**: one row per household with its current answers. Overwritten when a household changes its RSVP. Don't edit.
- **Summary**: headcounts, arrivals and departures, pick-ups (full list in columns H–L), pizza and wine numbers, diets and allergies, and everyone's fridge wishes (columns N–O). Formulas only.

## Privacy

The answers include allergies and diets. Keep the Sheet private (don't share it with "anyone with the link"), and delete it after the wedding (open item 10).
