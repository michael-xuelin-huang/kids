// A learning plan made by code from the map and the child's record, used until the AI
// writes one (and whenever a plan runs out). It follows the same rules as the AI prompt:
// repair first, then 1–2 frontier skills that unlock the most, from different worlds.
import { hasGenerator } from '../content/skills.js';

export function frontier(map, mastered) {
    return map.nodes.filter((n) => !mastered.has(n.id) && n.prerequisites.every((p) => mastered.has(p)));
}

/**
 * learner: Learner; pingo: { 'oa3-facts-mult': 'mastered', ... } from Pingo's report (may be {}).
 */
export function defaultPlan({ map, story, learner, player, pingo = {} }) {
    const mastered = new Set(learner.mastered());
    for (const [id, v] of Object.entries(pingo)) if (/^mastered/.test(v)) mastered.add(id);
    // Grade 2 floor counts as known for a child who has played Pingo's harder levels.
    const shaky = Object.entries(learner.skills).filter(([id, r]) => r.status === 'learning' && r.attempts >= 6 && r.window.slice(-8).filter((w) => w.ok).length / Math.min(8, r.window.length) < 0.7).map(([id]) => id);

    const focus = [];
    for (const id of shaky.filter(hasGenerator).slice(0, 2)) {
        focus.push({ node: id, role: 'repair', weight: 0.2, why: 'Under 70% on recent tries.', difficulty: { start: 1 }, hints: { level: 2 } });
    }
    // Continue skills already started.
    const going = Object.entries(learner.skills).filter(([id, r]) => (r.status === 'learning' || r.status === 'barMet') && !shaky.includes(id) && hasGenerator(id)).map(([id]) => id);
    const node = (id) => map.nodes.find((n) => n.id === id);
    for (const id of going.slice(0, 2)) {
        const ready = (node(id)?.prerequisites || []).every((p) => mastered.has(p));
        focus.push({ node: id, role: ready ? 'new' : 'repair', weight: 0.3, why: 'Already started.' });
    }

    const front = frontier(map, mastered).filter((n) => hasGenerator(n.id) && !focus.some((f) => f.node === n.id))
        .sort((a, b) => b.unlocks.length - a.unlocks.length || a.grade - b.grade || a.depth - b.depth);
    const worlds = new Set(focus.map((f) => map.nodes.find((n) => n.id === f.node)?.world));
    const wanted = Math.max(0, 2 - going.length);
    for (const n of front) {
        if (focus.filter((f) => f.role === 'new').length >= going.length + wanted) break;
        if (worlds.has(n.world) && front.some((m) => !worlds.has(m.world) && m !== n)) continue;
        worlds.add(n.world);
        focus.push({ node: n.id, role: 'new', weight: 0.35, why: `Ready: everything it needs is known. Unlocks ${n.unlocks.length} later skills.` });
    }
    if (!focus.some((f) => f.role === 'new') && front[0]) focus.push({ node: front[0].id, role: 'new', weight: 0.35, why: 'Next on the map.' });
    // One review of something mastered.
    const rev = [...mastered].filter(hasGenerator);
    if (rev.length) focus.push({ node: rev[Math.floor(Math.random() * rev.length)], role: 'review', weight: 0.15, why: 'Keep it fresh.' });
    if (!focus.length) focus.push({ node: 'oa2-addsub-20', role: 'new', weight: 1, why: 'Starting point.' });

    const main = focus.find((f) => f.role === 'new') || focus[0];
    const ch = story.chapters.find((c) => c.nodes.includes(main.node)) || story.chapters[0];
    const newCount = focus.filter((f) => f.role === 'new' && learner.status(f.node) === 'new').length;
    return {
        version: 1,
        player: player || 'Player',
        createdAt: new Date().toISOString().slice(0, 10),
        basedOnReport: 'automatic (no AI plan loaded)',
        validFor: { sessions: 5, days: 7 },
        basis: {
            mastered: [...mastered].filter((id) => map.nodes.some((n) => n.id === id)),
            shaky,
            summary: 'Made automatically from the map and recent answers. Load an AI-written plan from the parent screen for a plan tuned to this child.',
        },
        focus,
        session: { minutes: 15, maxNewSkills: Math.max(1, Math.min(2, newCount)) },
        pacing: { style: 'fast', allowTestOut: true },
        story: { world: ch.world, chapter: ch.id, npc: ch.npc, goal: ch.title },
        rewards: { unlockAnimal: ch.reward },
        parentNote: 'This is an automatic plan. For a plan written for your child, download the report and follow prompts/next-plan.md.',
    };
}
