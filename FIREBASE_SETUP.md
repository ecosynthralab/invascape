# Firebase Setup — one-time steps

This wires PhytoScout, Habitat Scorer, and Decision Layer into your
existing `tetfund-invasive-study` Firebase project. Three things to do,
all in the Firebase Console:

## 1. Get your web app config → paste into `firebase-config.js`

Project Settings (gear icon) → General tab → scroll to "Your apps" → if
there's no web app yet, click the `</>` icon to create one → copy the
`firebaseConfig` object → paste the values into `firebase-config.js` in
this folder, replacing the placeholders.

## 2. Create the team authentication account(s)

Authentication → Sign-in method tab → enable **Email/Password**.
Then Authentication → Users tab → create an account that is intended for
project use. Prefer a dedicated institutional account or per-user accounts
that are managed by the project lead.

Do not keep a shared password in a public chat, browser source, or repo.
Prefer a managed team account with a known owner, and use Firebase Auth +
role-based rules in production. If you must use a shared account for a
short-term demo, treat it like a secret and rotate it regularly.

This app should not depend on a public shared credential as its primary
security control.

## 3. Set the database rules

Realtime Database → Rules tab → replace the contents with a team-scoped
structure such as:

```json
{
  "rules": {
    "teams": {
      "$teamId": {
        "ecoplotscribe": {
          ".read": "auth != null",
          ".write": "auth != null"
        },
        "habitatScorer": {
          ".read": "auth != null",
          ".write": "auth != null"
        }
      }
    }
  }
}
```

This keeps each team or user namespace separate. For a prototype test, a
single team ID can be used on a device or browser profile, but the design is
meant to keep records from different teams in separate Firebase branches.

## How it behaves once this is done

- **PhytoScout**: saves locally immediately, then syncs to Firebase in
  the background — works the same whether anyone's signed in or not. If a
  save happens offline, it's marked "⏳ pending sync" in the log and retries
  automatically once the device reconnects.
- **Habitat Scorer**: same local-save behavior, but only syncs to Firebase
  once someone's signed in with the team account. Not signed in yet? Scores
  still save locally, they just show "⏳ pending sync" until sign-in happens.
- **Decision Layer**: requires the team sign-in before showing anything,
  since it needs to read Habitat Scorer's data anyway. Once signed in, it
  pulls the *entire team's* plots from Firebase — not just this device's —
  so it finally reflects what everyone has collected, not just whoever's
  phone you're looking at.

## What this doesn't cover yet

Everyone still needs the actual `firebase-config.js` values and the shared
password — there's no way around handing those out once, by whatever
channel you trust (WhatsApp, email, in person).
