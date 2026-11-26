# kids

Learning games for the kids. **Home page:** https://michael-xuelin-huang.github.io/kids/

The home page (`index.html`) links to every game, grouped by subject (Words & Spelling, Math, Science, Geography), with the newest game at the top.

To add a new game, put it in its own folder and add one entry to the `PROJECTS` list near the bottom of `index.html` (subject, icon, title, grade, date, path, short description).

Every game also shows a "🏠 All games" button in the top-left corner that leads back to the home page. For a new game, add this line just before `</body>` (adjust the `../` count to reach the repo root):

```html
<script src="../../home-link.js" defer></script>
```
