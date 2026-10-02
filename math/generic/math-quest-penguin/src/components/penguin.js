export const GEAR_CONFIGS = {
    1: { name: 'Bowtie', title: 'Novice Pingo', badge: 'Bowtie', svg: '<polygon points="80,110 100,120 120,110 120,130 100,120 80,130" fill="#ef4444" />' },
    2: { name: 'Sunglasses & Headphones', title: 'Cool Pingo', badge: 'Cool Gear', svg: '<rect x="80" y="65" width="40" height="15" rx="4" fill="#1e293b"/><path d="M70,60 Q100,45 130,60" fill="none" stroke="#38bdf8" stroke-width="4"/>' },
    3: { name: 'Superhero Cape & Crown', title: 'Hero Pingo', badge: 'Crown', svg: '<polygon points="90,40 100,25 110,40" fill="#fbbf24"/><path d="M60,110 L40,160 L160,160 L140,110 Z" fill="#dc2626" opacity="0.9"/>' },
    4: { name: 'Wizard Hat & Wand', title: 'Wizard Pingo', badge: 'Wizard', svg: '<polygon points="100,10 70,55 130,55" fill="#7c3aed"/><circle cx="100" cy="12" r="5" fill="#fbbf24"/>' },
    5: { name: 'Cyber Armor & Jetpack', title: 'Galaxy Ace Pingo', badge: 'Cyber Ace', svg: '<rect x="75" y="100" width="50" height="40" rx="8" fill="#0ea5e9"/><circle cx="100" cy="120" r="8" fill="#38bdf8" class="animate-pulse"/>' }
};

export function renderPenguin(containerElement, level, expression = 'normal') {
    const gear = GEAR_CONFIGS[level] || GEAR_CONFIGS[5];
    
    let eyeExpression = '<circle cx="85" cy="70" r="6" fill="#0f172a"/><circle cx="115" cy="70" r="6" fill="#0f172a"/>';
    if (expression === 'happy') {
        eyeExpression = '<path d="M79,72 Q85,62 91,72" stroke="#0f172a" stroke-width="4" fill="none"/><path d="M109,72 Q115,62 121,72" stroke="#0f172a" stroke-width="4" fill="none"/>';
    } else if (expression === 'frozen') {
        eyeExpression = '<text x="75" y="78" font-size="18">❄️</text><text x="105" y="78" font-size="18">❄️</text>';
    }

    containerElement.innerHTML = `
        <svg viewBox="0 0 200 200" class="w-full h-full drop-shadow-xl ${expression === 'happy' ? 'animate-bounce' : expression === 'frozen' ? 'animate-wiggle' : 'animate-float'}">
            <!-- Background Aura -->
            <circle cx="100" cy="100" r="75" fill="rgba(56, 189, 248, 0.15)" />
            
            <!-- Gear Behind -->
            ${level >= 3 && level < 5 ? gear.svg : ''}

            <!-- Penguin Body -->
            <ellipse cx="100" cy="115" rx="55" ry="65" fill="#1e293b" />
            <ellipse cx="100" cy="120" rx="42" ry="52" fill="#ffffff" />
            
            <!-- Wings -->
            <ellipse cx="50" cy="115" rx="12" ry="25" fill="#1e293b" transform="rotate(15 50 115)" />
            <ellipse cx="150" cy="115" rx="12" ry="25" fill="#1e293b" transform="rotate(-15 150 115)" />
            
            <!-- Feet -->
            <ellipse cx="80" cy="175" rx="14" ry="7" fill="#f59e0b" />
            <ellipse cx="120" cy="175" rx="14" ry="7" fill="#f59e0b" />

            <!-- Face & Eyes -->
            <circle cx="100" cy="85" r="40" fill="#1e293b" />
            <ellipse cx="100" cy="92" rx="30" ry="24" fill="#ffffff" />
            ${eyeExpression}

            <!-- Beak -->
            <polygon points="90,95 110,95 100,110" fill="#f59e0b" />

            <!-- Gear On Top -->
            ${level < 3 || level >= 5 ? gear.svg : ''}
        </svg>
    `;
}