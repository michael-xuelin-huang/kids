// Cache-busting for GitHub Pages (which lets browsers reuse files for 10
// minutes): writes an import map into index.html that points every module at
// "file.js?v=<content hash>", versions the stylesheet link, and updates the
// "Updated ..." label. Run before every commit:   npm run stamp
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const hash = (f) => crypto.createHash('sha1').update(fs.readFileSync(f)).digest('hex').slice(0, 8);
const files = [];
(function walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (e.name.endsWith('.js')) files.push(p);
    }
})(path.join(root, 'src'));

const imports = {};
for (const f of files.sort()) {
    const rel = './' + path.relative(root, f).split(path.sep).join('/');
    imports[rel] = `${rel}?v=${hash(f)}`;
}
const all = crypto.createHash('sha1').update(Object.values(imports).join() + hash(path.join(root, 'src/game.css'))).digest('hex').slice(0, 7);
const when = new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/Los_Angeles' });

const indexPath = path.join(root, 'index.html');
let html = fs.readFileSync(indexPath, 'utf8');
const map = `<script type="importmap" id="version-map">${JSON.stringify({ imports }, null, 1)}</script>`;
html = html.replace(/<script type="importmap" id="version-map">[\s\S]*?<\/script>/, map);
if (!html.includes('id="version-map"')) html = html.replace('<script type="module"', `${map}\n    <script type="module"`);
html = html.replace(/href="\.\/src\/game\.css(\?v=[^"]*)?"/, `href="./src/game.css?v=${hash(path.join(root, 'src/game.css'))}"`);
html = html.replace(/src="\.\/src\/main\.js(\?v=[^"]*)?"/, `src="${imports["./src/main.js"]}"`);
html = html.replace(/<p id="app-version"[^>]*>[\s\S]*?<\/p>/, `<p id="app-version" class="app-version">Updated ${when} (${all})</p>`);
if (!html.includes('id="app-version"')) html = html.replace('<script type="importmap"', `<p id="app-version" class="app-version">Updated ${when} (${all})</p>\n    <script type="importmap"`);
fs.writeFileSync(indexPath, html);
console.log(`stamped ${files.length} modules, version ${all} (${when})`);
