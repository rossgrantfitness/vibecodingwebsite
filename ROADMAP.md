# Roadmap

One step per session. End each with "commit and push", then start the next session fresh.

## Status

| Project | Built by | Status |
| --- | --- | --- |
| ATX 78729 Pulse (`pulse.html`) | — | Live |
| Mousecapades (`games/mousecapades/`) | Claude | In development (playable prototype) |
| VibePaint Studio | Gemini | Live |
| Campaign Forge | Gemini | Live |
| VibeSync Audio | Gemini | Live |
| VaultFlow Auth | Gemini | Live |

## Steps

- [x] **0. Foundation** — CLAUDE.md/ROADMAP.md, dead links replaced with status badges, nav fixed,
      CDN versions pinned, mobile back link on Pulse.
- [x] **1. Game engine + movement (greybox)** — fixed timestep, SMW-style walk/run/P-meter momentum,
      skid, variable jump, coyote time, jump buffer, head corner nudge, one-way platforms, duck,
      look-ahead camera, keyboard + gamepad, debug tuning panel with "copy values".
- [ ] **2. Feel tuning** — play, tune with the panel, send values + plain-language notes. Repeat as needed.
      Test course, left to right: low ceiling + lone block (head bumps, corner nudge) → gaps of 3 / 5 / 7
      tiles → stairs → pillars 3 / 4 / 5 tiles tall → one-way platforms up to a high ledge → long runway
      to fill the P-meter → 9- and 10-tile sprint gaps.
- [x] **3. Level 1 + gameplay** — Sector 1 (Gutter District): Scuttlebots (stomp), Spikebots (avoid),
      drones (stomp; hold jump for a high bounce), cheese chips, item blocks, 3 Golden Cheeses, checkpoint,
      exit gate, HUD, death/respawn, title screen, pause, win screen with best time, Web Audio SFX.
      Still to do: a power-up (and the hit-to-shrink damage model that comes with it).
- [ ] **4. Art + game feel** — mouse-girl animations, tileset, parallax dystopia background, particles,
      squash & stretch, screen shake, hit-stop, Web Audio SFX.
- [ ] **5. Polish + ship** — touch controls, music, back link, switch the
      portfolio card to Live, delete `synthwave_runner.html`.
- [ ] **6. Final site pass** — real card screenshots, social preview/SEO meta, mobile check, GitHub Pages deploy.

## Playing locally

ES modules don't load from `file://`. From the repo root run `python3 -m http.server`, then open
<http://localhost:8000/games/mousecapades/>. Press `` ` `` (or the Tuning button) for the tuning panel.
Add `?play` to skip the title screen, or `?level=test` for the movement test course.

## Still needed from you

- Real email (currently `hello@example.com` in the Contact section) and LinkedIn URL (currently `#`).
- A name for the mouse girl (game title is Mousecapades).
- GitHub Pages: in the repo, go to Settings → Pages → Deploy from branch → `main` / root.

## Brief for apps built in other tools (paste into Gemini)

> Build a single self-contained HTML file named `<name>.html` for my portfolio. Match this style: dark
> background `#050505`, panels `#121212` with subtle `rgba(255,255,255,0.05)` borders and rounded-3xl
> corners, text `#E5E5E5` / muted `#A3A3A3`, emerald/teal accent glows, Plus Jakarta Sans font, Tailwind
> via `https://cdn.tailwindcss.com`, Phosphor icons via `https://unpkg.com/@phosphor-icons/web@2.1.2`.
> Pin any other CDN library to an exact version. Include a "← Back to Portfolio" link to `index.html`
> that stays visible on mobile. No build step, no backend; everything runs in the browser.
