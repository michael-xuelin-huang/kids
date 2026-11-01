// Players ("Who's playing?"): each child has their own saved progress on this
// device, and - when signed in with Google - in the cloud (cloudSync.js).
//
// Storage (localStorage):
//   math-quest-penguin.players.v1      { players: { id: { name, avatar, createdAt } } }
//   math-quest-penguin.currentPlayer   id of the last child who played here
//   <tutor key>@<id>, <zoo key>@<id>   that child's progress
//
// Progress saved before players existed is adopted by the first player added.
//
// Merging two copies of the same child's progress (this device vs. the cloud,
// or a backup file): the copy with MORE PROGRESS wins (questions answered,
// then stars), so nothing a child earned on any machine is lost.

import { TUTOR_KEY } from './skillModel.js';
import { ZOO_KEY } from '../components/zoo.js';

const LIST_KEY = 'math-quest-penguin.players.v1';
const CURRENT_KEY = 'math-quest-penguin.currentPlayer';
export const AVATARS = ['gentoo', 'emperor', 'rockhopper', 'adelie', 'king', 'littleBlue', 'macaroni', 'chick'];

const get = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const set = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* storage full or blocked */ } };
const parse = (raw) => { try { return raw ? JSON.parse(raw) : null; } catch (e) { return null; } };

export const HISTORY_KEY = 'math-quest-penguin.history.v1';
export const keysFor = (id) => ({ tutor: `${TUTOR_KEY}@${id}`, zoo: `${ZOO_KEY}@${id}`, history: `${HISTORY_KEY}@${id}` });

// Answer history, compact: [timeMs, op, a, b, answer, correct(1|0), ms, why, heard]
// (heard = the wrong number said, or null). Kept to the most recent MAX_HISTORY.
const MAX_HISTORY = 1500;

export function appendAttempt(id, { op, a, b, answer, correct, ms, why, heard = null }) {
    const k = keysFor(id).history;
    const h = parse(get(k)) || [];
    h.push([Date.now(), op, a, b, answer, correct ? 1 : 0, Math.round(ms), why || '', heard]);
    if (h.length > MAX_HISTORY) h.splice(0, h.length - MAX_HISTORY);
    set(k, JSON.stringify(h));
}

export function readHistory(id) {
    return (parse(get(keysFor(id).history)) || []).map(([at, op, a, b, answer, ok, ms, why, heard]) =>
        ({ at, op, a, b, answer, correct: ok === 1, ms, why, heard }));
}

function unionHistory(x = [], y = []) {
    const seen = new Map();
    for (const r of [...x, ...y]) if (Array.isArray(r)) seen.set(`${r[0]}|${r[1]}|${r[2]}|${r[3]}`, r);
    return [...seen.values()].sort((p, q) => p[0] - q[0]).slice(-MAX_HISTORY);
}

function readList() {
    const s = parse(get(LIST_KEY));
    return s && s.players && typeof s.players === 'object' ? s.players : {};
}
function writeList(players) {
    const json = JSON.stringify({ players });
    if (get(LIST_KEY) === json) return;
    set(LIST_KEY, json);
    if (typeof dispatchEvent === 'function') dispatchEvent(new CustomEvent('mqp:saved', { detail: { key: LIST_KEY } }));
}

/** All players, oldest first: [{ id, name, avatar, createdAt }]. */
export function listPlayers() {
    return Object.entries(readList())
        .map(([id, p]) => ({ id, ...p }))
        .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
}

export function getPlayer(id) {
    const p = readList()[id];
    return p ? { id, ...p } : null;
}

/** True if this device has progress from before players existed. */
export function hasUnclaimedProgress() {
    return !!get(TUTOR_KEY) || !!get(ZOO_KEY);
}

export function addPlayer(name) {
    const players = readList();
    const id = `p${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;
    const avatar = AVATARS[Object.keys(players).length % AVATARS.length];
    players[id] = { name: String(name).trim().slice(0, 24) || 'Player', avatar, createdAt: Date.now() };
    // The first player inherits any progress saved before players existed.
    if (Object.keys(players).length === 1 && hasUnclaimedProgress()) {
        const k = keysFor(id);
        if (get(TUTOR_KEY)) set(k.tutor, get(TUTOR_KEY));
        if (get(ZOO_KEY)) set(k.zoo, get(ZOO_KEY));
        try { localStorage.removeItem(TUTOR_KEY); localStorage.removeItem(ZOO_KEY); } catch (e) { /* ignore */ }
    }
    writeList(players);
    return { id, ...players[id] };
}

export function currentPlayerId() {
    const id = get(CURRENT_KEY);
    return id && readList()[id] ? id : null;
}
export function setCurrentPlayer(id) { set(CURRENT_KEY, id); }

/** One child's progress: { tutor, zoo } (parsed objects or null). */
export function readProgress(id) {
    const k = keysFor(id);
    return { tutor: parse(get(k.tutor)), zoo: parse(get(k.zoo)), history: parse(get(k.history)) || [] };
}
function writeProgress(id, data) {
    const k = keysFor(id);
    if (data.tutor) set(k.tutor, JSON.stringify(data.tutor));
    if (data.zoo) set(k.zoo, JSON.stringify(data.zoo));
    if (data.history) set(k.history, JSON.stringify(data.history));
}

/** How much a copy of progress represents: [questions answered, stars]. */
export function progressOf(data) {
    return [(data && data.tutor && data.tutor.t) | 0, (data && data.zoo && data.zoo.stars) | 0];
}
function more(a, b) {
    const [x1, y1] = progressOf(a), [x2, y2] = progressOf(b);
    return x1 !== x2 ? x1 > x2 : y1 > y2;
}

/** Everything on this device: { players: {id: meta}, progress: {id: {tutor, zoo}} }. */
export function snapshot() {
    const players = readList();
    const progress = {};
    for (const id of Object.keys(players)) progress[id] = readProgress(id);
    return { players, progress };
}

/**
 * Merge another copy (the cloud, or a backup) into this device.
 * Returns { changed: ids updated here, localNewer: ids where this device has
 * more progress than the other copy (so the other copy needs updating) }.
 */
export function mergeIn(other) {
    const players = readList();
    const changed = [], localNewer = [];
    for (const [id, meta] of Object.entries((other && other.players) || {})) {
        if (!players[id]) { players[id] = meta; changed.push(id); }
        else if (meta.name && meta.name !== players[id].name && (meta.renamedAt || 0) > (players[id].renamedAt || 0)) {
            players[id] = { ...players[id], name: meta.name, renamedAt: meta.renamedAt };
        }
    }
    for (const id of Object.keys(players)) {
        const theirs = other && other.progress && other.progress[id];
        const mine = readProgress(id);
        // Answer histories from every machine are combined.
        const both = unionHistory(mine.history, theirs && theirs.history);
        const histGrew = both.length > (mine.history || []).length;
        const histMissingThere = both.length > ((theirs && theirs.history) || []).length;
        if (theirs && more(theirs, mine)) {
            writeProgress(id, { ...theirs, history: both });
            if (!changed.includes(id)) changed.push(id);
            if (histMissingThere) localNewer.push(id);
        } else {
            if (histGrew) { writeProgress(id, { history: both }); if (!changed.includes(id)) changed.push(id); }
            if (more(mine, theirs || {}) || histMissingThere) localNewer.push(id);
        }
    }
    writeList(players);
    return { changed, localNewer };
}

/** Backup file contents for all players on this device. */
export function exportBackup() {
    return JSON.stringify({ app: 'math-quest-penguin', kind: 'backup', exportedAt: new Date().toISOString(), ...snapshot() });
}

/** Restore from a backup file; existing progress is kept where it is further along. */
export function importBackup(json) {
    const data = JSON.parse(json);
    if (!data || data.app !== 'math-quest-penguin' || !data.players) throw new Error('This is not a Pingo backup file.');
    return mergeIn(data);
}
