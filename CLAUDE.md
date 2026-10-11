# Vibe Coding Portfolio

Static portfolio for Ross Grant — designer & creative technologist (UX/UI, visual design, pixel art,
interactive work). Hosted on GitHub Pages. No build step: every page is plain HTML/CSS/JS served from
the repo root. Positioning: design taste and creative output first; AI is part of the process, never
the headline. No backend/security/"10x" claims; label prototypes and sample data honestly.

See `ROADMAP.md` for the build plan and what's live vs. pending.

## Layout

- `index.html` — homepage: hero (live pixel mouse), featured work, experiments, art gallery, process, notes,
  work-with-me (freelance services), about, contact.
- `resume.html` — HTML résumé in the site's design system; print stylesheet makes "Save as PDF" a clean one-pager.
- `notes/*.html` — devlogs / write-ups (same template as case studies). List new ones in the homepage Notes section and `sitemap.xml`.
- `404.html`, `robots.txt`, `sitemap.xml` — GitHub Pages extras; 404 uses root-absolute `/vibecodingwebsite/` paths.
- `docs/V2-STRATEGY.md` — hiring + monetization research behind v2, and the owner's action plan.
- `work/*.html` — case studies (Mousecapades, VibePaint, VibeSync), all sharing one template. Copy one to add more.
- `assets/css/site.css`, `assets/js/site.js` — shared design system and behaviour for homepage + case studies.
- `assets/js/hero-mouse.js` — hero animation + Konami easter egg; imports the game's own sprite/font code.
- `assets/img/` — generated game art (`mousecapades/`, 1× pixel PNGs shown with `.pixel`), app screenshots (`work/`, WebP), `og.png`.
- `pulse.html` — ATX Pulse dashboard (sample data).
- `vibepaint/` — VibePaint v2, a Photoshop-lite editor built with Claude. Plain ES modules, no bundler:
  `js/core/` (event bus, document + layers + blend modes, history, selection mask, pixel helpers, viewport),
  `js/tools/` (each tool is an object with `options` + pointer handlers; `onKey` for keys, `key` is the shortcut),
  `js/filters/` (`ADJUSTMENTS`, `FILTERS`; dialogs preview live), `js/ui/` (menus, panels, dialogs),
  `commands.js` (menu actions), `io.js` (open/export, `.vpaint` project files, IndexedDB autosave), `main.js` (input + shortcuts).
  `vibe_paint.html` is now just a redirect to it; v1 lives in git history.
- `vibe_sync.html`, `campaign_forge.html` — web apps built in Gemini (live). Leave these to the owner
  except for bug fixes.
- `OLDindex.html`, `newOLDindex.html` — the owner's backup copies of earlier landing pages. Leave them alone.
- `games/mousecapades/` — the mouse-girl platformer (in development).
- `synthwave_runner.html` — old arcade game, superseded by Mousecapades. Unlinked; delete once Mousecapades ships.
- New web apps go at the repo root as `<name>.html` (single file) or in `<name>/index.html` if they need several files.

## Site conventions

- Homepage + case studies use `assets/css/site.css` (hand-written CSS, no Tailwind). Colours are CSS variables
  with light/dark themes: cream, espresso, olive accent, sage, burgundy, cheese-gold. **No blues or navy.**
- Type: Fraunces (display) + Plus Jakarta Sans (body), from Google Fonts. Spacing scale 4/8/16/24/32/48/64/96.
- Pixel art is exported at 1× and scaled in CSS with `.pixel` (`image-rendering: pixelated`).
- Case studies open with an "At a glance" box (result, role, proof) and show a "Last updated" date.
  Interactive work should be playable in-page (`data-embed` click-to-play iframe), not just screenshots.
- Only claim what Ross can defend in an interview; AI is always framed as "I decided X, AI helped with Y".
- Selling, tips and hiring links must point off-site (itch.io, Gumroad, Ko-fi, Contra): GitHub Pages forbids e-commerce.
- Respect `prefers-reduced-motion`; every image gets alt text; no placeholder or `#` links on live pages.
  Owner-only TODOs go in HTML comments (`<!-- TODO(Ross): ... -->`).
- The Gemini app pages use Tailwind CDN + Plus Jakarta Sans; pin any CDN script to an exact version.
- Every project page has a visible "← Back to Portfolio" link to `index.html`, including on mobile.

## Game (`games/mousecapades/`)

- Plain JS ES modules, no bundler, `<canvas>` rendering at a low internal resolution scaled up with
  nearest-neighbour (pixel-perfect). Fixed 60 Hz simulation timestep, decoupled from rendering.
- Keep modules small and focused so changes are targeted edits: `game.js` (state machine, collisions, scoring),
  `player.js` / `entities.js` (built on `body.js` tile collision), `level.js` + `level1.js` (tiles and layout),
  `render.js` / `sprites.js` / `font.js` (drawing), `camera.js`, `input.js`, `audio.js`, `fx.js`, `debug.js`.
- All movement tuning lives in one constants object, editable live from the in-game debug panel (`~`).
- ES modules don't load from `file://` — test with `python3 -m http.server` from the repo root.
- Character art: `assets/mouse.png` is a 32×32-cell atlas (rows: idle, walk, run, jump, hurt, die, face; feet on the
  bottom row, body centred on x=16, facing right) plus `assets/mouse-portrait.png`, cleaned from Ross's sprite sheet
  and snapped to its 6-colour palette. `js/mouse-sprite.js` picks frames; hitbox size lives in `config.js` (`PLAYER_*`).
- Everything else is original and generated in code (or CC0). No Nintendo assets.

## Git

- Commit and push at the end of every working session.
