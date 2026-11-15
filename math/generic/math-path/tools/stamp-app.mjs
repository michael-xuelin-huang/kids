// Cache-busting for GitHub Pages: points every module the app loads (its own and Pingo's)
// at "file.js?v=<content hash>" through an import map, versions the stylesheet, and
// updates the version label. Run before every commit:   npm run stamp
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const app = path.join(root, 'app');
const hash = (f) => crypto.createHash('sha1').update(fs.readFileSync(f)).digest('hex').slice(0, 8);
const js = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? js(path.join(dir, e.name)) : e.name.endsWith('.js') ? [path.join(dir, e.name)] : []));
const files = [...js(path.join(app, 'src')), ...js(path.join(root, '../math-quest-penguin/src'))].sort();
const imports = {};
for (const f of files) { const rel = path.relative(app, f).split(path.sep).join('/'); const k = rel.startsWith('.') ? rel : './' + rel; imports[k] = `${k}?v=${hash(f)}`; }
const all = crypto.createHash('sha1').update(Object.values(imports).join() + hash(path.join(app, 'app.css'))).digest('hex').slice(0, 7);
const when = new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/Los_Angeles' });
const idx = path.join(app, 'index.html');
let html = fs.readFileSync(idx, 'utf8');
const map = `<script type="importmap" id="version-map">${JSON.stringify({ imports }, null, 1)}</script>`;
html = html.replace(/\s*<script type="importmap"[\s\S]*?<\/script>/, '');
html = html.replace(/<script type="module" src="[^"]*"><\/script>/, `${map}\n    <script type="module" src="${imports['./src/main.js']}"></script>`);
html = html.replace(/href="\.\/app\.css[^"]*"/, `href="./app.css?v=${hash(path.join(app, 'app.css'))}"`);
html = html.replace(/<p class="app-version" id="app-version">[^<]*<\/p>/, `<p class="app-version" id="app-version">Updated ${when} (${all})</p>`);
fs.writeFileSync(idx, html);
console.log(`stamped ${files.length} modules, version ${all} (${when})`);
