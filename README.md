# World PC

A private, art-deco family globe. Everyone taps around, adds the countries
they've visited, and watches their own color fill in on a shared map — plus
a leaderboard and a photo scrapbook per country.

This app is a set of plain files (HTML/CSS/JS) — there is nothing to
"install" or compile. It needs two free accounts to come alive:

- **Firebase** — the shared database, so everyone sees everyone's countries
  in real time.
- **GitHub** — free website hosting, so the link works on any phone.

Neither needs a credit card. Follow the two sections below in order —
Firebase first, then GitHub — and you'll have a working link in about
15 minutes. Take your time; every step is spelled out.

---

## Part 1 — Firebase (the shared database)

1. Go to **https://console.firebase.google.com** and sign in with any
   Google account (or create one — it's free).
2. Click **"Add project"** (or **"Create a project"**).
   - Name it anything, e.g. `world-pc`.
   - When asked about Google Analytics, you can turn it **off** — you don't
     need it.
   - Click **Create project**, then **Continue** once it's ready.
3. On the project's home screen, click the **`</>`** ("Web") icon to add a
   web app.
   - Give it a nickname, e.g. `world-pc-web`.
   - You do **not** need "Firebase Hosting" checked — leave it unchecked
     (GitHub will host the site instead).
   - Click **Register app**.
4. Firebase now shows a code block that starts with `const firebaseConfig = {`.
   That object — the part between `{` and `}` — is what you need. It looks
   like this:
   ```js
   const firebaseConfig = {
     apiKey: "AIza...",
     authDomain: "world-pc-xxxxx.firebaseapp.com",
     projectId: "world-pc-xxxxx",
     storageBucket: "world-pc-xxxxx.appspot.com",
     messagingSenderId: "123456789",
     appId: "1:123456789:web:abc123",
   };
   ```
   Open **`firebase-config.js`** in this folder and replace the six
   `"PASTE_YOUR_..._HERE"` placeholders with your own six values (keep the
   quote marks). Save the file. Click **Continue to console**.
5. In the left sidebar, click **Build → Firestore Database**, then
   **Create database**.
   - Pick any location close to you (it doesn't matter much).
   - Choose **Start in production mode** (not test mode) — this ensures
     your app keeps working after Firebase's default 30-day test-mode
     window closes. Click **Create**.
6. Click the **Rules** tab (next to "Data" at the top of the Firestore
   page). Delete everything in the box and paste in the contents of
   **`firestore.rules`** from this folder. Click **Publish**.
   - These rules are intentionally open: anyone with your site's link can
     read the map and add/remove countries and photos, with no login. This
     app has no accounts — it's a shared family scrapbook, not a private
     account system. The rules only check that new data looks like a real
     "visit" from one of the four names in the app.

Firebase is done. Everything else is on GitHub.

---

## Part 2 — GitHub Pages (free hosting)

1. Go to **https://github.com** and create a free account if you don't
   have one.
2. Click the **+** in the top-right → **New repository**.
   - Name it `world-pc` (or anything).
   - Set it to **Public** (GitHub Pages' free tier needs a public repo).
   - Don't check any of the "initialize with…" boxes. Click **Create
     repository**.
3. On the new repo's page, click **"uploading an existing file"** (a blue
   link in the middle of the page).
4. From your computer, drag in **every file and folder** from this
   `world-pc` folder — `index.html`, `style.css`, `app.js`,
   `firebase-config.js` (with your real keys already pasted in),
   `firestore.rules`, the `data` folder, and the `assets` folder. GitHub
   preserves the folder structure automatically.
5. Scroll down and click **Commit changes**.
6. Go to the repo's **Settings** tab → **Pages** (left sidebar).
   - Under "Build and deployment", set **Source** to **Deploy from a
     branch**.
   - Set **Branch** to `main` and folder to `/ (root)`. Click **Save**.
7. Wait about a minute, then refresh that Pages settings page. GitHub shows
   a green box with your live link:
   `https://<your-username>.github.io/world-pc/`

That link is **World PC** — send it to Allard, Brian, Paksy, and Vosse.
It works straight from a phone browser; each person can add it to their
home screen (in Safari: Share → Add to Home Screen; in Chrome: ⋮ menu →
Add to Home screen) so it opens like an app.

---

## Pushing updates later

Whenever you want a change (new feature, a fix, different wording), the
easiest path is to come back to me with the request — I'll edit the files
and hand you the updated ones. To publish them:

1. In your GitHub repo, open the file that changed and click the pencil
   (✎) icon to edit it, **or** delete the old file and drag in the new one
   the same way you did the first time.
2. Click **Commit changes**.

GitHub Pages rebuilds automatically within a minute — no other steps
needed. (If you'd rather I walk you through a proper `git` workflow at
some point, just ask — but the drag-and-drop method above is all you need
for now.)

---

## How the app is organized

- `index.html` / `style.css` / `app.js` — the whole app.
- `firebase-config.js` — **the only file with your personal setup** in it.
- `firestore.rules` — the security rules (reference copy; the live ones
  live in the Firebase console once you've pasted them in).
- `data/countries.json` — the list of 175 countries (name, flag, code)
  used by the search box.
- `data/world-110m.json` — the map outline data that draws the globe.
- `assets/icons/` — the four family medallion portraits + favicon.
- `assets/img/` — the splash-screen cover photo and background texture.

## A few notes on how it behaves

- **No login.** Tapping a name in the top-left just switches whose map
  you're looking at / adding to on *this* device — it doesn't lock
  anything down. Anyone can add countries for anyone. That was the
  tradeoff for "no accounts, just a link" — see the note in Part 1, step 6.
- **Photos** are compressed in the browser before saving (so they don't
  blow through Firebase's free storage) and are visible to the whole
  family, not just the person who added them.
- **Your device remembers** the last family member you had selected, so
  each person's phone will naturally "stick" to their own name after the
  first switch.
- Firebase's free ("Spark") plan comfortably covers a family's worth of
  use — tens of thousands of reads/writes a day, 1 GB of data. You will
  not hit a paywall from normal use.
