export class AdaptiveEngine {
    constructor() {
        this.stats = {}; // key: "a x b", value: { attempts: 0, errors: 0, totalTime: 0 }
        // Initialize 9x9 grid
        for (let a = 1; a <= 9; a++) {
            for (let b = 1; b <= 9; b++) {
                this.stats[`${a}x${b}`] = { attempts: 0, errors: 0, avgTime: 2.0 };
            }
        }
    }

    recordAttempt(a, b, isCorrect, timeSpent) {
        const key = `${a}x${b}`;
        if (!this.stats[key]) this.stats[key] = { attempts: 0, errors: 0, avgTime: 2.0 };
        
        const entry = this.stats[key];
        entry.attempts++;
        if (!isCorrect) entry.errors++;
        entry.avgTime = (entry.avgTime * (entry.attempts - 1) + timeSpent) / entry.attempts;
    }

    getNextQuestion(maxGridSize, recentQuestions = []) {
        let pool = [];

        for (let a = 1; a <= maxGridSize; a++) {
            for (let b = 1; b <= maxGridSize; b++) {
                const key = `${a}x${b}`;
                if (recentQuestions.includes(key)) continue; // avoid immediate repeat

                const entry = this.stats[key];
                // Weight calculation: higher weight for errors and slower response times
                let weight = 1 + (entry.errors * 4) + (entry.avgTime > 4.0 ? 2 : 0);
                
                for (let w = 0; w < weight; w++) {
                    pool.push({ a, b });
                }
            }
        }

        if (pool.length === 0) {
            // fallback if all filtered out
            const a = Math.floor(Math.random() * maxGridSize) + 1;
            const b = Math.floor(Math.random() * maxGridSize) + 1;
            return { a, b };
        }

        return pool[Math.floor(Math.random() * pool.length)];
    }

    getMasteryPercentage(maxGridSize) {
        let masteredCount = 0;
        let totalCount = maxGridSize * maxGridSize;

        for (let a = 1; a <= maxGridSize; a++) {
            for (let b = 1; b <= maxGridSize; b++) {
                const entry = this.stats[`${a}x${b}`];
                if (entry.attempts > 0 && entry.errors === 0) {
                    masteredCount++;
                }
            }
        }
        return Math.round((masteredCount / totalCount) * 100);
    }
}