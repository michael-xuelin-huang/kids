// Pingo's Zoo: every level completed brings a new animal. Penguins come
// first and keep coming - every few levels another penguin species joins the
// ice pool, and once every animal is in, penguin chicks keep hatching.
//
// Levels come from stars: 1 star per correct answer, 2 when the question was
// one the child is still learning (new facts, repeats of missed ones).

import { animalSVG, speciesName } from './art.js';

export const HABITATS = {
    pool:    { name: 'Ice pool' },
    arctic:  { name: 'Arctic rocks' },
    pond:    { name: 'Lily pond' },
    savanna: { name: 'Savanna' },
    bamboo:  { name: 'Bamboo grove' },
};

const NAMES = {
    seal: 'Seal', polarBear: 'Polar bear', arcticFox: 'Arctic fox', flamingo: 'Flamingo', turtle: 'Turtle',
    giraffe: 'Giraffe', zebra: 'Zebra', elephant: 'Elephant', lion: 'Lion', panda: 'Panda', monkey: 'Monkey',
    parrot: 'Parrot', tiger: 'Tiger', hippo: 'Hippo', kangaroo: 'Kangaroo', koala: 'Koala', otter: 'Otter', owl: 'Snowy owl',
};
export const animalName = (key) => NAMES[key] || speciesName(key);

// Arrival order. Level 1 starts with the first one.
export const ANIMALS = [
    ['emperor', 'pool'], ['seal', 'pool'], ['gentoo', 'pool'], ['polarBear', 'arctic'], ['rockhopper', 'pool'],
    ['arcticFox', 'arctic'], ['flamingo', 'pond'], ['adelie', 'pool'], ['turtle', 'pond'], ['giraffe', 'savanna'],
    ['chick', 'pool'], ['zebra', 'savanna'], ['panda', 'bamboo'], ['king', 'pool'], ['elephant', 'savanna'],
    ['monkey', 'bamboo'], ['owl', 'arctic'], ['littleBlue', 'pool'], ['lion', 'savanna'], ['parrot', 'bamboo'],
    ['hippo', 'pond'], ['macaroni', 'pool'], ['tiger', 'bamboo'], ['kangaroo', 'savanna'], ['otter', 'pond'],
    ['koala', 'bamboo'],
].map(([key, habitat]) => ({ key, habitat }));
const EXTRA_CHICKS = 12;

const PENGUINS = new Set(['emperor', 'king', 'gentoo', 'rockhopper', 'adelie', 'littleBlue', 'macaroni', 'chick']);

/** Stars needed to go from `level` to level + 1. */
export const starsForLevel = (level) => 5 + level;

const KEY = 'math-quest-penguin.zoo.v1';

export class ZooProgress {
    constructor({ persist = true } = {}) {
        this.persist = persist;
        this.stars = 0;   // total
        this.level = 1;
        this.into = 0;    // stars into the current level
        if (persist) {
            try {
                const s = JSON.parse(localStorage.getItem(KEY) || 'null');
                if (s && typeof s.stars === 'number') Object.assign(this, { stars: s.stars, level: s.level, into: s.into });
            } catch (e) { /* fresh zoo */ }
        }
    }

    /** Add stars; returns the animals that arrived (possibly several). */
    add(n) {
        const arrived = [];
        this.stars += n;
        this.into += n;
        while (this.into >= starsForLevel(this.level)) {
            this.into -= starsForLevel(this.level);
            this.level++;
            const a = this.animalAt(this.level - 1);
            if (a) arrived.push(a);
        }
        this._save();
        return arrived;
    }

    /** The animal that arrives at level index i (0 = first). */
    animalAt(i) {
        if (i < ANIMALS.length) return ANIMALS[i];
        if (i < ANIMALS.length + EXTRA_CHICKS) return { key: 'chick', habitat: 'pool' };
        return null;
    }

    animals() {
        const out = [];
        for (let i = 0; i < this.level; i++) { const a = this.animalAt(i); if (a) out.push(a); }
        return out;
    }

    next() { return this.animalAt(this.level); }
    starsToNext() { return starsForLevel(this.level) - this.into; }

    _save() {
        if (!this.persist) return;
        try { localStorage.setItem(KEY, JSON.stringify({ stars: this.stars, level: this.level, into: this.into })); } catch (e) { /* ignore */ }
    }
}

// ---------------------------------------------------------------------------
// Scene (SVG, 640 x 520). Each habitat: an area, a sign, slots for animals.
// ---------------------------------------------------------------------------
const W = 640, H = 520;
const AREAS = {
    arctic:  { x: 14,  y: 96,  w: 292, h: 142 },
    savanna: { x: 334, y: 96,  w: 292, h: 142 },
    pool:    { x: 14,  y: 266, w: 372, h: 240 },
    bamboo:  { x: 414, y: 266, w: 212, h: 112 },
    pond:    { x: 414, y: 394, w: 212, h: 112 },
};
// Slot = bottom-centre point and size of the animal.
const SLOTS = {
    pool: [
        [112, 354, 64], [174, 348, 64], [238, 348, 62], [298, 356, 62], [350, 404, 58],
        [50, 418, 58], [98, 496, 58], [166, 502, 58], [236, 502, 58], [302, 496, 58], [354, 478, 52],
        [34, 490, 50], [62, 346, 52], [206, 328, 46], [350, 330, 48], [138, 318, 44], [270, 318, 44],
        [30, 350, 44], [372, 500, 44], [96, 302, 40], [180, 300, 40], [248, 300, 40], [320, 300, 40],
    ],
    arctic: [[84, 228, 78], [190, 230, 62], [272, 234, 54], [140, 166, 50]],
    savanna: [[420, 226, 100], [508, 226, 72], [592, 228, 84], [380, 232, 66], [466, 172, 60]],
    bamboo: [[452, 368, 64], [520, 360, 56], [592, 326, 46], [568, 372, 70], [488, 316, 46]],
    pond: [[448, 492, 74], [566, 492, 44], [520, 478, 82], [604, 470, 50]],
};
// Seal sits on the ice edge, otter swims.
const SPECIAL = { seal: [212, 418, 70], otter: [560, 456, 64] };

function habitatGround(key, open) {
    const a = AREAS[key];
    const fills = { arctic: '#E3F0F8', savanna: '#F2D27C', pool: '#F4FBFF', bamboo: '#A8D672', pond: '#C9E7B5' };
    const deco = {
        arctic: `
            <path d="M40 236 L74 178 L100 206 L128 168 L170 236z" fill="#B9CCDB"/>
            <path d="M74 178 L84 194 L66 192z M128 168 L140 188 L118 186z" fill="#fff"/>
            <path d="M210 236 L244 196 L284 236z" fill="#C8D8E5"/><path d="M244 196 L254 208 L236 208z" fill="#fff"/>`,
        savanna: `
            <path d="M590 238 L594 150" stroke="#8B5A2B" stroke-width="7"/>
            <ellipse cx="594" cy="140" rx="38" ry="13" fill="#6AA84F"/><ellipse cx="572" cy="148" rx="20" ry="8" fill="#5E9945"/>
            <path d="M350 214 q6 -10 12 0 M372 220 q6 -10 12 0 M520 208 q6 -10 12 0 M548 220 q6 -10 12 0" stroke="#D9A936" stroke-width="2" fill="none"/>`,
        pool: `
            <ellipse cx="200" cy="410" rx="132" ry="52" fill="#2BB3C0"/>
            <ellipse cx="200" cy="404" rx="118" ry="42" fill="#47C9D4"/>
            <path class="ripple" d="M130 404 q14 -6 28 0 t28 0" stroke="#fff" stroke-width="2.4" fill="none" opacity=".7"/>
            <path class="ripple ripple--b" d="M226 420 q14 -6 28 0 t28 0" stroke="#fff" stroke-width="2.4" fill="none" opacity=".6"/>
            <path d="M14 330 q60 -24 120 -6 q60 -26 120 -4 q70 -22 132 -2 L386 290 L14 290z" fill="#fff" opacity=".7"/>`,
        bamboo: `
            <g stroke="#4E8F2F" stroke-width="7" stroke-linecap="round">
              <path d="M428 376 L432 278"/><path d="M614 376 L610 280"/><path d="M542 376 L546 290"/>
            </g>
            <g stroke="#3E7426" stroke-width="2"><path d="M426 340 h12 M427 310 h12 M606 330 h12 M604 300 h12 M540 340 h12 M541 314 h12"/></g>
            <g fill="#6BB33E"><ellipse cx="444" cy="292" rx="14" ry="5"/><ellipse cx="598" cy="296" rx="14" ry="5"/><ellipse cx="556" cy="300" rx="12" ry="4"/></g>`,
        pond: `
            <ellipse cx="520" cy="466" rx="84" ry="30" fill="#5CB8E4"/>
            <ellipse cx="520" cy="462" rx="74" ry="24" fill="#7CCBF0"/>
            <ellipse cx="478" cy="462" rx="10" ry="4" fill="#6AB341"/><ellipse cx="560" cy="470" rx="9" ry="3.5" fill="#6AB341"/>
            <circle cx="482" cy="460" r="3" fill="#FF8FAB"/>
            <path d="M600 470 l2 -24 M606 472 l4 -20 M594 470 l-2 -18" stroke="#4E8F2F" stroke-width="2.4"/>`,
    }[key];
    const sign = `
        <g class="sign">
          <rect x="${a.x + 10}" y="${a.y + 8}" width="${HABITATS[key].name.length * 7.4 + 18}" height="22" rx="6" fill="#8B5A2B"/>
          <text x="${a.x + 19}" y="${a.y + 23.5}" class="sign-text">${HABITATS[key].name}</text>
        </g>`;
    const closed = open ? '' : `
        <g class="closed">
          <rect x="${a.x}" y="${a.y}" width="${a.w}" height="${a.h}" rx="22" fill="#E8F7FF" opacity=".72"/>
          <g transform="translate(${a.x + a.w / 2 - 14} ${a.y + a.h / 2 - 16})">
            <rect x="0" y="12" width="28" height="22" rx="5" fill="#9FB3C8"/>
            <path d="M6 13 v-5 a8 8 0 0 1 16 0 v5" stroke="#9FB3C8" stroke-width="4" fill="none"/>
          </g>
        </g>`;
    return `
      <g class="habitat habitat--${key}">
        <rect x="${a.x}" y="${a.y}" width="${a.w}" height="${a.h}" rx="22" fill="${fills[key]}"/>
        ${deco}
        <rect x="${a.x + 3}" y="${a.y + 3}" width="${a.w - 6}" height="${a.h - 6}" rx="20" fill="none" stroke="#B98B5E" stroke-width="3" stroke-dasharray="2 9" stroke-linecap="round"/>
        ${sign}${closed}
      </g>`;
}

/**
 * Render the zoo into `container`. `fresh` = animals that just arrived (pop-in).
 */
export function renderZoo(container, progress, fresh = []) {
    const animals = progress.animals();
    const open = new Set(animals.map((a) => a.habitat));
    const used = {};
    const placed = [];
    animals.forEach((a, i) => {
        let slot = SPECIAL[a.key];
        if (!slot) {
            const list = SLOTS[a.habitat];
            const n = used[a.habitat] = (used[a.habitat] || 0) + 1;
            slot = list[(n - 1) % list.length];
        }
        const [cx, by, size] = slot;
        const isPeng = PENGUINS.has(a.key);
        const h = size, w = isPeng ? size * 60 / 70 : size;
        const isNew = i >= animals.length - fresh.length;
        const cls = ['zoo-animal', isPeng ? 'is-penguin' : '', isNew ? 'is-new' : '', `walk-${i % 3}`].join(' ');
        placed.push({ by, html: `<g class="${cls}" style="--d:${(i * 0.37) % 2}s"><svg x="${cx - w / 2}" y="${by - h}" width="${w}" height="${h}" overflow="visible">${animalSVG(a.key)}</svg><title>${animalName(a.key)}</title></g>` });
    });
    placed.sort((p, q) => p.by - q.by); // nearer animals drawn on top

    container.innerHTML = `
<svg viewBox="0 0 ${W} ${H}" class="zoo-svg" role="img" aria-label="Your zoo with ${animals.length} animals">
  <defs>
    <linearGradient id="zsky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#BEE8FF"/><stop offset="1" stop-color="#E8F7FF"/></linearGradient>
  </defs>
  <rect width="${W}" height="${H}" rx="28" fill="#9ED36A"/>
  <path d="M0 0 H${W} V96 Q${W * 0.75} 70 ${W / 2} 88 T0 84z" fill="url(#zsky)"/>
  <path d="M0 84 Q120 50 240 78 T480 70 T640 76 V96 H0z" fill="#8CC75A"/>
  <circle cx="560" cy="34" r="18" fill="#FFE27A"/>
  <path d="M320 240 V256 M14 252 H626 M400 252 V520" stroke="#F3E3C3" stroke-width="16" stroke-linecap="round"/>
  ${Object.keys(AREAS).map((k) => habitatGround(k, open.has(k))).join('')}
  ${placed.map((p) => p.html).join('')}
</svg>`;
}

/** Small portrait of an animal (for "next friend" and celebrations). */
export function animalPortrait(key) { return animalSVG(key); }
