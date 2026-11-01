// Players + cloud sync tests, with two simulated computers sharing a fake cloud.
//
//   node tools/test-sync.mjs     (or: npm run test:sync)
const bus = new EventTarget();
globalThis.addEventListener = bus.addEventListener.bind(bus);
globalThis.removeEventListener = bus.removeEventListener.bind(bus);
globalThis.dispatchEvent = bus.dispatchEvent.bind(bus);

function makeStorage() {
    const m = new Map();
    return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), _m: m };
}
const machineA = makeStorage(), machineB = makeStorage();
const on = (machine) => { globalThis.localStorage = machine; };
on(machineA);

const { Tutor } = await import('../src/utils/skillModel.js');
const { ZooProgress } = await import('../src/components/zoo.js');
const P = await import('../src/utils/players.js');
const { CloudSync } = await import('../src/utils/cloudSync.js');

let failed = 0;
function check(name, ok, detail = '') {
    if (!ok) failed++;
    console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${ok ? '' : '  -> ' + detail}`);
}
let clock = Date.UTC(2026, 9, 1); Date.now = () => clock;
let seed = 3; Math.random = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };

function play(id, n) {
    const k = P.keysFor(id);
    const t = new Tutor({ storageKey: k.tutor }), z = new ZooProgress({ storageKey: k.zoo });
    for (let i = 0; i < n; i++) {
        const { q, why } = t.next(); t.record(q, true, 2, why); z.add(1);
        P.appendAttempt(id, { op: q.op, a: q.a, b: q.b, answer: q.answer, correct: true, ms: 2000, why });
        clock += 1000;
    }
    return { t: t.t, stars: z.stars };
}

// Fake cloud shared by both machines (same Google account).
const cloudDocs = {};
function fakeBackend() {
    let cb = null;
    return {
        onUser(f) { cb = f; },
        async signIn() { await cb({ uid: 'family1', displayName: 'Parent', email: 'p@example.com' }); },
        async signOut() { await cb(null); },
        async load(uid) { return cloudDocs[uid] ? JSON.parse(JSON.stringify(cloudDocs[uid])) : null; },
        async save(uid, data) {
            const d = cloudDocs[uid] || { players: {}, progress: {} };
            cloudDocs[uid] = { players: { ...d.players, ...data.players }, progress: { ...d.progress, ...data.progress } };
        },
    };
}

// --- Existing progress (from before players) is adopted by the first player.
{
    const old = new Tutor(); const oz = new ZooProgress();
    for (let i = 0; i < 6; i++) { const { q, why } = old.next(); old.record(q, true, 2, why); } oz.add(9);
    check('unclaimed progress detected', P.hasUnclaimedProgress());
    const mia = P.addPlayer('Mia');
    const got = P.readProgress(mia.id);
    check('first player keeps the old progress', got.tutor && got.tutor.t === 6 && got.zoo.stars === 9, JSON.stringify(P.progressOf(got)));
    check('old keys cleared', !P.hasUnclaimedProgress());
    const leo = P.addPlayer('Leo');
    check('second player starts fresh', P.progressOf(P.readProgress(leo.id))[0] === 0);
    check('players listed in order', P.listPlayers().map((p) => p.name).join(',') === 'Mia,Leo');
    check('progress kept separately', play(leo.id, 4).t === 4 && P.readProgress(mia.id).tutor.t === 6);
}

// --- Sign in on machine A: everything goes up to the cloud.
const states = [];
const syncA = new CloudSync({ backend: fakeBackend(), onState: (s) => states.push(s.status) });
await syncA.init();
await syncA.signIn();
await syncA.busy;
check('signed in and synced', syncA.status === 'synced', states.join('>'));
check('cloud has both players', Object.keys(cloudDocs.family1.players).length === 2);

// --- Machine B (fresh browser), same Google account: players appear with their progress.
on(machineB);
check('machine B starts empty', P.listPlayers().length === 0);
const pulled = [];
const syncB = new CloudSync({ backend: fakeBackend(), onState: () => {}, onPulled: (ids) => pulled.push(...ids) });
await syncB.init();
await syncB.signIn();
await syncB.busy;
const onB = P.listPlayers();
const miaB = onB.find((p) => p.name === 'Mia');
check('machine B sees Mia and Leo', onB.length === 2 && !!miaB, onB.map((p) => p.name).join(','));
check("machine B has Mia's progress", P.progressOf(P.readProgress(miaB.id))[0] === 6);
check('pulled players reported', pulled.length === 2);

// --- Mia plays more on B; the change reaches the cloud after the save signal.
play(miaB.id, 5);
await new Promise((r) => setTimeout(r, 3300));
await syncB.busy;
const cloudMia = JSON.parse(cloudDocs.family1.progress[miaB.id]);
check('progress made on B reaches the cloud', cloudMia.tutor.t === 11, cloudMia.tutor.t);

// --- Back on A: Mia's newer progress comes down; Leo (more on A) is kept.
on(machineA);
const leoA = P.listPlayers().find((p) => p.name === 'Leo');
play(leoA.id, 3);                 // Leo: 7 on A vs 4 in the cloud
await syncA.sync();
check("A gets Mia's progress from B", P.progressOf(P.readProgress(miaB.id))[0] === 11);
check("A keeps Leo's further-along progress", P.progressOf(P.readProgress(leoA.id))[0] === 7);
check("A has Mia's answer history from both machines", P.readHistory(miaB.id).length === 5, P.readHistory(miaB.id).length);
check("cloud updated with Leo's progress", JSON.parse(cloudDocs.family1.progress[leoA.id]).tutor.t === 7);

// --- Older copy never overwrites newer (most progress wins).
on(machineB);
await syncB.sync();
check('B: Leo updated to 7', P.progressOf(P.readProgress(leoA.id))[0] === 7);
check('B: Mia still 11', P.progressOf(P.readProgress(miaB.id))[0] === 11);

// --- Backup file round trip into a third machine.
const backup = P.exportBackup();
on(makeStorage());
const res = P.importBackup(backup);
check('backup restores both players', P.listPlayers().length === 2 && res.changed.length === 2);
let threw = false; try { P.importBackup('{"hello":1}'); } catch (e) { threw = true; }
check('rejects a non-backup file', threw);

// --- Without Firebase settings, sync stays off.
const off = new CloudSync({ onState: () => {}, config: null });
check('no config -> sync unavailable', !off.available);

console.log(failed ? `\n${failed} failing` : '\nall passing');
process.exit(failed ? 1 : 0);
