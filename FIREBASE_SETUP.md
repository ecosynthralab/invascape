# Firebase Setup — one-time steps

This wires PhytoScout, Habitat Scorer, and Decision Layer into your
existing `tetfund-invasive-study` Firebase project. Three things to do,
all in the Firebase Console:

## 1. Get your web app config → paste into `firebase-config.js`

Project Settings (gear icon) → General tab → scroll to "Your apps" → if
there's no web app yet, click the `</>` icon to create one → copy the
`firebaseConfig` object → paste the values into `firebase-config.js` in
this folder, replacing the placeholders.

## 2. Create the shared team account

Authentication → Sign-in method tab → enable **Email/Password**.
Then Authentication → Users tab → Add user:
- Email: `ecosynthralab@gmail.com`
- Password: whatever you want the team to share

Since this is a real inbox, Firebase's "forgot password" flow will actually
deliver a reset email here if the shared password ever needs recovering —
worth knowing whoever has access to this inbox can effectively reset the
team's login.

Give this email + password to your co-researchers. It's what they'll type
into the "Team Sign In" card on Habitat Scorer and Decision Layer. Everyone
uses the same one — this isn't per-person accounts, just a shared gate.

## 3. Set the database rules

Realtime Database → Rules tab → replace the contents with:

```json
{
  "rules": {
    "ecoplotscribe": {
      ".read": true,
      ".write": true
    },
    "habitatScorer": {
      ".read": "auth != null",
      ".write": "auth != null"
    }
  }
}
```

Click **Publish**. This is what makes PhytoScout genuinely public (no
login needed to submit a plot) while Habitat Scorer and Decision Layer
require the shared team login.

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
