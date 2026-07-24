import { useRef, useState, type ReactNode } from 'react';
import { useAppStore } from '../../state/useAppStore';
import { ScreenHeader } from '../../components/ScreenHeader';
import { Button } from '../../components/Button';
import { ConfirmSheet } from '../../components/ConfirmSheet';
import { downloadBackup, parseBackupFile, applyImport, ImportSchemaMismatchError } from '../../data/export';
import { resetAllData } from '../../data/repository';
import { requestNotificationPermission } from '../../state/timerEffects';

const STANDARD_PLATES_LB = [45, 35, 25, 10, 5, 2.5, 1.25];
const STANDARD_PLATES_KG = [25, 20, 15, 10, 5, 2.5, 1.25];

export function SettingsScreen() {
  const settings = useAppStore((s) => s.settings);
  const updateSettings = useAppStore((s) => s.updateSettings);
  const switchUnit = useAppStore((s) => s.switchUnit);
  const init = useAppStore((s) => s.init);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [confirmReset, setConfirmReset] = useState(false);
  const [resetText, setResetText] = useState('');
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const [pendingUnit, setPendingUnit] = useState<'lb' | 'kg' | null>(null);

  const standardPlates = settings.unit === 'lb' ? STANDARD_PLATES_LB : STANDARD_PLATES_KG;

  function togglePlate(p: number) {
    const has = settings.availablePlates.includes(p);
    const next = has ? settings.availablePlates.filter((x) => x !== p) : [...settings.availablePlates, p].sort((a, b) => b - a);
    void updateSettings({ availablePlates: next });
  }

  async function handleExport() {
    await downloadBackup(Date.now());
    await updateSettings({ lastExportAt: Date.now() });
  }

  async function handleImportFile(file: File) {
    try {
      const data = await parseBackupFile(file);
      await applyImport(data);
      setImportMessage('Import complete.');
      await init();
    } catch (err) {
      if (err instanceof ImportSchemaMismatchError) setImportMessage(err.message);
      else setImportMessage('That file could not be read.');
    }
  }

  async function handleReset() {
    await resetAllData();
    setConfirmReset(false);
    window.location.reload();
  }

  async function handleNotificationsToggle(enabled: boolean) {
    if (enabled) {
      const permission = await requestNotificationPermission();
      await updateSettings({ notificationsEnabled: permission === 'granted' });
    } else {
      await updateSettings({ notificationsEnabled: false });
    }
  }

  return (
    <div>
      <ScreenHeader title="Settings" showBack />
      <div className="space-y-8 px-5 pb-10">
        <Section title="Units">
          <div className="grid grid-cols-2 gap-3">
            {(['lb', 'kg'] as const).map((u) => (
              <button
                key={u}
                type="button"
                onClick={() => (u === settings.unit ? undefined : setPendingUnit(u))}
                className={`h-12 rounded-sm border text-body uppercase ${
                  settings.unit === u ? 'border-signal text-chalk-100' : 'border-iron-700 text-chalk-500'
                }`}
              >
                {u}
              </button>
            ))}
          </div>
          <Row label="Bar weight">
            <input
              type="number"
              value={settings.barWeight}
              onChange={(e) => updateSettings({ barWeight: Number(e.target.value) })}
              className="w-24 rounded-sm border border-iron-700 bg-transparent px-2 py-2 text-right font-mono text-data text-chalk-100"
            />
          </Row>
        </Section>

        <Section title="Plate inventory">
          <div className="flex flex-wrap gap-2">
            {standardPlates.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => togglePlate(p)}
                className={`rounded-pill border px-3 py-1.5 text-data ${
                  settings.availablePlates.includes(p) ? 'border-signal text-chalk-100' : 'border-iron-700 text-chalk-500'
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        </Section>

        <Section title="Rest timer">
          <Row label="Rest timer enabled">
            <Toggle checked={settings.restTimerEnabled} onChange={(v) => updateSettings({ restTimerEnabled: v })} />
          </Row>
          <Row label="Rest (seconds)">
            <NumberInput value={settings.restSeconds} onChange={(v) => updateSettings({ restSeconds: v })} />
          </Row>
          <Row label="Rest after failed set">
            <NumberInput value={settings.restSecondsAfterFailedSet} onChange={(v) => updateSettings({ restSecondsAfterFailedSet: v })} />
          </Row>
          <Row label="Rest after warmup">
            <NumberInput value={settings.restSecondsWarmup} onChange={(v) => updateSettings({ restSecondsWarmup: v })} />
          </Row>
          <Row label="Sound">
            <Toggle checked={settings.soundEnabled} onChange={(v) => updateSettings({ soundEnabled: v })} />
          </Row>
          <Row label="Vibration">
            <Toggle checked={settings.vibrationEnabled} onChange={(v) => updateSettings({ vibrationEnabled: v })} />
          </Row>
          <Row label="Notifications">
            <Toggle checked={settings.notificationsEnabled} onChange={handleNotificationsToggle} />
          </Row>
        </Section>

        <Section title="Display">
          <Row label="Keep screen awake">
            <Toggle checked={settings.keepScreenAwake} onChange={(v) => updateSettings({ keepScreenAwake: v })} />
          </Row>
          <Row label="Show warmup sets">
            <Toggle checked={settings.showWarmupSets} onChange={(v) => updateSettings({ showWarmupSets: v })} />
          </Row>
        </Section>

        <Section title="Data">
          <p className="mb-3 text-data text-chalk-500">
            There is no server. This export file is your only backup.
            {settings.lastExportAt ? ` Last exported ${new Date(settings.lastExportAt).toLocaleDateString()}.` : ' You have not exported yet.'}
          </p>
          <div className="space-y-3">
            <Button variant="secondary" onClick={handleExport}>
              Export JSON
            </Button>
            <Button variant="secondary" onClick={() => fileInputRef.current?.click()}>
              Import JSON
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleImportFile(file);
                e.target.value = '';
              }}
            />
            {importMessage && <p className="text-data text-chalk-300">{importMessage}</p>}
            <Button variant="destructive" onClick={() => setConfirmReset(true)}>
              Reset all data
            </Button>
          </div>
          <p className="mt-3 text-data text-chalk-500">Two devices are not supported. Importing overwrites everything on this device.</p>
        </Section>
      </div>

      <ConfirmSheet
        open={confirmReset}
        title="Reset all data?"
        confirmLabel="Reset everything"
        confirmDisabled={resetText !== 'RESET'}
        destructive
        onConfirm={() => {
          if (resetText === 'RESET') void handleReset();
        }}
        onCancel={() => {
          setConfirmReset(false);
          setResetText('');
        }}
      >
        <p className="mb-3 text-body text-chalk-300">
          This permanently deletes every workout, exercise, and setting on this device. Type RESET to confirm.
        </p>
        <input
          value={resetText}
          onChange={(e) => setResetText(e.target.value)}
          className="mb-4 w-full rounded-sm border border-iron-700 bg-transparent px-3 py-2 text-body text-chalk-100"
          placeholder="RESET"
        />
      </ConfirmSheet>

      <ConfirmSheet
        open={pendingUnit != null}
        title={`Switch to ${pendingUnit?.toUpperCase()}?`}
        body="Every stored weight, including history, is converted to the new unit and rounded to an ordinary loadable value. Historical values become converted numbers, not re-measurements. This cannot be undone."
        confirmLabel="Convert and switch"
        destructive={false}
        onConfirm={() => {
          if (pendingUnit) void switchUnit(pendingUnit);
          setPendingUnit(null);
        }}
        onCancel={() => setPendingUnit(null)}
      />
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="mb-3 text-label uppercase tracking-[0.12em] text-chalk-500">{title}</h2>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between border-b border-iron-800 py-2">
      <span className="text-body text-chalk-100">{label}</span>
      {children}
    </div>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`h-7 w-12 rounded-pill transition-colors ${checked ? 'bg-signal' : 'bg-iron-700'}`}
    >
      <span className={`block h-5 w-5 rounded-full bg-chalk-100 transition-transform ${checked ? 'translate-x-6' : 'translate-x-1'}`} />
    </button>
  );
}

function NumberInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <input
      type="number"
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className="w-20 rounded-sm border border-iron-700 bg-transparent px-2 py-2 text-right font-mono text-data text-chalk-100"
    />
  );
}
