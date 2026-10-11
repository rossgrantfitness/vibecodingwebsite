# Roadmap

One step per session. End each with "commit and push", then start the next session fresh.

## Status

| Project | Built by | Status |
| --- | --- | --- |
| ATX 78729 Pulse (`pulse.html`) | — | Live |
| Gutterlight (mouse platformer) | Claude | In development |
| VibePaint Studio | Gemini | Coming soon |
| Campaign Forge | Gemini | Coming soon |
| VibeSync Audio | Gemini | Coming soon |
| VaultFlow Auth | Gemini | Coming soon |

## Steps

- [x] **0. Foundation** — CLAUDE.md/ROADMAP.md, dead links replaced with status badges, nav fixed,
      CDN versions pinned, mobile back link on Pulse.
- [ ] **1. Game engine + movement (greybox)** — fixed timestep, SMW-style walk/run momentum, skid,
      variable jump, coyote time, jump buffer, tile collision, look-ahead camera, keyboard + gamepad,
      debug tuning panel with "copy values".
- [ ] **2. Feel tuning** — play, tune with the panel, send values + plain-language notes. Repeat as needed.
- [ ] **3. Level 1 + gameplay** — 2–3 min level, stompable enemies, collectibles, item blocks,
      power-ups, checkpoint, goal, HUD, death/respawn.
- [ ] **4. Art + game feel** — mouse-girl animations, tileset, parallax dystopia background, particles,
      squash & stretch, screen shake, hit-stop, Web Audio SFX.
- [ ] **5. Polish + ship** — title screen, pause, results screen, touch controls, back link, switch the
      portfolio card to Live, delete `synthwave_runner.html`.
- [ ] **6. Final site pass** — real card screenshots, social preview/SEO meta, mobile check, GitHub Pages deploy.

## Still needed from you

- Real email (currently `hello@example.com` in the Contact section) and LinkedIn URL (currently `#`).
- Names: "Gutterlight" is a working title, and the mouse girl doesn't have a name yet.
- GitHub Pages: in the repo, go to Settings → Pages → Deploy from branch → `main` / root.

## Brief for apps built in other tools (paste into Gemini)

> Build a single self-contained HTML file named `<name>.html` for my portfolio. Match this style: dark
> background `#050505`, panels `#121212` with subtle `rgba(255,255,255,0.05)` borders and rounded-3xl
> corners, text `#E5E5E5` / muted `#A3A3A3`, emerald/teal accent glows, Plus Jakarta Sans font, Tailwind
> via `https://cdn.tailwindcss.com`, Phosphor icons via `https://unpkg.com/@phosphor-icons/web@2.1.2`.
> Pin any other CDN library to an exact version. Include a "← Back to Portfolio" link to `index.html`
> that stays visible on mobile. No build step, no backend; everything runs in the browser.
