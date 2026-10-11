# Vibe Coding Portfolio

Static portfolio site for an AI-augmented developer, hosted on GitHub Pages. No build step:
every page is plain HTML/CSS/JS that works when served from the repo root.

See `ROADMAP.md` for the build plan and what's live vs. pending.

## Layout

- `index.html` — portfolio landing page. The "Selected Work" grid links to each project.
- `pulse.html` — ATX 78729 Pulse dashboard (live).
- `games/gutterlight/` — the mouse-girl platformer (in development; working title).
- `synthwave_runner.html` — old arcade game, superseded by Gutterlight. Unlinked; delete once Gutterlight ships.
- New web apps go at the repo root as `<name>.html` (single file) or in `<name>/index.html` if they need several files.

## Site conventions

- Dark theme: background `#050505`, surface `#121212`, text `#E5E5E5`, muted `#A3A3A3`, emerald/teal accent glows.
- Font: Plus Jakarta Sans (Google Fonts). Icons: Phosphor (`@phosphor-icons/web@2.1.2`).
- Tailwind via `cdn.tailwindcss.com` with the inline `tailwind.config` block used in `index.html`.
- Pin every CDN script to an exact version.
- Every project page has a visible "← Back to Portfolio" link to `index.html`, including on mobile.
- Project cards in `index.html`: a live project is an `<a href="...">` with a green "Live" badge; an
  unbuilt one is a `<div class="... cursor-default">` with a "Coming soon" / "In development" badge.
  When a project ships, switch its card from `<div>` to `<a>` and change the badge.

## Game (`games/gutterlight/`)

- Plain JS ES modules, no bundler, `<canvas>` rendering at a low internal resolution scaled up with
  nearest-neighbour (pixel-perfect). Fixed 60 Hz simulation timestep, decoupled from rendering.
- Keep modules small and focused (input, physics, level, entities, render, audio) so changes are targeted edits.
- All movement tuning lives in one constants object, editable live from the in-game debug panel (`~`).
- ES modules don't load from `file://` — test with `python3 -m http.server` from the repo root.
- Original art and audio only (generated in code or CC0 assets). No Nintendo assets.

## Git

- Commit and push at the end of every working session.
