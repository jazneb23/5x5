# StrongLifts 5x5 Tracker: Design Specification

**Version** 1.0
**Companion to** `5x5-app-requirements.md`

This document is the source of truth for appearance and interaction feel. Every color, size, and spacing value here is a literal instruction, not a suggestion.

---

## 1. Design brief

**Who is using it.** One person, alone, in a gym.
**When.** Standing next to a loaded barbell, between heavy sets, breathing hard, holding the phone in one hand.
**Its single job.** Answer one question at a glance: what do I lift, and can I lift it yet.

Everything in this spec follows from those three lines. Anything that does not serve them is cut.

### 1.1 Constraints that come from the room, not from taste

| Constraint | Consequence |
|---|---|
| Read at arm's length, sometimes at the bottom of a squat rack | The prescribed weight is the largest element on the screen by a wide margin |
| One hand, thumb only, phone possibly in the other hand's chalk | Every interactive target is at least 56 px. Nothing important lives in the top third of the screen. |
| Chalk, sweat, imprecise taps | No small controls adjacent to destructive actions. Undo is always one tap away. |
| Gym lighting is either fluorescent glare or a dim basement | High contrast dark theme. No mid-gray on mid-gray. |
| Attention is on the bar, not the phone | Zero decorative motion. The only animation is state feedback. |

---

## 2. Direction

**Iron and chalk.**

The visual language comes from the two materials the user actually touches: powder-coated steel and lifting chalk. The interface is dark, machined, and quiet. The one thing that accumulates on screen is chalk white, and it accumulates exactly as the workout is completed. By the end of a session the screen is marked up. That is the emotional payoff and it costs nothing.

Color is not decoration here. The plate colors are the international weightlifting standard, so the strip of colored plates under each weight is genuinely readable as physical objects the user is about to pick up.

### 2.1 What this direction is explicitly rejecting

- Neon fitness-app gradients and energetic orange-to-pink
- Motivational language anywhere in the interface
- Green checkmarks. A completed set is a chalk mark, not a task closed in a todo app.
- Progress bars for the workout as a whole. The set circles already show progress.
- Rounded, friendly, bouncy. This is a log book, not a game.

---

## 3. Tokens

### 3.1 Color

```css
:root {
  /* Ground. Powder-coated rack steel. */
  --iron-950: #0E1216;   /* app background */
  --iron-900: #171D23;   /* card and sheet surfaces */
  --iron-800: #212932;   /* raised surfaces, inactive controls */
  --iron-700: #2E3945;   /* hairlines, dividers, circle outlines */
  --iron-600: #46545F;   /* disabled foreground */

  /* Chalk. */
  --chalk-100: #F1EFE9;  /* primary text, completed set fill */
  --chalk-300: #C4C8CC;  /* secondary text */
  --chalk-500: #8894A0;  /* tertiary text, labels, units */

  /* Signal. Drawn from IWF plate colors. */
  --signal:    #2C7FD4;  /* 20 kg blue. primary action, timer ring. */
  --signal-dim:#1B5FA5;
  --fail:      #C0392B;  /* 25 kg red. missed reps, deloads. */
  --record:    #2E8B57;  /* 10 kg green. personal records only. */

  /* Plate fills, for the plate strip. */
  --plate-45:  #2C7FD4;
  --plate-35:  #F2C230;
  --plate-25:  #C0392B;
  --plate-10:  #2E8B57;
  --plate-5:   #F1EFE9;
  --plate-2p5: #8894A0;
  --plate-frac:#46545F;
}
```

**Rules of use.**
- `--signal` appears at most twice on any screen. It is the primary action and the running timer ring. Nothing else.
- `--record` appears only when a personal record is set. If it shows up anywhere else, it has been misused.
- Completed state is `--chalk-100`. Never green.
- There is no light theme in v1. The app is `color-scheme: dark`.

### 3.2 Type

Three faces, three jobs. All available from Google Fonts. Self-host the woff2 files so the app works offline.

| Role | Face | Why |
|---|---|---|
| Display and numerals | **Archivo** (variable, weight and width axes) | Wide, flat-sided, stencil-adjacent. Reads like markings stamped on equipment. Its width axis lets the big weight number get genuinely wide without a second family. |
| Body and UI | **IBM Plex Sans** | Engineered rather than friendly. Neutral next to Archivo without disappearing. |
| Data and timers | **IBM Plex Mono** | Tabular figures. A countdown set in a proportional face jitters on every tick, which is the single most irritating detail an app like this can have. |

```css
--font-display: 'Archivo', system-ui, sans-serif;
--font-body:    'IBM Plex Sans', system-ui, sans-serif;
--font-mono:    'IBM Plex Mono', ui-monospace, monospace;
```

Scale. All sizes in px, line heights unitless.

| Token | Size / LH | Face | Weight | Tracking | Use |
|---|---|---|---|---|---|
| `weight-hero` | 76 / 0.9 | Archivo | 700, width 115 | -0.02em | The prescribed weight on the workout screen |
| `weight-lg` | 40 / 1.0 | Archivo | 600, width 110 | -0.01em | Weight on the home card |
| `display-md` | 28 / 1.15 | Archivo | 600 | -0.01em | Screen titles |
| `title` | 20 / 1.3 | Archivo | 600 | 0 | Exercise names |
| `body` | 16 / 1.5 | Plex Sans | 400 | 0 | Everything default |
| `body-strong` | 16 / 1.5 | Plex Sans | 600 | 0 | Emphasis in prose |
| `label` | 12 / 1.2 | Plex Sans | 600 | 0.12em, uppercase | Section eyebrows, units, table headers |
| `timer` | 52 / 1.0 | Plex Mono | 500 | 0.02em | The rest countdown |
| `data` | 15 / 1.4 | Plex Mono | 400 | 0 | Rep counts, dates, set tables |

Units are never the same size as the number they follow. `185` is `weight-hero`, `LB` is `label` in `--chalk-500`, baseline aligned to the bottom of the numeral.

### 3.3 Space and shape

4 px base scale: 4, 8, 12, 16, 20, 24, 32, 40, 48, 64.

```css
--radius-sm: 4px;   /* chips, small buttons */
--radius-md: 8px;   /* cards, sheets, inputs */
--radius-lg: 12px;  /* the workout exercise card only */
--radius-pill: 999px;
```

Restrained radii. Steel has edges. Nothing in this app is a soft rounded rectangle with a 24 px radius.

Hairlines are 1 px `--iron-700`. There are no drop shadows anywhere. Elevation is communicated by surface color stepping from `--iron-950` up to `--iron-800`.

### 3.4 Layout

- Single column, `max-width: 480px`, centered
- Horizontal page padding 20 px
- Bottom tab bar 64 px tall plus safe area inset
- Timer bar 72 px, docked directly above the tab bar when active
- Portrait only. Lock orientation in the manifest.
- All fixed bottom elements respect `env(safe-area-inset-bottom)`

**Thumb zone rule.** Nothing that needs to be tapped mid-set sits above 55 percent of viewport height. On the workout screen this means the set circles and the timer controls live in the bottom half, and the weight display lives in the top half where it is read but never touched.

---

## 4. Signature element: the plate strip

This is the one thing the app is remembered by, and the one place complexity is justified.

Every prescribed weight is accompanied by a horizontal strip of plate silhouettes showing what to load on **one side** of the bar, heaviest at the left, next to the collar. Colors are the IWF standard, so the strip maps directly onto the physical plates on the rack.

```
185 LB
▐███▌▐███▌▐▌       BAR 45  +  45 45 25   PER SIDE
 45   45   25
```

Specification:

- Each plate renders as a vertical rounded bar, width 10 px, radius 2 px, gap 3 px
- Height encodes plate diameter, which is how a lifter actually identifies a plate at a glance:
  - 45 lb → 36 px
  - 35 lb → 32 px
  - 25 lb → 27 px
  - 10 lb → 22 px
  - 5 lb → 17 px
  - 2.5 lb → 13 px
  - fractional → 9 px
- A 2 px vertical `--iron-700` rule at the left represents the collar. The bar itself is not drawn.
- Below the strip, one line of `label` type in `--chalk-500`: `BAR 45 + 45 45 25 PER SIDE`
- If the target weight is not loadable with the configured inventory, append a `--fail` chip reading `+2.5 SHORT` and outline the strip in `--fail`. Never silently round.
- Tapping the strip opens a sheet with a larger diagram and the running total.

The strip appears on the home card, the workout screen, and history detail. It does not appear on charts or settings.

---

## 5. Component specifications

### 5.1 Set circle

The most-used control in the app. Get this exactly right.

- Diameter 60 px, gap 12 px between circles. Five circles fit within a 360 px viewport with 20 px page padding.
- Tap target extends to 68 px via padding, without changing the visual size.

| State | Fill | Border | Content |
|---|---|---|---|
| Unlogged | transparent | 2 px `--iron-700` | Target reps in `data` at `--chalk-500` |
| Complete | `--chalk-100` | none | Target reps in `data` at `--iron-950` |
| Partial | transparent | 2 px `--fail` | Completed reps in `data` at `--fail`, weight 600 |
| Warmup complete | `--iron-700` | none | reps in `--chalk-300` |
| Active target | transparent | 2 px `--signal` | pulsing at 2 s, `prefers-reduced-motion` disables the pulse |

Transitions: fill and border color over 120 ms `cubic-bezier(0.2, 0, 0, 1)`. On tap to complete, scale from 0.92 to 1.0 over 140 ms. Nothing overshoots. No bounce.

Long press threshold 400 ms, with a light haptic at threshold where supported, then a numeric keypad sheet.

### 5.2 Rest timer bar

Docked above the tab bar. Full width minus 20 px page padding, height 72 px, background `--iron-900`, top hairline `--iron-700`.

```
┌────────────────────────────────────────────────┐
│  ◜◝                                            │
│ ( 1:23 )   REST      [ -30 ]  [ +30 ]  [ SKIP ]│
│  ◟◞                                            │
└────────────────────────────────────────────────┘
```

- Countdown in `timer` type, `--chalk-100`, tabular figures
- A 3 px ring around the countdown depletes counterclockwise in `--signal`, drawn as an SVG `stroke-dashoffset`
- Under 10 seconds remaining: ring and numerals shift to `--chalk-100` at full opacity and the ring pulses once per second
- At zero: bar background flashes `--signal-dim` for 600 ms, tone plays, vibration fires, label changes to `GO`. The bar then holds `GO` until the next set is logged or 30 seconds pass.
- `-30` and `+30` are 56 px square, `--iron-800` fill, `--chalk-300` label
- `SKIP` is a text button in `--chalk-500`, deliberately the lowest-contrast control on the screen so it is not hit by accident

### 5.3 Buttons

| Variant | Fill | Text | Height | Use |
|---|---|---|---|---|
| Primary | `--signal` | `--chalk-100`, `body-strong` | 56 | Start workout, Finish workout. One per screen. |
| Secondary | transparent, 1 px `--iron-700` | `--chalk-100` | 56 | Add exercise, Export |
| Ghost | transparent | `--chalk-500` | 48 | Skip, Cancel |
| Destructive | transparent, 1 px `--fail` | `--fail` | 56 | Discard workout, Reset data. Always behind a confirmation sheet. |

Radius `--radius-sm`. No gradients, no shadows, no uppercase button labels. Active state is a 4 percent white overlay, not a scale transform.

### 5.4 Exercise card, workout screen

Surface `--iron-900`, radius `--radius-lg`, padding 20 px, hairline border `--iron-700`.

The current exercise is fully expanded. Completed exercises collapse to a 56 px summary row showing name, weight, and five small state dots. Upcoming exercises collapse to name and weight in `--chalk-500`.

### 5.5 Charts

Recharts, restyled completely. The default Recharts look must not survive.

- Line: 2 px `--signal`, no dots except on the most recent point and on records
- Record points: 6 px `--record` circle
- Deload events: a 1 px vertical `--fail` dashed rule with a small `label`-type marker at the axis
- Grid: horizontal only, 1 px `--iron-800`, no vertical grid
- Axes: `label` type in `--chalk-500`. No axis lines. Four y ticks maximum.
- Tooltip: `--iron-800` surface, 1 px `--iron-700`, `data` type, no arrow, no shadow
- No area fills, no gradients under the line

### 5.6 Bottom navigation

Four tabs: Today, History, Progress, Exercises. Settings lives behind a gear in the Today screen header, not in the tab bar.

- Icons at 24 px, 1.5 px stroke, Lucide
- Labels in `label` type, 10 px
- Active: `--chalk-100` icon and label plus a 2 px `--signal` rule along the top edge of the tab
- Inactive: `--chalk-500`

---

## 6. Screen layouts

### 6.1 Today

```
┌──────────────────────────────────────┐
│  TODAY                          ⚙    │
│                                      │
│  ┌────────────────────────────────┐  │
│  │  NEXT WORKOUT                  │  │
│  │  A                             │  │
│  │                                │  │
│  │  Squat (Volume)     120 LB     │  │
│  │  12/10/8/8                     │  │
│  │  ▐███▌▐▌                       │  │
│  │  ──────────────────────────    │  │
│  │  Bench Press 5x5    135 LB     │  │
│  │  ▐███▌▐▌                       │  │
│  │  ──────────────────────────    │  │
│  │  Barbell Row 5x5    110 LB     │  │
│  │  ▐███▌                         │  │
│  │                                │  │
│  │  ┌──────────────────────────┐  │  │
│  │  │     Start workout        │  │  │
│  │  └──────────────────────────┘  │  │
│  └────────────────────────────────┘  │
│                                      │
│  RECENT                              │
│  Mon 21 Jul   B    ● ● ●             │
│  Fri 18 Jul   A    ● ○ ●             │
│  Wed 16 Jul   B    ● ● ●             │
│                                      │
├──────────────────────────────────────┤
│  Today   History   Progress   Lifts  │
└──────────────────────────────────────┘
```

The letter A or B is set in `display-md` in `--signal`. It is the only signal-colored element besides the button, and it tells the user which session it is before they read anything else.

Recent rows use filled `--chalk-100` dots for passed exercises and hollow `--fail` rings for failed ones.

Each exercise name carries its set-and-rep shape — `5x5`, `1x5`, `12/10/8/8` — in `label` at `--chalk-500`, set in the mono face and trailing the name on the same line. Workout A's volume squat and Workout B's heavy squat are different lifts at different weights, and the shape is what distinguishes them at a glance. The same label appears beside core lift names on the Exercises and onboarding screens. It is never shown on the Workout screen, where the set circles already carry each set's target.

When the last session was finished with work still on it — unlogged or only partly logged, not merely skipped — an `UNFINISHED` card sits above the next-workout card, in the same container treatment. Its A or B is `display-md` in `--chalk-100`, not `--signal`: the signal color stays with the next workout and its button, so the two cards never compete. One line of `body` in `--chalk-300` gives the date and what was left, in the form `Thu 30 Jul · Bench Press not logged.`, and the action is a secondary button reading `Resume workout A`.

### 6.2 Workout, the primary screen

```
┌──────────────────────────────────────┐
│  ← WORKOUT A            12:04    ⋯   │
│                                      │
│  1 of 3                              │
│  Squat                               │
│                                      │
│         185 LB                       │
│                                      │
│  ▐███▌▐███▌▐▌                        │
│  BAR 45  +  45 45 25  PER SIDE       │
│                                      │
│  ▸ Warm up  (4 sets)                 │
│                                      │
│  ─────────────────────────────────   │
│                                      │
│   ┌──┐ ┌──┐ ┌──┐ ┌──┐ ┌──┐          │
│   │ 5│ │ 5│ │ 5│ │ 5│ │ 5│          │
│   └──┘ └──┘ └──┘ └──┘ └──┘          │
│    ●    ●    ○    ·    ·             │
│                                      │
│  ▸ Note                              │
│                                      │
│  Next:  Bench Press 135              │
│                                      │
├──────────────────────────────────────┤
│  ◜◝                                  │
│ ( 1:23 )  REST    [-30] [+30] [SKIP] │
│  ◟◞                                  │
├──────────────────────────────────────┤
│  Today   History   Progress   Lifts  │
└──────────────────────────────────────┘
```

`185` is `weight-hero`, roughly a fifth of the viewport height. `LB` is `label` type in `--chalk-500` sitting on the numeral's baseline. Nothing else competes for that band of the screen. This is the risk this design takes: an aggressive amount of the most valuable screen real estate given to a three digit number. It is justified because that number is the entire reason the user opened the app while standing at a rack.

The hero number is **what to load right now**: the weight of the first work set not yet logged, falling back to the last set once they are all done. For every lift whose sets share one weight — which is all of them but the volume squat — that is the exercise's weight and this says nothing new. For the volume squat, whose load ramps across the session (requirements 3.1), it is the number that keeps the promise the hero number makes. The plate strip beneath it follows the same set, since the two are read together while loading the bar.

An exercise whose sets are not all at one weight gets two additions, and an exercise whose sets are all at one weight gets neither:

```
│         170 LB                       │
│        SET 1 OF 4                    │
│                                      │
│  ▐███▌▐▌                             │
│  BAR 45  +  45 15  PER SIDE          │
│                                      │
│    170  180  190  200                │
│   ┌──┐ ┌──┐ ┌──┐ ┌──┐                │
│   │12│ │10│ │ 8│ │ 8│                │
│   └──┘ └──┘ └──┘ └──┘                │
│                                      │
│    0/4 sets                          │
│    Sets scale from 200 LB            │
```

- `SET n OF m` in `label` at `--chalk-500` directly under the hero, naming which set the hero number belongs to. Without it the big number is ambiguous the moment it can change mid-exercise.
- A weight **above** each set circle in `data`, mono, the active set at `--chalk-100` and the rest at `--chalk-500`, dotted-underlined to read as editable. Tapping one edits that set alone.

Every set's weight is on screen at once — no stepping through them one at a time. The whole ramp is four numbers and it costs one line to show all of it, so the user can see what the session asks of them before they start rather than discovering it a set at a time.

The weight sits above its bubble rather than below so each column reads top to bottom in the order the work happens: load this, then do these reps. It is mono at `data` rather than `label`, because unlike the warmup row's weights — which are reference, tucked inside a collapsed section — these are the numbers the user loads the bar from on their way down the screen to the circle they are about to tap.

Tapping the hero edits the set it names. Tapping `Sets scale from 200 LB`, in `data` at `--chalk-500` below the set count, edits the exercise's top weight and re-derives the whole ramp from it — the equivalent of tapping the hero on a flat exercise, kept as a separate control so a number and the sheet it opens always agree.

The Today screen is unaffected: it shows one weight per exercise, and for a ramped exercise that is the top set — the heaviest thing in the session, and the same quantity every other row shows. The rep-shape label beside the name already carries the fact that the volume squat is shaped differently.

`1 of 3` is `label` type in `--chalk-500`. The exercise name is `title`.

Set circles sit at roughly 62 percent of viewport height, dead center of the thumb arc.

`Finish workout` is not on this screen. It appears as a primary button only after the last set of the last exercise is logged, replacing the `Next:` line. Before that it is available under the `⋯` menu alongside `Discard workout`.

### 6.3 Workout complete

```
┌──────────────────────────────────────┐
│  WORKOUT A                           │
│  38 min                              │
│                                      │
│  Squat            185    5 5 5 5 5   │
│  NEXT TIME        190                │
│                                      │
│  Bench Press      135    5 5 5 3 3   │
│  NEXT TIME        135    ATTEMPT 2/3 │
│                                      │
│  Barbell Row      110    5 5 5 5 5   │
│  NEXT TIME        115                │
│                                      │
│  ★ RECORD   Squat 185 x 5x5          │
│                                      │
│  Bodyweight  ______                  │
│  Note        ______                  │
│                                      │
│  ┌────────────────────────────────┐  │
│  │            Done                │  │
│  └────────────────────────────────┘  │
└──────────────────────────────────────┘
```

The `NEXT TIME` line is the most valuable thing on this screen and is the reason the app exists. It is `label` type for the eyebrow and `data` type for the values. Increases render in `--chalk-100`, holds in `--chalk-500`, deloads in `--fail`.

Rep sequences are `data` type. Completed reps in `--chalk-100`, missed reps in `--fail`.

`★ RECORD` rows are the only place `--record` green appears in the entire app.

### 6.4 Progress

```
┌──────────────────────────────────────┐
│  PROGRESS                            │
│                                      │
│  [ Squat ▾ ]                         │
│                                      │
│  185 LB                              │
│  CURRENT     ▲ 40 LB IN 8 WEEKS      │
│                                      │
│   200 ┤                        ╭──   │
│       │                    ╭───╯     │
│   150 ┤            ╭───────╯         │
│       │      ╭─────╯                 │
│   100 ┤ ─────╯     ┊                 │
│       └──┬───┬───┬─┊─┬───┬───┬       │
│         MAY     JUN   JUL            │
│                     deload           │
│                                      │
│  ALL TIME BEST      185 x 5x5        │
│  SESSIONS           34               │
│  EST 1RM            215              │
│  LONGEST STREAK     6 WEEKS          │
│                                      │
└──────────────────────────────────────┘
```

Stat rows are a two column layout: `label` type left in `--chalk-500`, `data` type right in `--chalk-100`, separated by a 1 px `--iron-800` hairline. No cards, no boxes, no icons.

---

## 7. Motion

The complete inventory. Nothing outside this list animates.

| Element | Animation | Duration | Easing |
|---|---|---|---|
| Set circle fill | color plus scale 0.92 to 1.0 | 140 ms | `cubic-bezier(0.2, 0, 0, 1)` |
| Timer ring | continuous `stroke-dashoffset` | linear, per frame | linear |
| Timer complete | background flash to `--signal-dim` and back | 600 ms | ease-out |
| Exercise advance | card cross-fade plus 8 px upward translate | 180 ms | `cubic-bezier(0.2, 0, 0, 1)` |
| Sheet present | translate from 100 percent to 0 | 220 ms | `cubic-bezier(0.2, 0, 0, 1)` |
| Screen change | opacity only, no slide | 120 ms | linear |

No parallax, no scroll-triggered reveals, no skeleton shimmer, no confetti on a personal record. A record is marked with a green star and nothing more.

`@media (prefers-reduced-motion: reduce)` reduces every duration above to 0 ms except the timer ring, which becomes a stepped update once per second.

---

## 8. Copy

Voice: a training log, not a coach. Plain, present tense, no exclamation marks, no second-person encouragement.

| Situation | Write | Do not write |
|---|---|---|
| Start | `Start workout` | `Let's crush it` |
| After a failed exercise | `135 stays. Attempt 2 of 3.` | `Don't worry, you've got this next time` |
| After a deload | `Deloaded 185 to 165.` | `Time for a reset` |
| Personal record | `Record. Squat 185 x 5x5.` | `NEW PR! 🎉` |
| Empty history | `No workouts logged yet.` | `Your journey starts here` |
| Timer complete | `GO` | `Rest complete, ready for your next set?` |
| Import failure | `That file is from schema version 3. This app reads version 1.` | `Something went wrong` |
| Discard confirm | `Discard this workout? Logged sets will not be saved.` | `Are you sure?` |

Units are uppercase `LB` or `KG` in `label` type. Dates are `Mon 21 Jul`. Times are `M:SS` for the timer and `38 min` for session duration.

---

## 9. Accessibility and quality floor

Non-negotiable, and testable.

- Every text and background pairing meets WCAG AA. `--chalk-500` on `--iron-950` is 6.1:1 and is the lowest-contrast pairing permitted. `--iron-600` is used for disabled foregrounds only and never for readable text.
- Every interactive element has a visible focus ring: 2 px `--signal`, 2 px offset.
- Set circles have `role="button"` and an `aria-label` of the form `Set 3, 5 of 5 reps, completed`, updated on every change.
- The timer is announced by an `aria-live="polite"` region at start, at 10 seconds, and at zero. It does not announce every tick.
- Charts have a `Show table` toggle rendering the same data as an accessible `<table>`.
- Color is never the only signal. A failed set shows the rep number as well as red. A passed exercise shows a filled dot as well as chalk white.
- Minimum touch target 56 x 56 px with a minimum 8 px gap between adjacent targets.
- Text scales with the system setting. Use `rem` and test at 200 percent. The `weight-hero` numeral may cap its growth. Nothing else may.
- Full keyboard operability, because the app will occasionally be used on a laptop.

---

## 10. App identity

**Name.** `5x5`. Two characters, unmistakable on a home screen.

**Icon.** A 1024 px square, `--iron-950` ground. Centered: five vertical chalk-white bars of equal width and height, evenly spaced, occupying the middle 60 percent. It reads as five sets, as five plates on edge, and as a tally mark. No barbell silhouette, no dumbbell, no flexing arm. At 60 px on a home screen it stays legible where an illustrated barbell would turn to mush.

**Manifest.**

```json
{
  "name": "5x5",
  "short_name": "5x5",
  "display": "standalone",
  "orientation": "portrait",
  "background_color": "#0E1216",
  "theme_color": "#0E1216",
  "start_url": "/",
  "icons": [
    { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png" },
    { "src": "/icon-512-maskable.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```

Also required for a clean iOS home screen install: `<meta name="apple-mobile-web-app-capable" content="yes">`, `<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">`, and an `apple-touch-icon` link.

---

## 11. Tailwind configuration

Extend rather than replace, and use the CSS variables so the tokens have exactly one home.

```js
// tailwind.config.js
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        iron: {
          950: 'var(--iron-950)', 900: 'var(--iron-900)', 800: 'var(--iron-800)',
          700: 'var(--iron-700)', 600: 'var(--iron-600)',
        },
        chalk: {
          100: 'var(--chalk-100)', 300: 'var(--chalk-300)', 500: 'var(--chalk-500)',
        },
        signal: { DEFAULT: 'var(--signal)', dim: 'var(--signal-dim)' },
        fail: 'var(--fail)',
        record: 'var(--record)',
      },
      fontFamily: {
        display: ['Archivo', 'system-ui', 'sans-serif'],
        body: ['IBM Plex Sans', 'system-ui', 'sans-serif'],
        mono: ['IBM Plex Mono', 'ui-monospace', 'monospace'],
      },
      fontSize: {
        'weight-hero': ['76px', { lineHeight: '0.9', letterSpacing: '-0.02em' }],
        'weight-lg':   ['40px', { lineHeight: '1.0', letterSpacing: '-0.01em' }],
        'display-md':  ['28px', { lineHeight: '1.15', letterSpacing: '-0.01em' }],
        'title':       ['20px', { lineHeight: '1.3' }],
        'timer':       ['52px', { lineHeight: '1.0', letterSpacing: '0.02em' }],
        'data':        ['15px', { lineHeight: '1.4' }],
        'label':       ['12px', { lineHeight: '1.2', letterSpacing: '0.12em' }],
      },
      borderRadius: { sm: '4px', md: '8px', lg: '12px' },
      maxWidth: { app: '480px' },
    },
  },
};
```

Put the raw `:root` variable block from section 3.1 in `src/design/tokens.css` and import it once in `main.tsx`. No component defines a hex value. If a hex literal appears anywhere in `src/features/` or `src/components/`, it is a bug.

---

## 12. Design review checklist

Run this before calling the UI finished.

1. Can the prescribed weight be read from six feet away in a bright room? If not, the hero numeral is too small.
2. Can every action needed during a set be reached with one thumb without shifting grip?
3. Does `--signal` appear more than twice on any single screen? If yes, remove one.
4. Does `--record` green appear anywhere other than a personal record row? If yes, remove it.
5. Is there any animation not listed in section 7? Delete it.
6. Is there a hex literal anywhere outside `tokens.css`? Move it.
7. Does anything on screen use the word "crush," "beast," "journey," or "goals"? Rewrite it.
8. With `prefers-reduced-motion: reduce`, is the app fully usable and free of movement?
9. At 200 percent system text size, does any layout break or clip?
10. Does the screen visibly accumulate chalk white as the workout progresses? That is the payoff. If the finished workout screen does not look markedly different from the empty one, the direction has not been executed.
