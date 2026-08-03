# 5x5

Personal StrongLifts 5x5 training log. Local-first PWA. Single user, no backend.

## Specs

Two documents govern this project. Read both before starting work, and re-read the relevant section before any non-trivial change.

- `docs/5x5-app-requirements.md` governs behavior
- `docs/5x5-app-design-spec.md` governs appearance

Where they conflict on a UI detail, the design spec wins. Where a spec is silent, ask rather than invent.

## Stack

Vite, React 18, TypeScript strict, Tailwind, Zustand, Dexie, Recharts, vite-plugin-pwa, Vitest.

## Architecture rules

1. `src/domain/` is pure TypeScript. It imports nothing from `src/data/`, `src/state/`, `src/features/`, or `src/components/`, and touches no browser globals. This keeps the program rules unit testable and portable to React Native later.
2. `src/data/repository.ts` is the only module that imports `src/data/db.ts`. Features never touch Dexie directly.
3. No hex color literals outside `src/design/tokens.css`. Colors come from Tailwind tokens which read CSS variables.
4. No `any`. No `@ts-ignore` without a comment explaining why.

## The three things most likely to be built wrong

**The rest timer.** Never count down by accumulating `setInterval` ticks. Store an absolute `endsAt` timestamp and recompute remaining time from `Date.now()` on every frame and on every `visibilitychange`. Mobile browsers suspend timers when the screen locks. See requirements section 8.3.

**Deadlift.** It is 1x5, one work set of five reps. Not 5x5. This is correct and deliberate.

**The two squats.** Workout A squats for volume — `core-squat-volume`, four sets of 12/10/8/8 that ramp up in weight as the reps come down (85/90/95/100 percent of the tracked weight). Workout B squats heavy — `core-squat`, 5x5 at one weight. They are separate exercises with separate weights and separate progression tracks, and neither is a bug to be reconciled with the other. Requirements section 3.1.

The tracked weight of a ramped exercise is its **top** set, so `currentWeight`, progression, personal records, and the weight chart all mean the same thing they mean for a flat 5x5. The volume squat is the only exercise that ramps; `loadScheme` is null everywhere else.

## Progression rules, in short

- Success on an exercise means every work set hit **its own** target reps. Sets are not always uniform; see `repScheme` and `workSetRepTargets`. Warmup sets never count.
- Success adds that exercise's increment. Failure repeats the weight.
- Three consecutive failures at the same weight triggers a 10 percent deload, rounded down to a loadable weight.
- Exercises progress independently. Failing Bench never affects Squat, and failing the volume squat never affects the heavy one.
- The next workout type comes from the last completed workout, never from the calendar.

## Testing

`src/domain/` requires full unit coverage before any UI work begins. Every worked example and edge case in requirements sections 5, 6, 7, and 12 becomes a test case. Run `npm test` before considering any phase complete.

## Build order

Follow requirements section 14. Do not skip phase 2's validation step: install to a physical phone home screen and confirm the backgrounded timer and lock-screen notification actually fire before building anything else on top of them.

## Out of scope

No accounts, no cloud sync, no social features, no other program variants, no store submission. See requirements section 1.2.
