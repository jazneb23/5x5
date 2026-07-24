import { useEffect } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { useAppStore } from './state/useAppStore';
import { useTimerEngine, useTimerStore, resumeTimerFromStorage } from './state/useTimer';
import { BottomNav } from './components/BottomNav';
import { RestTimerBar } from './components/RestTimerBar';
import { Onboarding } from './features/onboarding/Onboarding';
import { TodayScreen } from './features/workout/TodayScreen';
import { WorkoutScreen } from './features/workout/WorkoutScreen';
import { WorkoutCompleteScreen } from './features/workout/WorkoutCompleteScreen';
import { HistoryListScreen } from './features/history/HistoryListScreen';
import { HistoryDetailScreen } from './features/history/HistoryDetailScreen';
import { ProgressScreen } from './features/progress/ProgressScreen';
import { ExercisesScreen } from './features/exercises/ExercisesScreen';
import { ExerciseFormScreen } from './features/exercises/ExerciseFormScreen';
import { SettingsScreen } from './features/settings/SettingsScreen';

function App() {
  const initialized = useAppStore((s) => s.initialized);
  const onboardingComplete = useAppStore((s) => s.settings.onboardingComplete);
  const restTimerEnabled = useAppStore((s) => s.settings.restTimerEnabled);
  const notificationsEnabled = useAppStore((s) => s.settings.notificationsEnabled);
  const init = useAppStore((s) => s.init);
  const timerVisible = useTimerStore((s) => s.endsAt != null) && restTimerEnabled;

  useEffect(() => {
    void init();
    resumeTimerFromStorage();
  }, [init]);

  useTimerEngine();

  if (!initialized) {
    return <div className="flex min-h-screen items-center justify-center bg-iron-950 text-chalk-500">Loading…</div>;
  }

  if (!onboardingComplete) {
    return <Onboarding />;
  }

  return (
    <HashRouter>
      <div
        className="min-h-screen bg-iron-950"
        style={{
          paddingTop: 'env(safe-area-inset-top)',
          paddingBottom: timerVisible ? 'calc(var(--nav-total-height) + var(--timer-bar-height))' : 'var(--nav-total-height)',
        }}
      >
        <Routes>
          <Route path="/" element={<TodayScreen />} />
          <Route path="/workout" element={<WorkoutScreen />} />
          <Route path="/workout/complete" element={<WorkoutCompleteScreen />} />
          <Route path="/history" element={<HistoryListScreen />} />
          <Route path="/history/:id" element={<HistoryDetailScreen />} />
          <Route path="/progress" element={<ProgressScreen />} />
          <Route path="/exercises" element={<ExercisesScreen />} />
          <Route path="/exercises/new" element={<ExerciseFormScreen />} />
          <Route path="/exercises/:id" element={<ExerciseFormScreen />} />
          <Route path="/settings" element={<SettingsScreen />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        <RestTimerBar restTimerEnabled={restTimerEnabled} notificationsEnabled={notificationsEnabled} />
        <BottomNav />
      </div>
    </HashRouter>
  );
}

export default App;
