# Lab Guy — Web Application

## Project Structure

```
labguy/
├── index.html                    ← Single entry point (all HTML markup)
│
├── css/
│   ├── variables.css             ← Design tokens, reset, shared base styles
│   ├── auth.css                  ← Login & Register page styles
│   ├── dashboard.css             ← Main grid + sidebar nav styles
│   └── panels.css                ← All side panel styles
│
├── js/
│   ├── app.js                    ← Global App state, routing, toast, overlay
│   ├── auth.js                   ← Login/register/logout UI logic
│   ├── dashboard.js              ← Widget grid management
│   │
│   ├── firebase-config.js        ← Firebase initialization (safe to expose)
│   ├── firebase-auth.js          ← Firebase Auth service layer
│   ├── firebase-db.js            ← Firebase Realtime DB service layer
│   │
│   └── panels/
│       ├── widgets.js            ← Widget picker panel
│       ├── notifications.js      ← Notifications + approve/reject
│       ├── profile.js            ← Profile settings panel
│       ├── admin.js              ← Admin dashboard panel
│       └── settings.js          ← Settings panel
│
├── firebase-rules.json           ← Realtime Database security rules
└── LabGuy.png                    ← App logo (place here)
```

## Adding New Screens

Each new sub-screen follows this pattern:

1. **HTML** → Add markup to `index.html` (new `<div class="page">` or modal)
2. **CSS**  → Add styles to the relevant CSS file, or create a new one (e.g. `css/inventory.css`)
3. **JS**   → Create `js/panels/inventory.js` (or similar) with its own module
4. **DB**   → Add a new service to `firebase-db.js` if new data is needed

## Running Locally

ES Modules require a web server — **do not open index.html directly**.

```bash
# Option 1: Python
python -m http.server 8000

# Option 2: Node
npx serve .

# Option 3: VS Code Live Server extension
```

Then open: http://localhost:8000

## Firebase Setup

1. **Security Rules** — Paste contents of `firebase-rules.json` into:
   Firebase Console → Realtime Database → Rules

2. **Auth** — Enable Email/Password sign-in:
   Firebase Console → Authentication → Sign-in method → Email/Password → Enable

3. **GitHub Token** — NEVER put this in any file.
   Rotate it immediately at: https://github.com/settings/tokens

## Security Notes

- Firebase client config (API key, project ID) is safe to commit — Firebase
  security is enforced through Security Rules, not by hiding config values.
- Never commit secrets, GitHub tokens, or server-side service account keys.
- Always use `.gitignore` to exclude any `.env` files.
