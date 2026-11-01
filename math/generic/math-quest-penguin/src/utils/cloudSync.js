// Cloud sync: sign in with Google once per device, and every child's progress
// follows them to any computer. Uses Firebase (Auth + Firestore, free tier).
//
// One Firestore document per family (= per Google account):
//   families/{uid} = {
//     players:  { id: { name, avatar, createdAt } },
//     progress: { id: "<JSON of {tutor, zoo}>" },   (a string, replaced whole)
//     updatedAt
//   }
// Security rule: only the signed-in owner can read/write their document
// (see FIREBASE_SETUP.md).
//
// The game always plays from this device's storage; the cloud is a copy.
// Sync = read the cloud copy, merge it in (most progress wins per child, see
// players.js), write back whatever this device has that is further along.
// It runs at sign-in, at page load when already signed in, and a few seconds
// after progress changes.

import { firebaseConfig } from '../firebaseConfig.js';
import { snapshot, mergeIn } from './players.js';

const SDK = 'https://www.gstatic.com/firebasejs/10.12.5/';
const PUSH_DELAY_MS = 3000;

/** Firebase-backed storage: load(uid) / save(uid, data). */
async function firebaseBackend(config) {
    const [{ initializeApp }, auth, fs] = await Promise.all([
        import(`${SDK}firebase-app.js`),
        import(`${SDK}firebase-auth.js`),
        import(`${SDK}firebase-firestore.js`),
    ]);
    const app = initializeApp(config);
    const a = auth.getAuth(app);
    const db = fs.getFirestore(app);
    return {
        onUser(cb) { return auth.onAuthStateChanged(a, cb); },
        signIn() { return auth.signInWithPopup(a, new auth.GoogleAuthProvider()); },
        signOut() { return auth.signOut(a); },
        async load(uid) {
            const snap = await fs.getDoc(fs.doc(db, 'families', uid));
            return snap.exists() ? snap.data() : null;
        },
        async save(uid, data) {
            await fs.setDoc(fs.doc(db, 'families', uid), { ...data, updatedAt: fs.serverTimestamp() }, { merge: true });
        },
    };
}

// Cloud document <-> the shape players.js uses.
export function fromCloud(doc) {
    if (!doc) return null;
    const progress = {};
    for (const [id, raw] of Object.entries(doc.progress || {})) {
        try { progress[id] = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch (e) { /* skip damaged entry */ }
    }
    return { players: doc.players || {}, progress };
}
export function toCloud(snap, ids) {
    const progress = {};
    for (const id of ids) if (snap.progress[id]) progress[id] = JSON.stringify(snap.progress[id]);
    return { players: snap.players, progress };
}

export class CloudSync {
    /**
     * @param {object} opts
     * @param {(state: {status: string, user: object|null, message?: string}) => void} opts.onState
     * @param {(changedIds: string[]) => void} [opts.onPulled] progress on this device was updated from the cloud
     * @param {object} [opts.backend] for tests: { onUser, signIn, signOut, load, save }
     */
    constructor({ onState, onPulled = () => {}, backend = null, config = firebaseConfig } = {}) {
        this.onState = onState || (() => {});
        this.onPulled = onPulled;
        this.backend = backend;
        this.config = config;
        this.user = null;
        this.status = this.available ? 'starting' : 'off';
        this.pushTimer = null;
        this.busy = Promise.resolve();
    }

    /** False until firebaseConfig.js is filled in. */
    get available() { return !!(this.backend || (this.config && this.config.apiKey)); }

    _set(status, message) {
        this.status = status;
        this.onState({ status, user: this.user, message });
    }

    async init() {
        if (!this.available) { this._set('off'); return; }
        try {
            if (!this.backend) this.backend = await firebaseBackend(this.config);
        } catch (e) {
            console.warn('Cloud sync unavailable:', e);
            this._set('error', "Couldn't reach Google — playing offline on this device");
            return;
        }
        this.backend.onUser(async (u) => {
            this.user = u ? { uid: u.uid, name: u.displayName || '', email: u.email || '' } : null;
            if (!this.user) { this._set('signed-out'); return; }
            await this.sync();
        });
        // Saves made BY a sync must not schedule another sync.
        addEventListener('mqp:saved', () => { if (!this.inSync) this.schedulePush(); });
    }

    async signIn() {
        if (!this.backend) return;
        try {
            await this.backend.signIn(); // onUser fires and syncs
        } catch (e) {
            if (e && e.code === 'auth/popup-closed-by-user') return;
            this._set('error', e && e.code === 'auth/unauthorized-domain'
                ? 'This website is not on the Firebase sign-in list yet (see setup step 4)'
                : 'Sign-in did not work — try again');
        }
    }

    async signOut() {
        if (this.backend) await this.backend.signOut();
    }

    schedulePush() {
        if (!this.user) return;
        clearTimeout(this.pushTimer);
        this.pushTimer = setTimeout(() => this.sync(), PUSH_DELAY_MS);
    }

    /** Pull, merge, push - serialized so two syncs never overlap. */
    sync() {
        this.busy = this.busy.then(() => this._sync()).catch(() => {});
        return this.busy;
    }

    async _sync() {
        if (!this.user) return;
        this._set('syncing');
        try {
            this.inSync = true;
            const remote = fromCloud(await this.backend.load(this.user.uid));
            const { changed, localNewer } = mergeIn(remote || { players: {}, progress: {} });
            this.inSync = false;
            const snap = snapshot();
            const remoteIds = new Set(Object.keys((remote && remote.players) || {}));
            const missingThere = Object.keys(snap.players).filter((id) => !remoteIds.has(id));
            const push = [...new Set([...localNewer, ...missingThere])];
            if (push.length || !remote || Object.keys(snap.players).length !== remoteIds.size) {
                await this.backend.save(this.user.uid, toCloud(snap, push));
            }
            if (changed.length) this.onPulled(changed);
            this._set('synced');
        } catch (e) {
            this.inSync = false;
            console.warn('Sync failed:', e);
            this._set('error', 'Not synced right now — progress is saved on this device and will sync later');
        }
    }
}
