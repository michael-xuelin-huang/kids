// Offline simulator for the difficulty controller (src/utils/difficultyController.js).
//
//   node tools/simulate-difficulty.mjs
//
// Runs virtual children (who LEARN while they play) through both the old
// "10 correct answers per level" rule and the PID controller, and reports how
// many attempts each wastes on levels that are too easy or too hard. The
// learners are synthetic, so use it to compare designs and re-tune gains, not
// as proof of how real children behave; re-tune from real play logs when you
// have them. See the cost definition in evalPolicy().
// Dynamic-target simulator. The child LEARNS while playing, so the "right level"
// is recomputed every attempt from what the child actually knows:
//   m(L)  = mean knowledge over the facts in level L's grid
//   L*    = lowest level whose grid is not yet mostly mastered (m < 0.85), else 5
//   right zone = [L*, L*+1]   (L* = work to do, L*+1 = one stretch level)
// easy  = attempts spent below L* (wasted on mastered material)
// hard  = attempts spent above L*+1 (frustration)
import { AdaptiveEngine } from '../src/utils/adaptiveEngine.js';
import { DifficultyController, GRID_SIZES } from '../src/utils/difficultyController.js';

export function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}

function makeLearner({K, meanTime, slip=0, learn=0.15}, rnd) {
  const know = {};
  const kn = (a,b)=> { const key=a+'x'+b; if (know[key]===undefined) know[key] = Math.max(a,b) <= K ? 1 : 0; return know[key]; };
  return {
    kn,
    answer(a,b){
      const k = kn(a,b);
      const p = (0.2 + 0.75*k) * (1-slip);
      const correct = rnd() < p;
      const base = meanTime + (1-k)*(5.5-meanTime);
      const time = Math.max(0.5, base * (0.75 + 0.5*rnd()));
      know[a+'x'+b] = Math.min(1, k + (correct ? learn : learn*0.7));
      return { correct: correct && time < 12, time };
    },
    rightLevel(){
      for (let L=1; L<=5; L++){
        const g = GRID_SIZES[L-1]; let sum=0, n=0;
        for (let a=1;a<=g;a++) for (let b=1;b<=g;b++){ sum+=kn(a,b); n++; }
        if (sum/n < 0.85) return L;
      }
      return 5;
    },
  };
}

export const LEARNERS = {
  'beginner (knows to 3, slow)': { K:3, meanTime:3.2 },
  'low (knows to 4)':            { K:4, meanTime:2.4 },
  'mid (knows to 6)':            { K:6, meanTime:2.2 },
  'strong (knows to 7, fast)':   { K:7, meanTime:1.6 },
  'expert fast (all)':           { K:9, meanTime:1.3 },
  'expert slow (all)':           { K:9, meanTime:3.4 },
  'mid, careless (10% slips)':   { K:6, meanTime:2.2, slip:0.10 },
  'slow learner (knows to 3)':   { K:3, meanTime:3.0, learn:0.06 },
};

// policy: { level(): number, grid(): number, update(correct,time) }
export function oldPolicy(){
  let level=1, cc=0;
  return { level:()=>level, grid:()=>GRID_SIZES[level-1], update(ok,t,info){ if(ok) cc++; else cc=Math.max(0,cc-1); if(cc>=10&&level<5){level++;cc=0;} } };
}
export function newPolicy(config){
  const c = new DifficultyController({persist:false, config});
  return { level:()=>c.level, grid:()=>c.gridSize, update(ok,t,info){ c.update(ok,t,info); } };
}

export function run(spec, policyFactory, seed, N){
  const rnd = mulberry32(seed); const qrnd = mulberry32(seed+1);
  const realR = Math.random; Math.random = qrnd;
  try {
    const engine = new AdaptiveEngine({persist:false}); const L = makeLearner(spec, rnd); const pol = policyFactory();
    let recent=[], easy=0, hard=0, flips=0, prev=pol.level(), firstIn=-1, inEnd=false;
    for (let i=1;i<=N;i++){
      const q = engine.getNextQuestion(pol.grid(), recent); recent.push(q.a+'x'+q.b); if (recent.length>4) recent.shift();
      const star = L.rightLevel(); const lv = pol.level();
      if (lv < star) easy++; else if (lv > star+1) hard++;
      if (firstIn<0 && lv>=star && lv<=star+1) firstIn=i;
      const cold = engine.stats[q.a+'x'+q.b].attempts === 0;
      const r = L.answer(q.a,q.b); engine.recordAttempt(q.a,q.b,r.correct,r.time);
      let coldLeft=0; { const g=pol.grid(); for (let a=1;a<=g;a++) for (let b=1;b<=g;b++) if (engine.stats[a+'x'+b].attempts===0) coldLeft++; }
      pol.update(r.correct, r.time, { cold, masteryPct: engine.getMasteryPercentage(pol.grid()), coldLeft });
      if (pol.level()!==prev){ flips++; prev=pol.level(); }
    }
    const star = L.rightLevel(), lv = pol.level(); inEnd = lv>=star && lv<=star+1;
    return { easy, hard, flips, firstIn: firstIn<0 ? N+1 : firstIn, inEnd: inEnd?1:0 };
  } finally { Math.random = realR; }
}

export function evalPolicy(policyFactory, seeds, N, seedOffset=0, only=null){
  const out = {};
  for (const [name,spec] of Object.entries(LEARNERS)){
    if (only && !only.includes(name)) continue;
    const a = {easy:0,hard:0,flips:0,firstIn:0,inEnd:0};
    for (let s=1;s<=seeds;s++){ const m = run(spec, policyFactory, s*7919+seedOffset, N); for (const k in a) a[k]+=m[k]; }
    for (const k in a) a[k] = +(a[k]/seeds).toFixed(1);
    a.cost = +(a.easy + 0.7*a.hard + 1.5*Math.max(0,a.flips-5) + 30*(1-a.inEnd)).toFixed(1);
    out[name]=a;
  }
  return out;
}

if (process.argv[1] && process.argv[1].endsWith('simulate-difficulty.mjs')) {
  const N=150, S=150;
  const o = evalPolicy(oldPolicy, S, N), n = evalPolicy(()=>newPolicy({}), S, N);
  const tot = x=> +Object.values(x).reduce((s,v)=>s+v.cost,0).toFixed(1);
  console.log(`N=${N} attempts, ${S} seeds. easy=attempts below needed level, hard=attempts 2+ above, flips=level changes, firstIn=attempts to reach zone`);
  console.log('\nOLD RULE  total cost', tot(o)); console.table(o);
  console.log('PID (current defaults)  total cost', tot(n)); console.table(n);
}
