// SVG drawings for questions and lessons. Interactive modes:
//   'shade' — tap bar parts to shade/unshade; onChange({ shaded: count })
//   'place' — tap the number line to put a dot (snaps to the nearest jump); onChange({ point: {n,d} })
const NS = 'http://www.w3.org/2000/svg';
const C = { ink: '#12355B', soft: '#4A6B8C', fill: '#2BB3C0', fillB: '#FF9F1C', paper: '#FFFFFF', line: '#9CC3DA', ice: '#E8F7FF', green: '#7BC950' };

function el(tag, attrs = {}, parent) {
    const e = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    if (parent) parent.appendChild(e);
    return e;
}
function svg(w, h, label) {
    const s = el('svg', { viewBox: `0 0 ${w} ${h}`, class: 'vis', role: 'img' });
    if (label) s.setAttribute('aria-label', label);
    return s;
}
function text(parent, x, y, str, attrs = {}) {
    const t = el('text', { x, y, 'text-anchor': 'middle', 'font-size': 22, fill: C.ink, 'font-weight': 700, ...attrs }, parent);
    t.textContent = str;
    return t;
}
/** A fraction label like 3/4 drawn stacked. */
function fracLabel(parent, x, y, str, size = 20) {
    const m = String(str).match(/^(\d+|\?)\/(\d+)$/);
    if (!m) { text(parent, x, y + size * 0.35, str, { 'font-size': size }); return; }
    text(parent, x, y - 3, m[1], { 'font-size': size });
    el('line', { x1: x - size * 0.55, x2: x + size * 0.55, y1: y + 2, y2: y + 2, stroke: C.ink, 'stroke-width': 2.2 }, parent);
    text(parent, x, y + size + 3, m[2], { 'font-size': size });
}

const UNEVEN = { 2: [1.45, 0.55], 3: [1.5, 0.6, 0.9], 4: [1.6, 0.6, 1.1, 0.7], 5: [1.4, 0.6, 1, 1.3, 0.7], 6: [1.5, 0.6, 1, 1.3, 0.8, 0.8], 8: [1.4, 0.6, 1, 1.2, 0.8, 1, 0.6, 1.4] };

function drawBar(parent, { d, shaded = [], uneven, x = 0, y = 0, w = 520, h = 70, color = C.fill, interactive, onTap }) {
    const ws = uneven && UNEVEN[d] ? UNEVEN[d] : Array(d).fill(1);
    const total = ws.reduce((a, b) => a + b, 0);
    let cx = x; const parts = [];
    ws.forEach((wi, i) => {
        const pw = (wi / total) * w;
        const r = el('rect', { x: cx, y, width: pw, height: h, fill: shaded.includes(i) ? color : C.paper, stroke: C.ink, 'stroke-width': 2.5, class: interactive ? 'part tap' : 'part' }, parent);
        if (interactive) {
            r.setAttribute('tabindex', '0'); r.setAttribute('role', 'button'); r.setAttribute('aria-label', `part ${i + 1}`);
            const act = () => onTap(i, r);
            r.addEventListener('click', act);
            r.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); act(); } });
        }
        parts.push(r); cx += pw;
    });
    el('rect', { x, y, width: w, height: h, fill: 'none', stroke: C.ink, 'stroke-width': 3.5, rx: 3 }, parent);
    return parts;
}

export function renderVisual(v, { mode, onChange } = {}) {
    if (!v) return null;
    if (v.type === 'bar') {
        const h = v.tall ? 150 : 70;
        const s = svg(560, h + 20, `bar cut into ${v.d} parts`);
        const shaded = new Set(v.shaded || []);
        const color = v.tall ? C.green : C.fill;
        drawBar(s, { d: v.d, shaded: [...shaded], uneven: v.uneven, x: 20, y: 10, w: 520, h, color, interactive: mode === 'shade',
            onTap: (i, r) => { shaded.has(i) ? shaded.delete(i) : shaded.add(i); r.setAttribute('fill', shaded.has(i) ? color : C.paper); onChange && onChange({ shaded: shaded.size }); } });
        return s;
    }
    if (v.type === 'bars') {
        const n = v.list.length; const h = 56, gap = 22; const labelW = v.list.some((b) => b.label) ? 70 : 0;
        const s = svg(560, n * (h + gap) + 10, 'fraction bars');
        v.list.forEach((b, i) => {
            const y = 10 + i * (h + gap);
            drawBar(s, { d: b.d, shaded: b.shaded, x: 10 + labelW, y, w: 540 - labelW, h, color: i % 2 ? C.fillB : C.fill });
            if (b.label) fracLabel(s, 10 + labelW / 2 - 4, y + h / 2 - 8, b.label, 19);
        });
        return s;
    }
    if (v.type === 'line') {
        const W = 560, x0 = 40, x1 = 520, y = 60; const steps = v.max * v.d;
        const s = svg(W, 130, `number line from 0 to ${v.max}`);
        const X = (k) => x0 + (k / steps) * (x1 - x0);
        el('line', { x1: x0 - 14, x2: x1 + 14, y1: y, y2: y, stroke: C.ink, 'stroke-width': 3.5, 'stroke-linecap': 'round' }, s);
        for (let k = 0; k <= steps; k++) {
            const whole = k % v.d === 0;
            el('line', { x1: X(k), x2: X(k), y1: y - (whole ? 18 : 11), y2: y + (whole ? 18 : 11), stroke: C.ink, 'stroke-width': whole ? 3.5 : 2.5 }, s);
            if (whole) text(s, X(k), y + 48, String(k / v.d), { 'font-size': 24 });
            else if (v.labels === 'all') fracLabel(s, X(k), y + 32, `${k}/${v.d}`, 15);
        }
        let dot = null;
        const put = (k) => {
            if (!dot) dot = el('circle', { r: 11, cy: y, fill: C.fillB, stroke: C.ink, 'stroke-width': 3 }, s);
            dot.setAttribute('cx', X(k));
        };
        if (v.point) put((v.point.n / v.point.d) * steps);
        if (mode === 'place') {
            const hit = el('rect', { x: x0 - 20, y: 0, width: x1 - x0 + 40, height: 130, fill: 'transparent', class: 'tap', tabindex: '0', role: 'slider', 'aria-label': 'number line: tap to place the dot, or use arrow keys' }, s);
            let cur = null;
            const choose = (k) => { cur = Math.max(0, Math.min(steps, k)); put(cur); onChange && onChange({ point: { n: cur, d: v.d } }); };
            hit.addEventListener('click', (e) => {
                const pt = s.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
                const p = pt.matrixTransform(s.getScreenCTM().inverse());
                choose(Math.round(((p.x - x0) / (x1 - x0)) * steps));
            });
            hit.addEventListener('keydown', (e) => {
                if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { e.preventDefault(); choose((cur ?? -1) + 1); }
                if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { e.preventDefault(); choose((cur ?? 1) - 1); }
            });
        }
        return s;
    }
    if (v.type === 'grid') {
        const cell = Math.min(46, 420 / Math.max(v.cols, v.rows * 1.4));
        const w = v.cols * cell, h = v.rows * cell; const ox = 70, oy = 40;
        const s = svg(ox + w + 30, oy + h + 20, `rectangle ${v.rows} by ${v.cols}`);
        const split = v.splitAt;
        if (v.showGrid) {
            for (let r = 0; r < v.rows; r++) for (let c = 0; c < v.cols; c++) {
                el('rect', { x: ox + c * cell, y: oy + r * cell, width: cell, height: cell, fill: split && c >= split ? '#FFE3BF' : '#C8EEF2', stroke: C.ink, 'stroke-width': 1.5 }, s);
            }
        } else el('rect', { x: ox, y: oy, width: w, height: h, fill: '#C8EEF2', stroke: C.ink, 'stroke-width': 3 }, s);
        el('rect', { x: ox, y: oy, width: w, height: h, fill: 'none', stroke: C.ink, 'stroke-width': 3.5 }, s);
        if (split) el('line', { x1: ox + split * cell, x2: ox + split * cell, y1: oy - 8, y2: oy + h + 8, stroke: '#D97C00', 'stroke-width': 4, 'stroke-dasharray': '8 5' }, s);
        if (v.labels) {
            text(s, ox + w / 2, oy - 12, `${v.cols} m`, { 'font-size': 20 });
            text(s, ox - 32, oy + h / 2 + 7, `${v.rows} m`, { 'font-size': 20 });
        }
        return s;
    }
    if (v.type === 'groups') {
        const g = v.groups, e = v.each; const cols = Math.min(g, 4); const rows = Math.ceil(g / cols);
        const R = 52; const W = 560; const H = rows * (2 * R + 18) + (v.hideCounts ? 70 : 10);
        const s = svg(W, H, `${g} groups`);
        const off = v.hideCounts ? 70 : 0;
        if (v.hideCounts) {
            // The pile to share, then empty plates.
            const per = Math.ceil(Math.sqrt(v.total * 3)); const dot = Math.min(9, 480 / per / 2.6);
            for (let i = 0; i < v.total; i++) el('circle', { cx: 40 + (i % per) * dot * 2.6, cy: 18 + Math.floor(i / per) * dot * 2.6, r: dot, fill: C.fillB, stroke: C.ink, 'stroke-width': 1.5 }, s);
        }
        for (let i = 0; i < g; i++) {
            const cx = W / cols * ((i % cols) + 0.5), cy = off + R + 9 + Math.floor(i / cols) * (2 * R + 18);
            el('circle', { cx, cy, r: R, fill: C.ice, stroke: C.ink, 'stroke-width': 3 }, s);
            if (!v.hideCounts) {
                const per = Math.ceil(Math.sqrt(e)); const dr = Math.min(9, (R * 1.3) / per / 2.4);
                for (let j = 0; j < e; j++) {
                    const dx = ((j % per) - (per - 1) / 2) * dr * 2.5, dy = (Math.floor(j / per) - (Math.ceil(e / per) - 1) / 2) * dr * 2.5;
                    el('circle', { cx: cx + dx, cy: cy + dy, r: dr, fill: C.fillB, stroke: C.ink, 'stroke-width': 1.5 }, s);
                }
            }
        }
        return s;
    }
    return null;
}
