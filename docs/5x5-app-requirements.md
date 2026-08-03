# StrongLifts 5x5 Tracker: Requirements Specification

**Version** 1.0
**Purpose** Personal-use barbell training log implementing the StrongLifts 5x5 program, with an automatic rest timer, per-set logging, weight progression, long-term progress tracking, and support for user-defined additional exercises.

This document is the source of truth for behavior. The companion document `5x5-app-design-spec.md` is the source of truth for appearance. Where the two disagree on a UI detail, the design spec wins.

---

## 1. Goals and non-goals

### 1.1 Goals

1. Open the app at the gym, tap "Start workout," and be told exactly what to lift and how much.
2. Log each set with a single thumb tap.
3. A rest timer that starts on its own after each logged set and tells the user when to lift again, including when the phone is locked in a pocket.
4. Weight progression calculated automatically. The user never does arithmetic.
5. Progress over time is visible per lift as a chart and as a list of personal records.
6. The user can define and track additional exercises beyond the five core lifts.
7. Works offline. No account, no login, no server.

### 1.2 Non-goals

Explicitly out of scope for v1. Do not build these.

- User accounts, authentication, cloud sync, or multi-device sync
- Social features, sharing, leaderboards
- Video form guides or exercise demonstration media
- Nutrition, macro, or bodyweight tracking beyond a single optional bodyweight field
- Program variants beyond StrongLifts 5x5 (no Madcow, no 5/3/1, no Texas Method)
- Apple Watch or Wear OS companion
- App Store or Play Store submission

---

## 2. Platform and stack

### 2.1 Decision

Build a **local-first Progressive Web App**, installed to the iOS or Android home screen.

| Layer | Choice |
|---|---|
| Build tool | Vite |
| Language | TypeScript, strict mode |
| UI | React 18, function components and hooks |
| Styling | Tailwind CSS with a custom token layer (see design spec) |
| Routing | React Router, hash or browser history |
| State | Zustand for app state, with a persistence middleware |
| Storage | IndexedDB via Dexie |
| Charts | Recharts |
| PWA | `vite-plugin-pwa` for manifest and service worker |
| Hosting | Any static host. Vercel or Netlify. |
| Testing | Vitest for the progression engine and timer logic |

### 2.2 Rationale

A PWA installs to the home screen with a real icon, runs full screen with no browser chrome, works with no signal in a basement gym, and requires no developer account, no Xcode, and no store review. The entire dataset for years of training is a few hundred kilobytes.

### 2.3 Alternative, if native is required later

Expo with React Native. The domain layer in section 4 and the engine in section 5 are pure TypeScript with no DOM dependencies and port directly. Keep them free of browser APIs so this stays true.

### 2.4 Required project structure

```
src/
  domain/          pure TS. no React, no browser APIs. fully unit tested.
    types.ts
    program.ts     workout templates, A/B alternation
    progression.ts weight increase, failure, deload
    plates.ts      plate math
    warmup.ts      warmup set generation
    prs.ts         personal record derivation
  data/
    db.ts          Dexie schema and migrations
    repository.ts  the only module allowed to touch db.ts
    export.ts      JSON export and import
  state/
    useAppStore.ts
    useTimer.ts
  features/
    workout/
    history/
    progress/
    exercises/
    settings/
  components/      shared presentational components
  design/
    tokens.css
```

**Hard rule.** `src/domain/` imports nothing from `src/data/`, `src/state/`, `src/features/`, or `src/components/`. It imports no browser globals. This is what makes the rules testable and portable.

---

## 3. Program definition

### 3.1 The two workouts

| Workout A | Workout B |
|---|---|
| Squat (Volume) 12/10/8/8 | Squat 5x5 |
| Bench Press 5x5 | Overhead Press 5x5 |
| Barbell Row 5x5 | Deadlift 1x5 |

Exercise order within a session is fixed and is the order shown above. Legs, then push, then pull.

Workout A squats for volume rather than load: four work sets of 12, 10, 8, 8 reps, all lighter than the heavy squat. Workout B keeps the heavy 5x5. The two are **separate exercises** with separate ids, separate weights, and separate progression tracks — `core-squat-volume` and `core-squat`. Missing reps on one never touches the other, exactly as Bench and Squat never affect each other.

The volume squat's work sets are **not all at the same weight**. The load ramps up as the reps come down: 85, 90, 95, then 100 percent of the exercise's tracked weight, one step per set.

| Set | Reps | Load |
|---|---|---|
| 1 | 12 | 85% |
| 2 | 10 | 90% |
| 3 | 8 | 95% |
| 4 | 8 | 100% |

The tracked weight — `ExerciseState.currentWeight`, the number progression increments and deloads — is the **top** set, the last one. Every fraction is therefore at or below 1, and the heaviest set of the session is the number the user sees on the Today screen. Anchoring at the top rather than the bottom is what keeps progression, personal records, and the weight chart reading the same quantity they read for a flat 5x5.

Each set's weight is `topWeight * fraction`, rounded **down** to a loadable weight by section 5.5 and never below the bar. Rounding is per set and independent, so two adjacent sets may land on the same weight when the load is light relative to the plate steps — at 50 lb on a 45 lb bar the first three sets are all at the bar. This is correct and preferred over nudging a set upward to keep the ramp visually distinct: the prescription stays honest, and the gaps open up on their own as the weight climbs. At the bar itself the ramp collapses to a flat load, because there is nowhere lighter to go.

The volume squat is the only exercise that ramps. Every other lift, core or custom, puts all of its work sets at one weight.

### 3.2 Alternation

The next workout type is determined by the **last completed workout**, never by the calendar date.

```
nextWorkoutType = lastCompletedWorkoutType === 'A' ? 'B' : 'A'
```

If no workout has ever been completed, the next workout is A.

This produces A B A in week one and B A B in week two when training three times a week, and it stays correct when a session is skipped, which a date-driven rule would not.

### 3.3 Schedule

The app does not enforce or require a schedule. It shows what is next and lets the user start it any day. Settings may hold a set of preferred training days used only for the optional reminder notification and the streak display.

### 3.4 Set and rep prescription

| Exercise | Sets | Reps per set |
|---|---|---|
| Squat (Workout B) | 5 | 5 |
| Squat (Volume) (Workout A) | 4 | 12, 10, 8, 8 |
| Bench Press | 5 | 5 |
| Overhead Press | 5 | 5 |
| Barbell Row | 5 | 5 |
| Deadlift | 1 | 5 |

Deadlift is one work set of five reps after warmups, not five sets. This is deliberate and must not be "corrected" during implementation.

The volume squat is the only lift whose work sets differ from each other, in reps or in weight. An exercise carries two optional per-set lists for this, both one entry per work set in set order:

- `repScheme` — the rep target of each set. When absent, every work set targets `defaultReps`.
- `loadScheme` — each set's weight as a fraction of the tracked weight. When absent, every work set is at the tracked weight.

Success still means every work set hit **its own** target — ten reps clears the second set of a 12/10/8/8 but fails the first. Weight plays no part in the success test: a set is judged only against its own rep target, at whatever weight it was prescribed.

The two lists must be the same length as each other and as the work set list. A `loadScheme` whose length does not match is ignored and the exercise loads flat, so editing a rep prescription to a different number of sets can never silently apply the old ramp to the wrong sets.

---

## 4. Data model

All weights are stored as a number in the user's configured unit. Store the unit once in settings and do not mix units in stored records.

```ts
type Unit = 'lb' | 'kg';
type WorkoutType = 'A' | 'B';

type ExerciseKind =
  | 'barbell'      // weight + reps, plate math applies
  | 'dumbbell'     // weight + reps, weight is per dumbbell
  | 'bodyweight'   // reps only, optional added weight
  | 'machine'      // weight + reps, no plate math
  | 'timed'        // duration in seconds
  | 'distance';    // distance + duration

type ProgressionScheme =
  | 'linear'       // +increment on success, deload after N failures
  | 'manual'       // user sets the weight each time
  | 'none';        // no weight tracked

interface Exercise {
  id: string;
  name: string;
  kind: ExerciseKind;
  isCore: boolean;             // true for the five program lifts. core lifts cannot be deleted.
  defaultSets: number;
  defaultReps: number;
  repScheme: number[] | null;  // per-set rep targets when sets differ, e.g. [12,10,8,8].
                               // null means every work set targets defaultReps.
                               // when present, its length wins over defaultSets.
  loadScheme: number[] | null; // per-set weight as a fraction of the tracked weight,
                               // e.g. [0.85,0.9,0.95,1]. null means every work set is
                               // at the tracked weight. the last entry is 1: the tracked
                               // weight is the top set. length must match the work sets.
  increment: number;           // weight added on a successful session
  progression: ProgressionScheme;
  startingWeight: number;
  barWeight: number | null;    // null for non-barbell kinds
  failuresBeforeDeload: number; // default 3
  deloadPercent: number;        // default 0.10
  archived: boolean;
  createdAt: number;
}

interface ExerciseState {
  exerciseId: string;
  currentWeight: number;       // the weight prescribed for the next session. under a
                               // loadScheme this is the top set; lighter sets derive from it.
  consecutiveFailures: number; // failed attempts at currentWeight
  updatedAt: number;
}

interface SetLog {
  setIndex: number;            // 0-based
  targetReps: number;
  completedReps: number | null;// null means not yet logged
  weight: number;
  isWarmup: boolean;
  loggedAt: number | null;
}

interface ExerciseLog {
  exerciseId: string;
  order: number;
  prescribedWeight: number;
  sets: SetLog[];
  succeeded: boolean | null;   // computed on session completion
  note: string | null;
}

interface Workout {
  id: string;
  type: WorkoutType | 'custom';
  startedAt: number;
  completedAt: number | null;  // null means in progress or abandoned
  exercises: ExerciseLog[];
  bodyweight: number | null;
  note: string | null;
}

interface Settings {
  unit: Unit;
  barWeight: number;                  // default 45 lb / 20 kg
  availablePlates: number[];          // descending. default lb: [45,35,25,10,5,2.5]
  restSeconds: number;                // default 90
  restSecondsAfterFailedSet: number;  // default 180
  restSecondsWarmup: number;          // default 60
  restTimerEnabled: boolean;          // default true
  soundEnabled: boolean;
  vibrationEnabled: boolean;
  notificationsEnabled: boolean;
  keepScreenAwake: boolean;           // default true
  showWarmupSets: boolean;            // default true
  preferredTrainingDays: number[];    // 0 = Sunday
}
```

### 4.1 Storage

Dexie tables: `exercises`, `exerciseStates`, `workouts`, `settings`.

There is exactly one in-progress workout at a time. If one exists on app launch, the app resumes it and says so.

---

## 5. Progression engine

This is the core of the app. It lives in `src/domain/progression.ts` and must be covered by unit tests before any UI is built.

### 5.1 Success test

A work set succeeds when `completedReps >= targetReps`.
An exercise succeeds in a session when **every work set** succeeded. Warmup sets are excluded from this test entirely.

### 5.2 On workout completion

For each exercise in the completed workout, independently:

```
if (exercise.succeeded) {
  state.currentWeight += exercise.increment
  state.consecutiveFailures = 0
} else {
  state.consecutiveFailures += 1
  // weight is unchanged. the user repeats it next time.
  if (state.consecutiveFailures >= exercise.failuresBeforeDeload) {
    state.currentWeight = roundDownToLoadable(
      state.currentWeight * (1 - exercise.deloadPercent)
    )
    state.consecutiveFailures = 0
    recordDeloadEvent(exercise.id, previousWeight, newWeight)
  }
}
```

**Exercises progress independently.** Failing Overhead Press has no effect on Squat. This must be true in the code and visible in the UI.

### 5.3 Default increments

| Exercise | lb | kg |
|---|---|---|
| Squat | 5 | 2.5 |
| Squat (Volume) | 5 | 2.5 |
| Bench Press | 5 | 2.5 |
| Overhead Press | 5 | 2.5 |
| Barbell Row | 5 | 2.5 |
| Deadlift | 10 | 5 |

Every increment is editable per exercise in settings, down to the microloading values the plate inventory allows.

### 5.4 Default starting weights (lb)

| Exercise | New lifter | Some experience |
|---|---|---|
| Squat | 45 | 95 to 135 |
| Squat (Volume) | 45 | 65 percent of the squat |
| Bench Press | 45 | 95 to 135 |
| Overhead Press | 45 | 65 to 95 |
| Barbell Row | 65 | 95 to 135 |
| Deadlift | 95 | 135 to 185 |

Onboarding asks which of the two columns applies and seeds accordingly, then lets the user edit every value on one screen before finishing.

The volume squat seeds at 65 percent of the heavy squat, rounded down to a loadable weight, and follows the squat field on the onboarding screen until the user edits it directly. That derivation happens once. After the first session the two squats progress independently and the volume squat is never recomputed from the heavy one. The seeded number is the volume squat's **top** set; its first three sets come in under it per section 3.1.

An account seeded before Workout A moved to the volume squat gains the exercise on next load, seeded the same way from the heavy squat's **current** weight rather than from the bar.

An account that already has a volume squat from before the load ramp existed has a row with no `loadScheme`, and gains one on next load. Its tracked weight is unchanged by that: a flat prescription at weight W already means W was the heaviest set, so the top set stays exactly where it was and only the lighter sets underneath appear. A volume squat whose rep prescription has been edited to some other number of sets is left flat, since the stock four-entry ramp would not line up with it.

### 5.5 Loadable weight rounding

```
minimumStep = 2 * min(settings.availablePlates)
roundDownToLoadable(w) = max(
  barWeight,
  barWeight + floor((w - barWeight) / minimumStep) * minimumStep
)
```

With default lb plates the smallest plate is 2.5, so the minimum step is 5 and every prescribed weight is the bar plus a multiple of 5. Adding 1.25 lb fractional plates to the inventory makes 2.5 lb steps loadable automatically.

### 5.6 Deload worked example

Bench Press at 185, increment 5, three failures allowed, 10 percent deload.

| Session | Result | Stored weight after | Failures after |
|---|---|---|---|
| 1 | 5/5/5/3/3 fail | 185 | 1 |
| 2 | 5/5/5/4/4 fail | 185 | 2 |
| 3 | 5/5/4/4/3 fail | 185 → 165 | 0 |
| 4 | 5/5/5/5/5 pass | 170 | 0 |

185 x 0.9 = 166.5, rounded down to the nearest loadable 5 is 165.

---

## 6. Plate calculator

`src/domain/plates.ts`

```
perSide = (targetWeight - barWeight) / 2
```

Greedy descending fill from `settings.availablePlates`, allowing repeats.

Return an ordered array of plate weights for one side, heaviest first, plus a `remainder` value. A non-zero remainder means the weight is not loadable with the current inventory. The UI must show the remainder as a warning rather than silently rounding.

Edge cases to handle:
- `targetWeight === barWeight` returns an empty array and no warning
- `targetWeight < barWeight` is invalid input, clamp to bar weight
- Non-barbell exercise kinds skip plate math entirely

---

## 7. Warmup sets

`src/domain/warmup.ts`. Deterministic, no randomness.

Warmup sets are always optional to log. They never affect progression. They are shown collapsed by default under each exercise with a "Warm up" toggle.

Rules:

1. Let `W` be the work weight, `B` the bar weight, `F` the exercise floor (45 lb for squat, bench, and press; 95 lb for deadlift; 65 lb for row). Under a `loadScheme`, `W` is the **first** work set's weight, not the top set's — warmups lead into the set the lifter is about to do, and the rest of the ramp is itself the ramp up to the top. Warming the volume squat all the way to 100 percent would overshoot a first set prescribed at 85.
2. If `W <= F + minimumStep`, prescribe two sets of five at `F` and stop.
3. Otherwise prescribe, in order:
   - 2 sets of 5 at `F`
   - 1 set of 5 at `roundDownToLoadable(F + 0.4 * (W - F))`
   - 1 set of 3 at `roundDownToLoadable(F + 0.6 * (W - F))`
   - 1 set of 2 at `roundDownToLoadable(F + 0.8 * (W - F))`
4. Remove any generated set whose weight is not strictly greater than the previous set's weight.
5. Rest between warmup sets defaults to `restSecondsWarmup` and the timer may be skipped freely.

---

## 8. Rest timer

This is the requirement most likely to be implemented badly. Read this section carefully.

### 8.1 Behavior

- The timer starts **automatically** the moment a work set is logged. No button press.
- Default duration is 90 seconds, from `settings.restSeconds`.
- If the set just logged was a failure (`completedReps < targetReps`), the timer uses `settings.restSecondsAfterFailedSet`, default 180 seconds. This is intentional. Longer rest after a hard set produces more reps on the next one.
- Warmup sets use `settings.restSecondsWarmup`, default 60 seconds.
- The timer does not start after the final set of the final exercise in the session.
- Changing the reps on an already-logged set restarts the timer with the duration appropriate to the new value.

### 8.2 Controls

A persistent timer bar pinned above the bottom navigation while a timer is running:

- Large monospace countdown, `M:SS`
- A depleting progress ring or bar
- `+30s` and `-30s`
- `Skip`
- Tapping the countdown itself resets it to the full duration

### 8.3 Correctness under backgrounding

**Do not count down with a `setInterval` counter.** Mobile browsers throttle and suspend timers when the screen locks and the value will drift or freeze.

Required implementation:

1. On start, compute and store `endsAt = Date.now() + durationMs` in state and in `sessionStorage`.
2. A `requestAnimationFrame` or 250 ms interval loop recomputes `remaining = endsAt - Date.now()` on every tick. The loop is only a repaint trigger. It never accumulates.
3. On `visibilitychange` to visible, and on `pageshow`, recompute immediately from `endsAt`. If `remaining <= 0` while backgrounded, fire the completion state on return.
4. On app launch, if `sessionStorage` holds an `endsAt` in the future, resume the timer.

### 8.4 Alerting when the phone is not in hand

Layer three mechanisms. Each degrades independently.

1. **Notification.** If permission is granted, schedule a local notification for `endsAt` through the service worker. This is the only mechanism that reliably fires with the screen locked.
2. **Sound.** Web Audio API. Generate the tone in code rather than loading an audio file so the first play has no fetch latency. Two short tones, roughly 880 Hz then 1320 Hz, 150 ms each. Unlock the AudioContext on the first user gesture of the session, which is the "Start workout" tap.
3. **Vibration.** `navigator.vibrate([200, 100, 200])` where supported. Not supported on iOS Safari. Do not rely on it.

**Known constraint to document in the README.** iOS suspends JavaScript in a backgrounded PWA. Notification scheduling through the service worker is the mitigation. Test this on the actual target device early in development, in phase 2, not at the end.

### 8.5 Screen wake lock

While a workout is in progress and `settings.keepScreenAwake` is true, hold a `navigator.wakeLock.request('screen')`. Reacquire it on `visibilitychange` to visible, because the lock is released automatically when the page is hidden. Release it when the workout is completed or abandoned.

---

## 9. Screens and functional requirements

### 9.1 Home

- Card showing the next workout: the letter A or B, the three exercises, and the prescribed weight for each
- Primary action: `Start workout`
- If a workout is in progress: `Resume workout` instead, with the elapsed time
- If the last completed workout still has work on it — an exercise skipped, never logged, or only partly logged — and it finished within the last 48 hours: an `Unfinished` card above the next workout naming what was left, with `Resume workout <type>`. See 9.8.
- Last three sessions in a compact list with date, type, and a pass or fail dot per exercise
- Current streak or "last trained N days ago"

### 9.2 Workout (the screen that matters)

One exercise visible at a time, in program order. The user advances by tapping the next exercise or by completing all sets, which auto-advances after a short delay.

Per exercise:

- Exercise name
- Prescribed weight, large
- Plate breakdown for one side, tappable to open a full plate diagram
- Collapsed warmup section
- The set row: five circles for 5x5 lifts, one for deadlift

**Set circle interaction.** This is the primary interaction of the entire app.

| Action | Result |
|---|---|
| Tap an unlogged circle | Logs the target reps (5). Circle fills. Timer starts. |
| Tap a logged circle | Decrements reps by one: 5 → 4 → 3 → 2 → 1 → 0 |
| Tap at 0 | Returns to unlogged. Timer cancels if it was started by this set. |
| Long press | Opens a numeric keypad for direct entry |

A circle showing fewer than the target reps displays the number inside it and renders in the failure color.

Also on this screen:
- Per-exercise note field, collapsed
- `Add exercise` button at the bottom of the session to append any library exercise as extra work
- `Finish workout` button, enabled once at least one set is logged
- `Discard workout`, behind a confirmation

### 9.3 Workout complete

- Summary per exercise: weight, reps achieved, pass or fail
- **What changes next time**, stated explicitly per exercise. For example "Squat 185 → 190" or "Bench 185 stays. Attempt 2 of 3." or "Overhead Press deloaded 105 → 95."
- Any new personal records
- Optional bodyweight entry and session note

### 9.4 History

- Reverse chronological list of completed workouts
- Each row: date, type, duration, one dot per exercise colored by pass or fail
- Tapping a row opens the full set-by-set detail, editable
- Editing a past workout re-runs the progression engine forward from that workout to recompute current state. Warn the user before applying.
- The most recent completed workout offers `Resume workout`, behind a confirmation. See 9.8.

### 9.5 Progress

- Exercise picker
- Line chart of work-set weight over time, with deload events marked
- Estimated 1RM overlay, toggleable. Use Epley: `1RM = w * (1 + reps / 30)`.
- Stats: current weight, all-time best 5x5, total sessions, total volume, longest streak
- A second chart of session volume, summed per set as `completedReps * that set's weight`, over time

Where a session's work sets are not all at one weight, "the weight" of that session is its **heaviest** work set, and the reps paired with it in the Epley estimate are that set's own rep target. Ties in weight break toward the higher rep target, which is the harder set. This is what the weight line, the 1RM overlay, and personal records all read.

The pairing matters under a load ramp and is invisible without one. A volume squat session topping out at 200 for eight is a record of 200 at eight reps — not 200 at twelve, which is the first set's rep target at a weight that was never lifted for twelve. Session volume is likewise summed set by set at each set's own weight; multiplying every rep by the top weight would overstate it.

### 9.6 Exercises

- Library of all exercises, core lifts first, then custom
- `New exercise` form: name, kind, sets, reps, starting weight, increment, progression scheme
- Assignment: attach a custom exercise to Workout A, Workout B, both, or leave it unattached for ad hoc use
- Attached custom exercises appear at the end of that workout, after the core lifts
- Core lifts can be edited but not deleted. Custom exercises can be archived, which hides them without destroying history.

### 9.7 Settings

Everything in the `Settings` interface, grouped:
- Units and bar weight
- Plate inventory, as toggleable chips per plate size with a quantity field
- Rest timer: durations, sound, vibration, notifications
- Display: keep screen awake, show warmup sets
- Data: export JSON, import JSON, reset all data behind a typed confirmation

### 9.8 Resuming a finished workout

A session gets finished with work still on it: an exercise skipped, or simply never logged before the finish button. The user comes back the next day to do that exercise. It belongs to that session, not to a new one.

- Only the most recent completed workout can be reopened, and only while no other workout is in progress. The rollback below replays the rest of history, which lands on the state that session started from only when it is the newest one.
- Reopening sets `completedAt` back to null and re-runs the progression engine over the remaining completed history. Every increment, failure count, and deload that session produced is undone, including a failure recorded against an exercise that was never actually attempted.
- The session keeps its original completion time. Finishing it again restores that timestamp, so it holds its place in history and in the chronological replay rather than moving to today. Its recorded duration is unchanged.
- The workout screen opens on the first exercise with work left, including a skipped one, and states that the session was resumed and which date it will keep.
- Finishing again applies progression from what was actually logged. Finishing with nothing added leaves state exactly as it was before reopening.
- Discarding a reopened session deletes the whole session, including the sets logged the first time. The confirmation must say so.

---

## 10. Custom exercise tracking

Requirement 7 from the brief. A custom exercise must support every field in the `Exercise` interface and must flow through the same progression engine when its scheme is `linear`.

Kinds and what gets logged:

| Kind | Logged per set |
|---|---|
| barbell | weight, reps. Plate math shown. |
| dumbbell | weight per dumbbell, reps |
| bodyweight | reps, optional added weight |
| machine | weight, reps. No plate math. |
| timed | seconds |
| distance | distance and seconds |

Charts adapt: weight-based kinds chart weight, `timed` charts duration, `bodyweight` charts total reps.

---

## 11. Data portability

- **Export.** A single JSON file containing every table plus a `schemaVersion`. Filename `5x5-backup-YYYY-MM-DD.json`. Trigger a download.
- **Import.** File picker, validate `schemaVersion`, show a summary of what will be imported, then replace or merge behind an explicit choice.
- Prompt the user to export if more than 30 days have passed since the last export.

There is no server. The export file is the only backup. Make this obvious in settings.

---

## 12. Edge cases to handle explicitly

| Case | Required behavior |
|---|---|
| App closed mid-workout | Resume the in-progress workout on next launch, with sets preserved |
| Workout finished with an exercise skipped or never logged | Offer to reopen that session, roll progression back to before it, and let the missing work be logged against it. Section 9.8. |
| Timer running when app closed | Recompute from `endsAt` on launch. If elapsed, show the completed state. |
| First ever launch | Onboarding flow, then home shows Workout A |
| User logs zero reps on every set | Exercise fails. Failure counter increments. Normal path. |
| Weight not loadable with current plates | Show the remainder as a warning on the plate diagram. Do not auto-adjust the prescribed weight. |
| Deload would drop below bar weight | Clamp to bar weight |
| User deletes a workout from history | Re-run progression forward from that point. Warn first. |
| Two devices | Not supported. Import overwrites. State this in settings. |
| Notification permission denied | Timer still works visually and audibly when the app is open. Show a one-time hint. |
| Unit switched after data exists | Convert all stored weights and plate inventory, round to loadable, and warn that historical values are converted not re-measured |

---

## 13. Acceptance criteria

The build is done when every one of these passes on a physical phone.

**Progression**
1. Complete Workout A with all sets at target. Next Workout A shows every weight increased by its increment.
2. Fail Bench, pass Squat and Row. Next session: Bench unchanged, Squat and Row increased.
3. Fail the same Bench weight three sessions running. The fourth prescribes 10 percent less, rounded down to loadable, and the failure counter is zero.
4. Complete A. Home shows B next. Complete B. Home shows A next. Skip a week. Home still shows A.

**Timer**
5. Log a set. Timer starts at 90 seconds without any further input.
6. Log a set at 3 reps. Timer starts at 180 seconds.
7. Start a timer, lock the phone, wait past expiry, unlock. The app shows the timer as complete, not as a frozen countdown.
8. With notifications granted, a notification fires at expiry with the screen locked.

**Logging**
9. Five taps on the first circle produce 5, 4, 3, 2, 1, then 0, then unlogged.
10. Long press opens numeric entry and the entered value persists.

**Custom exercises**
11. Create a `bodyweight` exercise, attach it to Workout B, and it appears after Deadlift in the next B session.
12. Create a `barbell` exercise with linear progression, complete it, and its weight increases by its own increment.

**Data**
13. Export, wipe all data, import. Every workout and every current weight is restored exactly.
14. Airplane mode. The app launches and functions completely.

---

## 14. Suggested build order

Each phase ends with something runnable. Do not proceed until the current phase's tests pass.

**Phase 1: domain layer, no UI**
Types, program templates, A/B alternation, progression, plate math, warmup generation. Full Vitest coverage including every worked example and edge case in this document. This is the only phase with no visible output and it is the most important one.

**Phase 2: skeleton and the timer**
Vite plus React plus Tailwind plus PWA manifest. Dexie schema. A crude workout screen with set circles and a working rest timer. **Install to a real phone home screen and validate the backgrounded timer and the lock-screen notification now.** If this does not work, the architecture needs to change and it is cheap to change here.

**Phase 3: the core loop**
Onboarding, home, workout screen with plate display and warmups, workout complete summary, persistence of completed sessions, progression applied on completion.

**Phase 4: history and progress**
History list and detail, editing past workouts with forward recomputation, progress charts, PR derivation.

**Phase 5: custom exercises**
Exercise library, creation form, workout assignment, non-barbell kinds, kind-aware charts.

**Phase 6: polish**
Full design spec application, settings screen, export and import, wake lock, empty states, accessibility pass, reduced-motion support.

---

## 15. Program facts reference

Sourced from stronglifts.com so the implementation does not drift.

- 5x5 means five sets of five reps at the same weight. Straight sets, not ramping.
- Deadlift is 1x5, one heavy set of five after ramped warmups, because a session already contains heavy squats and pressing.
- Exercise order: legs, push, pull.
- Rest between sets: roughly 1 to 2 minutes when easy, 3 minutes for most work sets, 5 minutes after a hard set. The app's 90 second default is the starting point and the user raises it as weights climb.
- Add weight on an exercise only when all five reps were completed on all sets of that exercise, with full range of motion.
- Failing an exercise means repeating the weight next session, not deloading immediately.
- Deload 10 percent after three failed attempts at the same weight.
- Progress rates differ across lifts. Squat and Deadlift climb faster than Bench, Press, and Row. Never hold one lift back to keep it in line with another.
- Squat appears in every session. That frequency is the engine of the program. This build keeps the frequency but splits the intensity: Workout B squats heavy for 5x5, Workout A squats lighter for 12/10/8/8. That is a deliberate departure from stock StrongLifts, where both sessions squat 5x5.
