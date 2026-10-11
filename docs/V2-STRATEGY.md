# Portfolio v2: research, decisions and plan

Researched October 2026. Most portfolio advice is practitioner opinion rather than measured data;
each point below is tagged **[data]** or **[opinion]**, with sources at the bottom of each section.

---

## 1. What hiring people look for, and what v2 does about it

| Finding | What v2 does |
| --- | --- |
| The first look takes seconds to a few minutes. The only measured number is for résumés: 7.4 s ([data], Ladders eye-tracking). Recruiters fixate on titles and clear headings. | Name and role first. Hero says what you do in one line. Every case study opens with an **At a glance** box (result, your part, proof). |
| "Start each case study with a concrete result… most won't get to the end" ([opinion], design recruiter Tom Scott; Adobe Design: "don't bury the lede"). | Result first, then goal, decisions, process. |
| Case studies should show the problem, your role, the process, **abandoned concepts and why**, impact and lessons ([opinion], NN/g, 204 hiring managers). | Mousecapades now has **Drafts I rejected** (Gutterlight, Mouse Monogatari, the 3×5 logo), a **version history** and **what broke**. |
| 2–5 deep projects beat many thin ones ([opinion], NN/g, UXDI). | 3 featured case studies; everything else sits under "Experiments & studies". |
| Red flags: no clear ownership ("we"), **interactive work shown only as static images**, no dates or versions, no setbacks shown, buzzwords, unpolished craft ([opinion], Artisan Talent, Tom Scott). | Mousecapades is **playable inside its case study**. Every page shows a "last updated" date, roles are spelled out, and the copy is plain. |
| AI fluency is now expected, but "vibe-coded prototypes that looked very vibed" get rejected. Your design input has to show ([opinion], Tom Scott 2026). | AI is framed as your process, not the headline. The new **What I decide / What AI helps with** split makes ownership explicit. |
| Disclosing AI use costs some trust; getting caught hiding it costs more ([data], Schilke & Reimann 2025, 13 experiments, 5,000+ people). Frame AI around your judgment and responsibility. | Every AI mention says who decided what. Nielsen: show rejected drafts and how you narrowed down; "honesty above all." |
| You'll be asked about decisions you didn't make ([opinion], Artisan Talent). | Rule for every page: only claim what you can defend in an interview. Please read every case study and fix anything that isn't true for you. |
| 62% of UX practitioners changed careers ([data], IxDF survey, 1,300+). Prove transferable skills with examples, not adjectives ([opinion]). | About and the résumé tie support, fraud and coaching to concrete things: accuracy, escalations, 100+ clients. |
| The résumé is judged as a design artifact; templates are a "non-starter" ([opinion], Adobe Design). | New `resume.html`, designed in the site's system, with a print stylesheet so **Save as PDF** gives a clean one-pager. |
| Playable links beat descriptions; devlogs show reasoning ([opinion], game-dev guides). | Touch controls (it plays on a phone now), the click-to-play embed, and the first devlog, **Tuning the jump**. |
| Mobile layouts that aren't tested are friction ([opinion], Adobe). | Every page checked at 390 px. The game has on-screen controls. |

**One opportunity worth knowing about:** trust and safety design roles ask for knowledge of fraud, identity
and "calibrating friction." Your Apple fraud and AML background is genuinely rare among designers.
You said you don't want the site to lean on security, so nothing on the site does. But if a design role
on a fraud or trust team comes up, that's where your background is strongest.

The junior design market is "insanely tough" right now ([opinion], Tom Scott). That's another reason to
pair the job search with freelance work, below.

Sources: hrdive.com/news/recruiters-spend-74-seconds-looking-at-your-resume/541582 ·
verifiedinsider.substack.com/p/faq-design-hiring-in-2026 · verifiedinsider.substack.com/p/design-hiring-observations ·
adobe.design/ideas/ask-adobe-design-how-can-applicants-stand-out-when-applying-to-design-jobs ·
nngroup.com/articles/ux-design-portfolios · uxdesigninstitute.com/blog/hiring-managers-ux-portfolio ·
creative.artisantalent.com/creative-engineer-portfolio ·
theconversation.com/being-honest-about-using-ai-at-work-makes-people-trust-you-less-research-finds-253590 ·
jakobnielsenphd.substack.com/p/ux-portfolio-reviews-hiring-exercises ·
ixdf.org/literature/article/how-to-change-your-career-to-ux-design · slategit.com/blog/game-developer-portfolio-playable-builds

---

## 2. Making money from it, ranked by income per evening

The honest headline: **client work pays far better per hour than anything you can sell.** Games and
asset packs mostly get you noticed; treat their income as a bonus.

1. **Freelance microsites, landing pages, pixel art and game UI.** This is the best return.
   - Typical rates: web work runs about $50–100/hr mid-level, and a landing page is often $2,000–5,000 fixed.
     Pixel art runs about $20–35 per 32×32 character, $50–150 for an animated character, and $35–130+ per
     tileset. These come from self-published rate lists, so treat them as rough.
   - Where clients come from: **Contra** (0% freelancer fee), Upwork (about 10%), Fiverr (20%), and local
     Austin events. Games Y'all showcases and the IGDA Austin meetups are good places to show Mousecapades.
   - Every paid project becomes a real case study, which also helps the job search.
   - **On the site:** a new **Work with me** section with three services and an email button that pre-fills
     a project brief.
2. **Put Mousecapades on itch.io as a free browser game** with optional payment. Little effort and little
   money, but it gets found. itch.io takes 0–100% (you choose; 10% by default). Charging for web play
   basically doesn't work, so its real value is reach, and a link recruiters already recognize.
3. **Pixel-art asset packs.** Steady but small: $2–5 for small packs, $10–20 for tilesets. Pricing at exactly
   $5 shows up in two of itch.io's price filters. Package art you've already made rather than making new art
   to sell. Tag hand-made packs **No AI**, which buyers look for.
4. **Tips and memberships (Ko-fi, Patreon).** Only worth it once you have an audience. A Ko-fi link takes
   ten minutes; don't expect much from it.
5. **The Godot space-trucking RPG on Steam.** A long shot. Steam's fee is $100, refunded after $1,000. The
   median indie game earns somewhere between a few hundred and a couple of thousand dollars (estimates
   differ). If you go for it, put the Steam page up early and aim for a Next Fest demo.

### Caveats before you sell anything
- **GitHub Pages can't be your shop.** Its terms forbid running e-commerce on it, so every buy, tip or hire
  button must link out to itch.io, Gumroad, Ko-fi or Contra. The site is set up that way.
- **Suno music:** commercial use is OK only for tracks generated and downloaded **on a paid plan**.
  Free-tier tracks stay non-commercial, even if you upgrade later. Keep your download records. Pure-AI
  music may not be copyrightable, so others could reuse it.
- **Udio music is the biggest risk.** Downloads were switched off after Udio's 2025 settlement with UMG.
  Only tracks downloaded under the old paid terms have a clear commercial basis. Check Udio's current terms
  before shipping anything that uses them.
- **AI disclosure:** Steam requires disclosing AI content that players see or hear (so AI music counts);
  coding tools used during development don't need disclosing. itch.io asks for disclosure across graphics,
  sound, text and code, and delists AI asset packs that aren't tagged.

Sources: itch.io/docs/creators/payments · jobbers.io/average-platform-fees-across-50-freelance-marketplaces-in-2026 ·
checkoutpage.com/blog/gumroad-fees · schoolmaker.com/blog/ko-fi-pricing · partner.steamgames.com/doc/gettingstarted/appfee ·
gameworldobserver.com/2026/09/01/the-median-revenue-of-games-on-steam-has-been-declining-for-12-consecutive-years ·
suno.com/terms · digitalmusicnews.com/2025/10/31/udio-umg-deal-downloads-resumed-48-hours ·
docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits ·
gamingonlinux.com/2024/11/itchio-store-now-requires-ai-generated-content-disclosures-for-assets

---

## 3. Your next 30 days (things only you can do)

**Week 1: make it true and personal**
- [ ] Read every page out loud. Fix anything that isn't exactly how it happened (search the HTML for `TODO(Ross)`).
- [ ] Add a real photo to About, and check the résumé (and decide whether to name your current employer).
- [ ] Rename the GitHub account or buy a domain (e.g. rossgrant.design) so the URL stops saying "fitness" and
      "vibecoding". Then update the `og:url`, canonical and sitemap URLs.

**Week 2: get found**
- [ ] Create an itch.io account and publish Mousecapades as a free browser game. A draft page is below.
- [ ] Make a Contra profile using the three services from the site, and link it from the Work with me section.
- [ ] Post one 20–30 second gameplay clip with the tuning panel on LinkedIn, plus the devlog link.

**Weeks 3–4: show up**
- [ ] Bring Mousecapades on a laptop and a phone to a Games Y'all or IGDA Austin event.
- [ ] Add sketches or a moodboard to the Mousecapades case study. Real artifacts beat any amount of copy.
- [ ] Write a second devlog: the level design, or the naming story.
- [ ] Pick one freelance lead, even small or cheap, and turn it into a fourth case study.

### Draft itch.io page for Mousecapades
> **Mousecapades** is a tiny SNES-style platformer about one small mouse in a big neon city. Run, skid and
> stomp robots through Sector 1, find all three Golden Cheeses, and beat your best time. It plays in the
> browser on keyboard, gamepad or touch.
>
> Made by Ross Grant: design, pixel art, level design and movement tuning, with the code built by directing
> Claude. AI disclosure: Code (AI-assisted). Graphics and sound are original and made in code.
