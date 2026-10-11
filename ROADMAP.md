# Roadmap

One step per session. End each with "commit and push", then start the next session fresh.

## Status

| Project | Built by | Status |
| --- | --- | --- |
| ATX Pulse (`pulse.html`) | — | Live (sample data) |
| Mousecapades (`games/mousecapades/`) | Claude | In development (playable prototype) |
| VibePaint Studio | Gemini | Live |
| Campaign Forge | Gemini | Live |
| VibeSync Audio | Gemini | Live |
| Site redesign (homepage + 3 case studies) | Claude | Live |
| Portfolio v2 (résumé, notes, services, touch controls, playable embed) | Claude | Live; see `docs/V2-STRATEGY.md` |

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
- [ ] **5. Polish + ship** — ~~touch controls~~ (done in v2), music, itch.io release, switch the
      portfolio card to Live, delete `synthwave_runner.html`.
- [ ] **6. Final site pass** — real card screenshots, social preview/SEO meta, mobile check, GitHub Pages deploy.

## Playing locally

ES modules don't load from `file://`. From the repo root run `python3 -m http.server`, then open
<http://localhost:8000/games/mousecapades/>. Press `` ` `` (or the Tuning button) for the tuning panel.
Add `?play` to skip the title screen, or `?level=test` for the movement test course.

## Still needed from you

Content only you can supply (search the HTML for `TODO(Ross)`):
- A real photo for About (`assets/img/ross.jpg`, swap it into the `.portrait` block in `index.html`).
- A résumé PDF (`assets/resume.pdf`), then add a "Résumé" button in the hero and contact rows.
- Sketches / moodboard for the Mousecapades case study.
- For VibePaint and VibeSync: one prompt that worked, one that didn't, and early sketches.
- Screenshots of the Godot project (Jackie) to replace the placeholder art on its card.
- A name for the mouse girl.
- Optional: a custom domain (e.g. rossgrant.design) or rename the GitHub account/repo. If the URL changes,
  update the `og:url` / `og:image` meta tags in `index.html` and `work/*.html`.

## Brief for apps built in other tools (paste into Gemini)

> Build a single self-contained HTML file named `<name>.html` for my portfolio (Ross Grant, designer &
> creative technologist). Match my site: warm cream background `#f3eee4` (dark mode `#15110e`), espresso
> text `#221c17`, muted `#6b6258`, olive accent `#556b2f`, sage `#8f9f74`, burgundy `#7a2531`, and a
> cheese-gold highlight `#d99a1e`. No blue or navy anywhere. Headings in Fraunces, body in Plus Jakarta
> Sans (Google Fonts). Rounded 18px cards with 1px borders, generous whitespace. Pin any CDN library to an
> exact version. Include a "← Back to Portfolio" link to `index.html` that stays visible on mobile. No
> build step, no backend; everything runs in the browser. Be honest in the copy about mockups and sample data.
