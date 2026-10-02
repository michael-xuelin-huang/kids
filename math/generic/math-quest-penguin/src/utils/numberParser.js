// Levenshtein distance & fuzzy number parser for closed set 1-81
const NUMBER_WORDS = {
    one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
    ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
    twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80,
    zero: 0
};

export function parseSpokenNumber(transcript) {
    if (!transcript) return null;
    const clean = transcript.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
    
    // Direct digit check
    const directNum = parseInt(clean, 10);
    if (!isNaN(directNum) && directNum >= 1 && directNum <= 81) {
        return directNum;
    }

    // Word parsing (e.g., "forty two", "twenty")
    const tokens = clean.split(/\s+/);
    let total = 0;
    let foundWord = false;

    for (let token of tokens) {
        if (NUMBER_WORDS[token] !== undefined) {
            total += NUMBER_WORDS[token];
            foundWord = true;
        }
    }

    if (foundWord && total >= 1 && total <= 81) {
        return total;
    }

    // Levenshtein fallback on standard outputs
    let bestMatch = null;
    let minDistance = 999;

    for (let i = 1; i <= 81; i++) {
        const strVal = i.toString();
        const dist = levenshtein(clean, strVal);
        if (dist < minDistance) {
            minDistance = dist;
            bestMatch = i;
        }
    }

    return minDistance <= 2 ? bestMatch : null;
}

function levenshtein(a, b) {
    const matrix = Array.scalar ? null : [];
    for (let i = 0; i <= b.length; i++) {
        matrix[i] = [i];
    }
    for (let j = 0; j <= a.length; j++) {
        matrix[0][j] = j;
    }
    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            if (b.charAt(i - 1) === a.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j - 1] + 1,
                    Math.min(matrix[i][j - 1] + 1, matrix[i - 1][j] + 1)
                );
            }
        }
    }
    return matrix[b.length][a.length];
}