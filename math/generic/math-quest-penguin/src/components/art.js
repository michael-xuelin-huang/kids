// Illustrations: Pingo the zookeeper penguin, penguin species for the zoo
// pool, and the zoo animals. Flat shapes, one palette, all original art.
// Every function returns an SVG string.

export const INK = '#12355B';
const INK_LIGHT = '#2A5A86';
const BELLY = '#FFFFFF';
const BEAK = '#FF9F1C';
const BEAK_DARK = '#E07A00';
const BLUSH = '#FF8FA3';

let uid = 0;
const id = (p) => `${p}${++uid}`;

// --------------------------------------------------------------------------
// Pingo, the zookeeper. expression: normal | happy | sad | thinking
// --------------------------------------------------------------------------
export function pingoSVG(expression = 'normal') {
    const g = id('pg'), b = id('pb');
    const eyes = {
        normal: `
            <ellipse cx="80" cy="92" rx="9" ry="11" fill="${INK}"/><ellipse cx="120" cy="92" rx="9" ry="11" fill="${INK}"/>
            <circle cx="83" cy="88" r="3.4" fill="#fff"/><circle cx="123" cy="88" r="3.4" fill="#fff"/>
            <circle cx="78" cy="96" r="1.6" fill="#fff" opacity=".8"/><circle cx="118" cy="96" r="1.6" fill="#fff" opacity=".8"/>`,
        happy: `
            <path d="M70 94 Q80 80 90 94" stroke="${INK}" stroke-width="5" fill="none" stroke-linecap="round"/>
            <path d="M110 94 Q120 80 130 94" stroke="${INK}" stroke-width="5" fill="none" stroke-linecap="round"/>`,
        sad: `
            <ellipse cx="80" cy="95" rx="8" ry="9" fill="${INK}"/><ellipse cx="120" cy="95" rx="8" ry="9" fill="${INK}"/>
            <circle cx="82" cy="92" r="2.8" fill="#fff"/><circle cx="122" cy="92" r="2.8" fill="#fff"/>
            <path d="M68 80 L88 84" stroke="${INK}" stroke-width="4" stroke-linecap="round"/>
            <path d="M132 80 L112 84" stroke="${INK}" stroke-width="4" stroke-linecap="round"/>
            <path d="M131 104 q4 8 0 11 q-4 -3 0 -11z" fill="#7CD3F7"/>`,
        thinking: `
            <ellipse cx="80" cy="92" rx="9" ry="11" fill="${INK}"/><ellipse cx="120" cy="92" rx="9" ry="11" fill="${INK}"/>
            <circle cx="84" cy="86" r="3.4" fill="#fff"/><circle cx="124" cy="86" r="3.4" fill="#fff"/>
            <path d="M110 76 L130 72" stroke="${INK}" stroke-width="4" stroke-linecap="round"/>`,
    }[expression] || '';
    const beak = expression === 'happy'
        ? `<path d="M88 106 Q100 100 112 106 Q106 122 100 123 Q94 122 88 106z" fill="${BEAK}"/>
           <path d="M92 110 Q100 108 108 110 Q104 118 100 118 Q96 118 92 110z" fill="#C2410C"/>`
        : `<path d="M88 106 Q100 100 112 106 Q104 117 100 118 Q96 117 88 106z" fill="${BEAK}"/>
           <path d="M90 107 Q100 104 110 107" stroke="${BEAK_DARK}" stroke-width="2" fill="none"/>`;
    const flipL = expression === 'happy'
        ? `<path class="flap-l" d="M48 128 Q20 104 22 82 Q40 96 58 116z" fill="${INK}"/>`
        : `<path d="M50 122 Q26 150 34 176 Q48 160 58 136z" fill="${INK}"/>`;
    const flipR = expression === 'happy'
        ? `<path class="flap-r" d="M152 128 Q180 104 178 82 Q160 96 142 116z" fill="${INK}"/>`
        : expression === 'thinking'
            ? `<path d="M150 124 Q160 130 140 120 Q132 112 124 116 Q136 100 150 112z" fill="${INK}"/>`
            : `<path d="M150 122 Q174 150 166 176 Q152 160 142 136z" fill="${INK}"/>`;
    return `
<svg viewBox="0 0 200 230" class="pingo pingo--${expression}" role="img" aria-label="Pingo the penguin zookeeper">
  <defs>
    <radialGradient id="${g}" cx="38%" cy="28%" r="80%">
      <stop offset="0" stop-color="${INK_LIGHT}"/><stop offset="1" stop-color="${INK}"/>
    </radialGradient>
    <radialGradient id="${b}" cx="45%" cy="30%" r="75%">
      <stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#DCEFFA"/>
    </radialGradient>
  </defs>
  <ellipse cx="100" cy="216" rx="58" ry="9" fill="${INK}" opacity=".12"/>
  <path d="M70 202 q-16 6 -18 14 q20 4 36 -4z" fill="${BEAK}"/>
  <path d="M130 202 q16 6 18 14 q-20 4 -36 -4z" fill="${BEAK}"/>
  ${flipL}${flipR}
  <path d="M100 30 C150 30 160 90 158 140 C156 190 134 210 100 210 C66 210 44 190 42 140 C40 90 50 30 100 30z" fill="url(#${g})"/>
  <path d="M100 66 C126 62 140 84 136 104 C150 128 144 192 100 196 C56 192 50 128 64 104 C60 84 74 62 100 66z" fill="url(#${b})"/>
  ${eyes}
  <ellipse cx="66" cy="110" rx="9" ry="5" fill="${BLUSH}" opacity=".55"/>
  <ellipse cx="134" cy="110" rx="9" ry="5" fill="${BLUSH}" opacity=".55"/>
  ${beak}
  <!-- zookeeper cap -->
  <path d="M58 52 Q100 6 142 52 Q100 42 58 52z" fill="#3E8E41"/>
  <path d="M60 50 Q100 40 140 50 L140 56 Q100 46 60 56z" fill="#2F6E32"/>
  <path d="M120 52 Q156 46 170 58 Q146 62 126 58z" fill="#2F6E32"/>
  <circle cx="100" cy="32" r="9" fill="#FFD23F"/>
  <path d="M100 26 l2 4.5 5 .5 -3.8 3.3 1.1 4.9 -4.3 -2.6 -4.3 2.6 1.1 -4.9 -3.8 -3.3 5 -.5z" fill="#E09F00"/>
</svg>`;
}

// --------------------------------------------------------------------------
// Penguin species (small, for the zoo). Drawn facing the viewer.
// --------------------------------------------------------------------------
const SPECIES = {
    emperor: { name: 'Emperor penguin', back: INK, belly: '#FFF8E7', beak: '#1E2A38', stripe: '#FF9F1C', patch: '#FFC23D', h: 1.15 },
    king: { name: 'King penguin', back: '#22303F', belly: '#FFFDF5', beak: '#1E2A38', stripe: '#FF7A1A', patch: '#FF8C1A', h: 1.08 },
    gentoo: { name: 'Gentoo penguin', back: '#25313D', belly: '#fff', beak: '#FF6B1A', headband: true, h: 1 },
    rockhopper: { name: 'Rockhopper penguin', back: '#1F2A36', belly: '#fff', beak: '#E5531A', crest: '#FFD23F', redEye: true, h: 0.88 },
    adelie: { name: 'Adélie penguin', back: '#16212C', belly: '#fff', beak: '#16212C', eyeRing: true, h: 0.92 },
    littleBlue: { name: 'Little blue penguin', back: '#3E6E9E', belly: '#F2F7FB', beak: '#2B3A48', h: 0.72 },
    macaroni: { name: 'Macaroni penguin', back: '#1F2A36', belly: '#fff', beak: '#C2410C', crest: '#FF8C1A', h: 0.95 },
    chick: { name: 'Penguin chick', chick: true, h: 0.7 },
};

export function speciesName(key) { return SPECIES[key] ? SPECIES[key].name : key; }

export function penguinSpeciesSVG(key) {
    const s = SPECIES[key] || SPECIES.gentoo;
    if (s.chick) {
        // Fluffy grey emperor chick: black cap, white face mask.
        return `<svg viewBox="0 0 60 70" class="animal-art">
  <ellipse cx="30" cy="67" rx="15" ry="3" fill="${INK}" opacity=".15"/>
  <path d="M22 63 l-5 4 h9z M38 63 l5 4 h-9z" fill="#5B6670"/>
  <path d="M30 26 C44 26 50 40 49 52 C48 62 40 66 30 66 C20 66 12 62 11 52 C10 40 16 26 30 26z" fill="#C3CCD5"/>
  <path d="M13 50 q-4 2 -3 6 M47 50 q4 2 3 6 M20 62 q2 3 5 2 M40 62 q-2 3 -5 2" stroke="#A9B4BF" stroke-width="2" fill="none" stroke-linecap="round"/>
  <circle cx="30" cy="26" r="14" fill="#2B2F36"/>
  <path d="M19 28 C19 20 26 19 30 23 C34 19 41 20 41 28 C41 36 19 36 19 28z" fill="#fff"/>
  <circle cx="25" cy="27" r="2.1" fill="#2B2F36"/><circle cx="35" cy="27" r="2.1" fill="#2B2F36"/>
  <circle cx="25.7" cy="26.3" r=".7" fill="#fff"/><circle cx="35.7" cy="26.3" r=".7" fill="#fff"/>
  <path d="M28 31 h4 l-2 3z" fill="#2B2F36"/>
  <path d="M30 12 q2 -4 5 -3" stroke="#2B2F36" stroke-width="2" fill="none" stroke-linecap="round"/>
</svg>`;
    }
    const top = 70 - 60 * s.h;
    const mid = (top + 66) / 2;
    const extras = [];
    if (s.patch) extras.push(`<path d="M15 ${top + 13} q-5 7 1 13 q4 -6 5 -11z" fill="${s.patch}"/><path d="M45 ${top + 13} q5 7 -1 13 q-4 -6 -5 -11z" fill="${s.patch}"/>`);
    if (s.headband) extras.push(`<path d="M18 ${top + 9} Q30 ${top + 3} 42 ${top + 9} Q36 ${top + 13} 30 ${top + 11} Q24 ${top + 13} 18 ${top + 9}z" fill="#fff"/>`);
    if (s.crest) extras.push(`<path d="M20 ${top + 10} q-9 -6 -12 -1 q6 0 9 4 M40 ${top + 10} q9 -6 12 -1 q-6 0 -9 4" stroke="${s.crest}" stroke-width="2.6" fill="none" stroke-linecap="round"/>`);
    const eye = s.eyeRing
        ? `<circle cx="24" cy="${top + 13}" r="3.2" fill="#fff"/><circle cx="36" cy="${top + 13}" r="3.2" fill="#fff"/><circle cx="24" cy="${top + 13}" r="1.5" fill="${s.back}"/><circle cx="36" cy="${top + 13}" r="1.5" fill="${s.back}"/>`
        : `<circle cx="24" cy="${top + 13}" r="2" fill="${s.redEye ? '#D7263D' : '#fff'}"/><circle cx="36" cy="${top + 13}" r="2" fill="${s.redEye ? '#D7263D' : '#fff'}"/><circle cx="24.4" cy="${top + 13.2}" r="1" fill="#111"/><circle cx="36.4" cy="${top + 13.2}" r="1" fill="#111"/>`;
    const beak = `<path d="M26 ${top + 17} Q30 ${top + 15} 34 ${top + 17} L30 ${top + 25}z" fill="${s.beak}"/>` +
        (s.stripe ? `<path d="M27.5 ${top + 19} L32.5 ${top + 19}" stroke="${s.stripe}" stroke-width="1.6"/>` : '');
    return `<svg viewBox="0 0 60 70" class="animal-art">
  <ellipse cx="30" cy="67" rx="17" ry="3" fill="${INK}" opacity=".15"/>
  <path d="M21 63 l-6 4 h10z M39 63 l6 4 h-10z" fill="${BEAK}"/>
  <path d="M14 ${mid} q-8 10 -5 20 q6 -4 8 -12z" fill="${s.back}"/>
  <path d="M46 ${mid} q8 10 5 20 q-6 -4 -8 -12z" fill="${s.back}"/>
  <path d="M30 ${top} C45 ${top} 49 ${top + 22} 48 ${mid + 6} C47 62 40 66 30 66 C20 66 13 62 12 ${mid + 6} C11 ${top + 22} 15 ${top} 30 ${top}z" fill="${s.back}"/>
  <path d="M30 ${top + 17} C40 ${top + 17} 42 ${mid} 41 ${mid + 10} C40 60 36 63 30 63 C24 63 20 60 19 ${mid + 10} C18 ${mid} 20 ${top + 17} 30 ${top + 17}z" fill="${s.belly}"/>
  ${extras.join('')}${eye}${beak}
</svg>`;
}

// --------------------------------------------------------------------------
// Zoo animals (flat, facing right). viewBox 0 0 80 80, feet near y=74.
// --------------------------------------------------------------------------
const shadow = (w = 26) => `<ellipse cx="40" cy="76" rx="${w}" ry="3.5" fill="${INK}" opacity=".14"/>`;
const eye = (x, y, r = 2.2) => `<circle cx="${x}" cy="${y}" r="${r}" fill="#1B1B1B"/><circle cx="${x + r * 0.35}" cy="${y - r * 0.35}" r="${r * 0.38}" fill="#fff"/>`;

const ANIMAL_ART = {
    seal: () => `${shadow(28)}
  <path d="M10 70 C8 56 22 48 38 48 C52 48 60 40 62 30 C64 22 74 24 74 32 C76 46 66 66 46 70 C32 73 18 74 10 70z" fill="#8FA3B5"/>
  <path d="M8 70 q-6 -2 -6 -8 q6 2 10 6z" fill="#7A8FA1"/><path d="M34 66 q-2 8 8 8 q-2 -4 0 -8z" fill="#7A8FA1"/>
  ${eye(66, 30)}<circle cx="73" cy="35" r="2" fill="#2B2F36"/>
  <path d="M72 38 l6 -1 M72 39 l6 2" stroke="#2B2F36" stroke-width=".8"/>`,
    polarBear: () => `${shadow(30)}
  <path d="M12 52 C12 38 26 32 40 33 C50 33 56 28 62 28 C72 28 76 36 74 42 C72 48 66 48 64 50 L64 72 L56 72 L54 58 L32 60 L30 72 L22 72 L20 60 C14 60 12 58 12 52z" fill="#F4F7FA"/>
  <path d="M12 52 C12 38 26 32 40 33" stroke="#D5DEE6" stroke-width="2" fill="none"/>
  <circle cx="60" cy="28" r="4" fill="#F4F7FA"/><circle cx="60" cy="28" r="2" fill="#D5DEE6"/>
  ${eye(66, 35, 1.8)}<circle cx="74" cy="40" r="2.4" fill="#1B1B1B"/>`,
    arcticFox: () => `${shadow(24)}
  <path d="M8 46 C2 36 10 26 18 34 C22 40 18 46 26 50z" fill="#EEF3F8" stroke="#9FB3C8" stroke-width="1.6"/>
  <path d="M22 50 C24 42 34 40 46 42 L58 40 L56 72 L50 72 L48 58 L34 58 L32 72 L26 72 C22 64 20 56 22 50z" fill="#EEF3F8" stroke="#9FB3C8" stroke-width="1.6"/>
  <path d="M50 42 L54 26 L60 36 L66 26 L68 40 C70 46 76 48 76 52 C70 54 60 54 54 50z" fill="#EEF3F8" stroke="#9FB3C8" stroke-width="1.6"/>
  ${eye(63, 44, 1.8)}<circle cx="76" cy="52" r="1.8" fill="#1B1B1B"/>`,
    flamingo: () => `${shadow(16)}
  <path d="M40 74 L40 54 M40 62 L48 56" stroke="#E86A8A" stroke-width="2.4" fill="none" stroke-linecap="round"/>
  <path d="M24 42 C24 30 46 28 54 38 C58 44 52 54 40 54 C30 54 24 50 24 42z" fill="#FF8FAB"/>
  <path d="M26 40 C30 34 40 36 44 42" stroke="#F06A8E" stroke-width="2" fill="none"/>
  <path d="M52 40 C60 30 58 18 54 12 C50 6 58 2 62 6 C66 10 66 14 64 16" stroke="#FF8FAB" stroke-width="5" fill="none" stroke-linecap="round"/>
  <path d="M64 14 L72 18 L66 22z" fill="#2B2F36"/><path d="M64 14 L68 16 L65 18z" fill="#FFE0E8"/>
  ${eye(60, 8, 1.4)}`,
    turtle: () => `${shadow(26)}
  <path d="M60 56 C66 52 74 54 74 60 C74 64 68 66 62 64z" fill="#7BC950"/>${eye(68, 58, 1.6)}
  <path d="M18 66 l-4 6 h8z M52 66 l4 6 h-8z M30 68 l-2 6 h7z" fill="#6AB341"/>
  <path d="M14 66 C14 48 26 40 38 40 C50 40 62 48 62 66z" fill="#3E8E41"/>
  <path d="M24 64 L28 52 L38 48 L48 52 L52 64 M28 52 L38 58 L48 52 M38 58 L38 64" stroke="#2F6E32" stroke-width="2" fill="none"/>`,
    giraffe: () => `${shadow(22)}
  <path d="M22 74 L22 50 M30 74 L30 52 M48 74 L48 52 M56 74 L56 50" stroke="#E9B44C" stroke-width="5" stroke-linecap="round"/>
  <path d="M18 52 C18 40 30 36 40 38 L56 38 C62 38 64 46 60 54 C50 58 26 58 18 52z" fill="#F4C95D"/>
  <path d="M50 42 L58 10 L68 12 L60 44z" fill="#F4C95D"/>
  <path d="M56 12 C58 4 70 4 74 10 C76 14 72 18 66 16z" fill="#F4C95D"/>
  <path d="M60 4 l0 -4 M66 4 l1 -4" stroke="#B7791F" stroke-width="2.4" stroke-linecap="round"/>
  <g fill="#C27C2C"><circle cx="28" cy="46" r="3.4"/><circle cx="40" cy="44" r="3"/><circle cx="50" cy="48" r="3.2"/><circle cx="58" cy="26" r="2.2"/><circle cx="60" cy="36" r="2.4"/><circle cx="34" cy="52" r="2.2"/></g>
  ${eye(67, 9, 1.6)}`,
    zebra: () => `${shadow(26)}
  <path d="M20 74 L20 56 M28 74 L28 58 M48 74 L48 58 M56 74 L56 56" stroke="#F7F7F7" stroke-width="5" stroke-linecap="round"/>
  <path d="M14 50 C14 38 26 34 38 36 L52 36 C58 30 62 22 70 24 C76 26 78 34 74 38 L64 42 C62 52 58 58 46 60 C32 62 16 60 14 50z" fill="#F7F7F7" stroke="#2B2F36" stroke-width="1.5"/>
  <g stroke="#2B2F36" stroke-width="3" stroke-linecap="round"><path d="M24 40 L22 56 M32 37 L30 58 M40 37 L40 60 M48 37 L50 58 M58 34 L62 42 M64 27 L68 34"/></g>
  <path d="M54 30 C58 22 64 18 68 20" stroke="#2B2F36" stroke-width="4" fill="none"/>
  ${eye(70, 30, 1.6)}<path d="M74 38 C78 36 78 32 76 30" fill="#2B2F36"/>`,
    elephant: () => `${shadow(30)}
  <path d="M16 74 L16 56 M28 74 L28 58 M46 74 L46 58 M58 74 L58 56" stroke="#9AA9B7" stroke-width="9" stroke-linecap="round"/>
  <path d="M10 50 C10 34 26 26 42 28 C56 30 62 38 62 48 C62 58 52 62 36 62 C20 62 10 60 10 50z" fill="#A9B8C6"/>
  <path d="M54 30 C66 24 78 30 76 42 C76 52 72 62 76 70 C72 72 68 70 68 62 C68 54 66 48 60 48z" fill="#A9B8C6"/>
  <path d="M50 30 C42 30 40 50 52 52 C58 50 60 36 50 30z" fill="#93A3B2"/>
  <path d="M68 44 L74 48" stroke="#fff" stroke-width="3" stroke-linecap="round"/>
  ${eye(64, 38, 1.8)}`,
    lion: () => `${shadow(26)}
  <path d="M20 74 L20 58 M28 74 L28 60 M46 74 L46 60 M54 74 L54 58" stroke="#E9A93A" stroke-width="5" stroke-linecap="round"/>
  <path d="M8 44 q-6 -6 0 -10" stroke="#E9A93A" stroke-width="3" fill="none"/><circle cx="7" cy="33" r="3" fill="#B85C1E"/>
  <path d="M12 52 C12 42 22 40 34 40 L48 40 C54 44 56 54 50 60 C40 62 20 62 12 52z" fill="#F4B942"/>
  <circle cx="58" cy="36" r="18" fill="#C9682A"/>
  <circle cx="60" cy="38" r="11" fill="#F4B942"/>
  ${eye(58, 35, 1.6)}${eye(66, 35, 1.6)}<path d="M60 41 l2 2 2 -2z" fill="#6B3A1E"/>`,
    panda: () => `${shadow(24)}
  <path d="M18 52 C18 40 28 34 40 34 C52 34 60 42 60 54 C60 66 52 72 40 72 C28 72 18 66 18 52z" fill="#FFFFFF" stroke="#E4E4E4"/>
  <path d="M20 58 C14 62 16 72 26 72 C30 68 28 60 20 58z M58 58 C64 62 62 72 52 72 C48 68 50 60 58 58z" fill="#222"/>
  <path d="M22 44 C16 46 16 54 24 54z M58 44 C64 46 64 54 56 54z" fill="#222"/>
  <circle cx="40" cy="24" r="15" fill="#FFFFFF" stroke="#E4E4E4"/>
  <circle cx="28" cy="12" r="5" fill="#222"/><circle cx="52" cy="12" r="5" fill="#222"/>
  <ellipse cx="34" cy="24" rx="4" ry="5" fill="#222" transform="rotate(-20 34 24)"/><ellipse cx="46" cy="24" rx="4" ry="5" fill="#222" transform="rotate(20 46 24)"/>
  <circle cx="34.6" cy="23.4" r="1.4" fill="#fff"/><circle cx="46.6" cy="23.4" r="1.4" fill="#fff"/>
  <path d="M38 30 h4 l-2 2z" fill="#222"/>`,
    monkey: () => `${shadow(18)}
  <path d="M24 60 C10 62 8 44 18 40" stroke="#8B5A2B" stroke-width="3.5" fill="none" stroke-linecap="round"/>
  <path d="M28 74 L30 58 M50 74 L48 58" stroke="#8B5A2B" stroke-width="5" stroke-linecap="round"/>
  <ellipse cx="40" cy="52" rx="14" ry="12" fill="#A0693A"/><ellipse cx="40" cy="54" rx="8" ry="8" fill="#E8C39E"/>
  <circle cx="24" cy="26" r="6" fill="#A0693A"/><circle cx="56" cy="26" r="6" fill="#A0693A"/>
  <circle cx="24" cy="26" r="3.4" fill="#E8C39E"/><circle cx="56" cy="26" r="3.4" fill="#E8C39E"/>
  <circle cx="40" cy="26" r="14" fill="#A0693A"/>
  <path d="M30 26 C30 18 38 18 40 22 C42 18 50 18 50 26 C52 36 28 36 30 26z" fill="#E8C39E"/>
  ${eye(35, 25, 1.6)}${eye(45, 25, 1.6)}<path d="M36 31 Q40 34 44 31" stroke="#6B3A1E" stroke-width="1.4" fill="none"/>`,
    parrot: () => `${shadow(12)}
  <path d="M30 56 L22 76 L30 72 L34 76z" fill="#2E86DE"/>
  <path d="M28 40 C26 28 34 18 44 18 C54 18 56 30 52 40 C50 52 42 60 34 60 C28 58 28 50 28 40z" fill="#E63946"/>
  <path d="M30 44 C34 38 44 40 46 50 C40 56 32 54 30 44z" fill="#FFD23F"/>
  <path d="M34 48 C40 46 46 50 46 54 C40 58 34 56 34 48z" fill="#2E86DE"/>
  <path d="M52 24 C60 24 62 32 56 34 L52 30z" fill="#F4F1DE"/><path d="M54 32 l-2 4 3 -1z" fill="#2B2F36"/>
  ${eye(48, 25, 1.6)}<path d="M38 70 L38 60 M42 70 L42 60" stroke="#7A7A7A" stroke-width="1.8"/>`,
    tiger: () => `${shadow(28)}
  <path d="M20 74 L20 58 M28 74 L28 60 M46 74 L46 60 M54 74 L54 58" stroke="#F28C28" stroke-width="5" stroke-linecap="round"/>
  <path d="M10 46 q-8 -4 -4 -14" stroke="#F28C28" stroke-width="3.5" fill="none" stroke-linecap="round"/>
  <path d="M12 52 C12 42 22 40 34 40 L50 40 C56 44 58 54 52 60 C40 62 20 62 12 52z" fill="#F28C28"/>
  <g stroke="#2B2F36" stroke-width="2.6" stroke-linecap="round"><path d="M22 42 L24 50 M30 41 L31 50 M38 41 L38 50 M46 41 L45 50"/></g>
  <circle cx="58" cy="38" r="13" fill="#F28C28"/>
  <path d="M48 28 l2 -6 6 4z M68 28 l-2 -6 -6 4z" fill="#F28C28"/>
  <path d="M52 44 C54 50 62 50 64 44 C62 40 54 40 52 44z" fill="#fff"/>
  <path d="M58 26 L58 31 M52 30 L54 33 M64 30 L62 33" stroke="#2B2F36" stroke-width="2" stroke-linecap="round"/>
  ${eye(53, 36, 1.6)}${eye(63, 36, 1.6)}<path d="M57 42 l1 1.4 1 -1.4z" fill="#C2410C"/>`,
    hippo: () => `${shadow(30)}
  <path d="M18 74 L18 62 M30 74 L30 64 M48 74 L48 64 M60 74 L60 62" stroke="#8E7CC3" stroke-width="8" stroke-linecap="round"/>
  <path d="M8 52 C8 38 22 34 40 34 C58 34 70 40 70 52 C70 64 58 66 40 66 C22 66 8 64 8 52z" fill="#9D8DCF"/>
  <path d="M54 30 C62 26 76 30 76 42 C76 50 70 54 60 52 C54 50 52 38 54 30z" fill="#9D8DCF"/>
  <circle cx="57" cy="28" r="3" fill="#8E7CC3"/>${eye(62, 33, 1.7)}
  <circle cx="72" cy="40" r="1.5" fill="#5E4E99"/><circle cx="68" cy="41" r="1.5" fill="#5E4E99"/>`,
    kangaroo: () => `${shadow(20)}
  <path d="M22 66 C8 70 2 76 0 78" stroke="#C68642" stroke-width="5" fill="none" stroke-linecap="round"/>
  <path d="M30 72 L48 74 L44 68z" fill="#B87333"/>
  <path d="M26 66 C20 52 26 36 38 34 C48 32 52 40 50 50 C48 60 42 70 30 70z" fill="#C68642"/>
  <path d="M40 54 C46 54 48 60 44 64 C40 64 38 58 40 54z" fill="#E0A96D"/>
  <path d="M44 38 C46 28 52 22 60 24 C66 26 68 30 66 34 C62 38 54 38 48 42z" fill="#C68642"/>
  <path d="M52 24 L50 12 L56 20 M58 24 L60 12 L62 22" fill="#C68642" stroke="#C68642" stroke-width="3" stroke-linejoin="round"/>
  ${eye(58, 28, 1.6)}<circle cx="66" cy="32" r="1.4" fill="#2B2F36"/>`,
    koala: () => `${shadow(18)}
  <ellipse cx="40" cy="56" rx="16" ry="16" fill="#9DA5AE"/><ellipse cx="40" cy="60" rx="9" ry="10" fill="#E4E8EC"/>
  <circle cx="22" cy="26" r="10" fill="#9DA5AE"/><circle cx="58" cy="26" r="10" fill="#9DA5AE"/>
  <circle cx="22" cy="26" r="5.5" fill="#E4E8EC"/><circle cx="58" cy="26" r="5.5" fill="#E4E8EC"/>
  <circle cx="40" cy="32" r="15" fill="#9DA5AE"/>
  <ellipse cx="40" cy="36" rx="5" ry="6.5" fill="#2B2F36"/>
  ${eye(33, 29, 1.7)}${eye(47, 29, 1.7)}`,
    otter: () => `
  <path d="M6 52 C14 44 30 44 44 46 C56 48 66 44 70 38" stroke="#8B5A2B" stroke-width="12" fill="none" stroke-linecap="round"/>
  <path d="M38 46 C42 40 50 40 52 44" stroke="#D9B38C" stroke-width="6" fill="none" stroke-linecap="round"/>
  <circle cx="70" cy="36" r="9" fill="#8B5A2B"/><circle cx="73" cy="39" r="4.5" fill="#D9B38C"/>
  ${eye(69, 33, 1.5)}<circle cx="76" cy="37" r="1.4" fill="#2B2F36"/>
  <path d="M0 58 Q12 54 24 58 T48 58 T72 58" stroke="#7CD3F7" stroke-width="2.4" fill="none" opacity=".8"/>`,
    owl: () => `${shadow(14)}
  <path d="M24 30 L22 18 L32 26 M56 30 L58 18 L48 26" fill="#A0693A" stroke="#A0693A" stroke-width="2" stroke-linejoin="round"/>
  <path d="M22 44 C22 28 30 22 40 22 C50 22 58 28 58 44 C58 62 50 72 40 72 C30 72 22 62 22 44z" fill="#A0693A"/>
  <path d="M30 50 C30 44 50 44 50 50 C50 64 30 64 30 50z" fill="#E8C39E"/>
  <path d="M33 52 l2 2 2 -2 M39 54 l2 2 2 -2 M45 52 l2 2 2 -2" stroke="#A0693A" stroke-width="1.2" fill="none"/>
  <circle cx="33" cy="36" r="7" fill="#FFF8E7"/><circle cx="47" cy="36" r="7" fill="#FFF8E7"/>
  ${eye(33, 36, 3)}${eye(47, 36, 3)}<path d="M38 42 L40 46 L42 42z" fill="#FF9F1C"/>`,
};

export function animalSVG(key) {
    if (SPECIES[key]) return penguinSpeciesSVG(key);
    const art = ANIMAL_ART[key];
    return `<svg viewBox="0 0 80 80" class="animal-art">${art ? art() : ''}</svg>`;
}
