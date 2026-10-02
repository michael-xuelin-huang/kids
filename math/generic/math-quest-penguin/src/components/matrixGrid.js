export function renderMiniHeatmap(container, adaptiveEngine, maxGridSize) {
    container.innerHTML = '';
    container.style.gridTemplateColumns = `repeat(${maxGridSize}, minmax(0, 1fr))`;

    for (let a = 1; a <= maxGridSize; a++) {
        for (let b = 1; b <= maxGridSize; b++) {
            const entry = adaptiveEngine.stats[`${a}x${b}`];
            let bgClass = 'bg-slate-700/50';
            if (entry && entry.attempts > 0) {
                bgClass = entry.errors === 0 ? 'bg-emerald-500/70' : 'bg-rose-500/70';
            }
            
            const cell = document.createElement('div');
            cell.className = `aspect-square rounded-md ${bgClass} transition border border-white/5 flex items-center justify-center text-[10px] font-bold text-white/80`;
            cell.textContent = `${a}×${b}`;
            container.appendChild(cell);
        }
    }
}

export function renderReviewMatrix(container, targetA, targetB, maxGridSize) {
    container.innerHTML = '';
    container.style.gridTemplateColumns = `repeat(${maxGridSize}, minmax(0, 1fr))`;

    for (let a = 1; a <= maxGridSize; a++) {
        for (let b = 1; b <= maxGridSize; b++) {
            const isTarget = (a === targetA && b === targetB);
            let cls = 'bg-slate-800/80 text-white/50 border-white/10';
            if (isTarget) {
                cls = 'bg-amber-400 text-slate-950 font-black scale-110 shadow-[0_0_15px_rgba(251,191,36,0.8)] z-10';
            } else if (a === targetA || b === targetB) {
                cls = 'bg-indigo-600/60 text-white font-bold border-indigo-400/40';
            }

            const cell = document.createElement('div');
            cell.className = `aspect-square rounded-md border flex items-center justify-center text-xs transition ${cls}`;
            cell.textContent = a * b;
            container.appendChild(cell);
        }
    }
}

export function renderGemArray(container, titleContainer, a, b) {
    titleContainer.textContent = `Array Model: ${a} groups of ${b} golden fish`;
    container.innerHTML = '';
    
    for (let i = 0; i < a; i++) {
        const row = document.createElement('div');
        row.className = 'flex gap-1.5 my-1';
        for (let j = 0; j < b; j++) {
            const fish = document.createElement('span');
            fish.className = 'text-xl animate-float';
            fish.textContent = '🐟';
            row.appendChild(fish);
        }
        container.appendChild(row);
    }
}