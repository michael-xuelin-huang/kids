# Google sign-in and cloud sync: one-time setup (about 10 minutes)

The game works without this: progress is then saved on each computer
separately. After this setup, a parent signs in with Google once on each
computer, and every child's progress (zoo, stars, what they know, answer
history for the progress report) is the same everywhere.

Firebase's free plan (Spark) is more than enough for a family.

1. **Create a project.** Go to https://console.firebase.google.com, choose
   *Create a project*, name it (for example `pingo-math-zoo`). Google Analytics
   is not needed.
2. **Register the web app.** In the project, click the web icon `</>` ("Add
   app"), name it `Pingo`, leave Firebase Hosting unticked, and register. Copy
   the `firebaseConfig = { apiKey: ..., authDomain: ..., projectId: ..., ... }`
   block it shows.
3. **Turn on Google sign-in.** *Build → Authentication → Get started →
   Sign-in method → Google → Enable*, pick a support email, *Save*.
4. **Allow the game's address.** *Authentication → Settings → Authorized
   domains → Add domain*: `michael-xuelin-huang.github.io`
5. **Create the database.** *Build → Firestore Database → Create database*.
   Pick a location near you (for example `us-west2` or `nam5`), choose
   *Production mode* (Standard edition if asked). Then open the *Rules* tab,
   replace everything with the rules below, and *Publish*:

   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /families/{uid} {
         allow read, write: if request.auth != null && request.auth.uid == uid;
       }
     }
   }
   ```

   Each Google account can only read and write its own family's progress.
6. **Put the config into the game.** Paste the block from step 2 into
   `src/firebaseConfig.js`:

   ```js
   export const firebaseConfig = {
     apiKey: "...",
     authDomain: "pingo-math-zoo.firebaseapp.com",
     projectId: "pingo-math-zoo",
     storageBucket: "...",
     messagingSenderId: "...",
     appId: "..."
   };
   ```

   then run `npm run stamp` and commit. (These values are meant to be public;
   the rules in step 5 are what protect the data.)

After that, the "Who's playing?" screen shows **Sign in with Google**.

How syncing behaves:
- The game always plays from the computer's own copy, so it keeps working
  offline; it syncs at sign-in, when the page opens, and a few seconds after
  each answer.
- If the same child played on two computers, the copy with more progress wins
  for the zoo and the times-table state, and answer histories are combined.
