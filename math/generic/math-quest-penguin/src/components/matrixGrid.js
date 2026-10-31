// Times-table map (progress heatmap) and the review visuals for a missed fact.

// statusOf(a, b) -> 'known' | 'learning' | 'weak' | 'untested'
export function renderMiniHeatmap(container, statusOf, gridSize) {
    container.innerHTML = '';
    container.style.gridTemplateColumns = `repeat(${gridSize}, minmax(0, 1fr))`;
    for (let a = 1; a <= gridSize; a++) {
        for (let b = 1; b <= gridSize; b++) {
            const cell = document.createElement('div');
            cell.className = `cell cell--${statusOf(a, b) || 'untested'}`;
            cell.textContent = `${a}×${b}`;
            container.appendChild(cell);
        }
    }
}

export function renderReviewMatrix(container, targetA, targetB, gridSize) {
    container.innerHTML = '';
    container.style.gridTemplateColumns = `repeat(${gridSize}, minmax(0, 1fr))`;
    for (let a = 1; a <= gridSize; a++) {
        for (let b = 1; b <= gridSize; b++) {
            const cell = document.createElement('div');
            const isTarget = a === targetA && b === targetB;
            const onLine = a === targetA || b === targetB;
            cell.className = `review-cell${isTarget ? ' is-target' : onLine ? ' is-line' : ''}`;
            cell.textContent = a * b;
            container.appendChild(cell);
        }
    }
}

const FISH = '<svg class="fish" viewBox="0 0 22 14" aria-hidden="true"><path d="M2 7 C6 1 14 1 17 7 C14 13 6 13 2 7z" fill="#FF9F1C"/><path d="M16 7 L22 2 L22 12z" fill="#FF9F1C"/><circle cx="6" cy="6" r="1.3" fill="#12355B"/></svg>';

export function renderGemArray(container, titleContainer, a, b) {
    titleContainer.textContent = `${a} groups of ${b} fish`;
    container.innerHTML = '';
    for (let i = 0; i < a; i++) {
        const row = document.createElement('div');
        row.className = 'gem-row';
        row.innerHTML = FISH.repeat(b);
        container.appendChild(row);
    }
}
