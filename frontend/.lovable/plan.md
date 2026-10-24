## The problem

Two things are broken on the public event page (`/register/:slug`):

1. **The "Why You Can't Miss This" section literally collapses to one letter per line** at certain widths — that's a real bug in the `why_attend` grid (icon + heading take a full column on `lg`, leaving the bullets squeezed into ~40px columns).
2. The whole page feels generic: 5 half-baked templates, images shoved into small rounded squares, the same fade-up animation on every block, no real cinematic hierarchy, no use of the event's hero image at scale.

## The direction

One **premium, cinematic, mobile-first template** replaces all 5 variants. Every event page uses it. The event's flyer/hero image is treated as the whole stage, not a thumbnail. AI fills in any missing imagery so nothing ever looks empty.

## What I'll build

### 1. New `EventCinematicPage` — the only template

Replaces minimal / split / stacked / landing / cards. Structure top-to-bottom:

```text
┌─────────────────────────────────────────┐
│  HERO (100vh)                           │
│  • Full-bleed flyer/hero image          │
│  • Slow Ken Burns scale (framer-motion) │
│  • Layered gradient scrim, brand tint   │
│  • Massive display title, kinetic       │
│  • Date · Location · Capacity pills     │
│  • Animated scroll cue                  │
├─────────────────────────────────────────┤
│  STICKY REGISTER BAR (mobile + desktop) │
│  • Appears after hero scrolls past      │
│  • Brand-colored CTA → opens form sheet │
├─────────────────────────────────────────┤
│  EDITORIAL INTRO                        │
│  • Large pull-quote style description   │
│  • Asymmetric, single column, generous  │
├─────────────────────────────────────────┤
│  MODULES (rebuilt — see §2)             │
│  • why_attend, schedule, speakers,      │
│    location, faq, sponsors, custom      │
│  • Alternating full-bleed / contained   │
│  • Real imagery, not 16:11 thumbs       │
├─────────────────────────────────────────┤
│  REGISTER SECTION (in-page anchor)      │
│  • Glass card on a brand-tinted bed     │
│  • Ticket picker + form, mobile-first   │
├─────────────────────────────────────────┤
│  FOOTER · powered by                    │
└─────────────────────────────────────────┘
```

Motion system (one set, applied everywhere — not random per element):
- **Entrance**: blur-to-sharp + 24px rise, easing `[0.22, 1, 0.36, 1]`, 0.7s
- **Hero**: 12s Ken Burns scale 1 → 1.08, plus parallax on title (`useScroll` + `useTransform`)
- **Sticky bar**: spring-in once hero leaves viewport
- **Section transitions**: kept (gradient/wave/curve) but trimmed to 2 kinds, picked once per page

Mobile-first details:
- Hero: `100svh` not `100vh` (no iOS jump), title scales `text-5xl → text-8xl` fluidly with `clamp()`
- Sticky CTA bar with safe-area-inset padding
- Form sheet on mobile (`vaul`/`Drawer`), inline card on desktop
- All touch targets ≥ 44px; no horizontal scroll at 320px

### 2. Rebuild `EventModuleRenderer`

Each module type gets a **bespoke layout**, not the same "icon + heading + image right" pattern:

| Module | New treatment |
|---|---|
| `why_attend` | **Bento grid** — 1 hero bullet (large, image-backed) + 3 small cards. No more 1-col-wide text columns. Fixes the screenshot bug. |
| `schedule` | Vertical timeline with sticky day labels, time as large display number, framer stagger on scroll |
| `speakers` | Full-width carousel on mobile, asymmetric grid on desktop, large square portraits with overlay name |
| `location` | Full-bleed map embed (or generated city image) with floating address card |
| `faq` | Two-column on desktop, accordion with smooth height animation, oversized question type |
| `sponsors` | Marquee row (auto-scroll), grayscale → color on hover |
| `custom` | Editorial: max-w-prose, drop cap, generous line-height |

### 3. AI-generated imagery on demand

When a module or the event itself is missing an image, we call an edge function `generate-module-image` that:
1. Builds a prompt from the event name + module type + heading (e.g. "cinematic editorial photograph of a product launch keynote stage, dramatic lighting")
2. Calls Lovable AI Gateway `google/gemini-2.5-flash-image`
3. Uploads the resulting PNG to the existing `event-assets` storage bucket under `ai/{event_id}/{module_id}.png`
4. Stores the URL back on the module's `content.image_url` (or `events.background_image_url` for the hero) so it's permanent and free on subsequent loads

A new "Generate image" button in the dashboard's module editor triggers the same function manually. **No automatic generation on first public-page view** (avoids surprise credit usage); instead the editor surfaces "Add image · or generate one with AI" affordances next to every image field.

### 4. Files

**New**
- `src/pages/RegisterCinematic.tsx` — the new template (replaces the variant switch in `Register.tsx`)
- `src/components/event-public/HeroStage.tsx` — full-bleed cinematic hero
- `src/components/event-public/StickyRegisterBar.tsx`
- `src/components/event-public/RegisterSheet.tsx` — mobile drawer wrapping the form
- `src/components/event-public/modules/` — one file per module type (WhyAttend, Schedule, Speakers, Location, Faq, Sponsors, Custom)
- `supabase/functions/generate-module-image/index.ts` — AI image generation + storage upload

**Edited**
- `src/pages/Register.tsx` — strip variant logic, render `RegisterCinematic`
- `src/components/event-detail/EventModuleRenderer.tsx` — becomes a thin dispatcher to the new per-module components (kept so the dashboard preview still uses it)
- `src/components/event-detail/EventPageBuilder.tsx` — add "Generate with AI" buttons next to image fields
- `mem://features/registration-templates` — update to reflect the single-template direction

**Deleted (kept as code paths but no longer reachable)**
- The minimal / split / stacked / cards branches in `Register.tsx`

### Out of scope for this round

- Dashboard event-detail UI (sidebar, tabs) — untouched
- Database schema — no new columns; we reuse `background_image_url` and `event_modules.content.image_url`
- Pricing / ticket logic — unchanged
- Marketing landing page (`/`) — untouched, this is only about the per-event public page

### Verification

After build I'll:
1. Open the existing `/register/...` URL at 375px, 768px, 1440px in the preview
2. Confirm the broken bullets render as a proper bento grid
3. Spot-check the hero, sticky bar, and form sheet on mobile
4. Generate one AI image end-to-end on a real event to confirm the edge function and storage path work
