// Section 8.4: three independent alerting mechanisms. Each degrades on its own.

let audioContext: AudioContext | null = null;

/** Call on the first user gesture of the session ("Start workout" tap). */
export function unlockAudioContext(): void {
  if (audioContext) return;
  const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return;
  audioContext = new Ctor();
  if (audioContext.state === 'suspended') void audioContext.resume();
}

function playTone(frequency: number, startTime: number, durationSeconds: number, ctx: AudioContext) {
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  oscillator.frequency.value = frequency;
  oscillator.type = 'sine';
  gain.gain.setValueAtTime(0.0001, startTime);
  gain.gain.exponentialRampToValueAtTime(0.35, startTime + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + durationSeconds);
  oscillator.connect(gain);
  gain.connect(ctx.destination);
  oscillator.start(startTime);
  oscillator.stop(startTime + durationSeconds);
}

/** Two short tones, ~880Hz then ~1320Hz, 150ms each. Section 8.4. */
export function playCompletionTone(): void {
  if (!audioContext) return;
  if (audioContext.state === 'suspended') void audioContext.resume();
  const now = audioContext.currentTime;
  playTone(880, now, 0.15, audioContext);
  playTone(1320, now + 0.16, 0.15, audioContext);
}

export function vibrateComplete(): void {
  if ('vibrate' in navigator) navigator.vibrate([200, 100, 200]);
}

export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!('Notification' in window)) return 'denied';
  if (Notification.permission !== 'default') return Notification.permission;
  return Notification.requestPermission();
}

let scheduledNotificationTimeout: ReturnType<typeof setTimeout> | null = null;

/**
 * Best-effort local notification scheduled via setTimeout + the service
 * worker's showNotification. This fires reliably while the page/SW process
 * stays alive (foreground, or briefly backgrounded on most platforms).
 *
 * Known constraint: iOS suspends JS in a backgrounded PWA, so this cannot
 * guarantee delivery with the screen locked on iOS Safari. There is no
 * server in this app to drive real push notifications; sound and vibration
 * are the mechanisms that work once the user returns to the app.
 */
export function scheduleCompletionNotification(endsAt: number, label: string): void {
  cancelScheduledNotification();
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  if (!('serviceWorker' in navigator)) return;

  const delay = Math.max(0, endsAt - Date.now());
  scheduledNotificationTimeout = setTimeout(() => {
    navigator.serviceWorker.ready
      .then((registration) =>
        registration.showNotification('5x5', {
          body: label,
          tag: '5x5-rest-timer',
          icon: '/icon-192.png',
          badge: '/icon-192.png',
        }),
      )
      .catch(() => undefined);
  }, delay);
}

export function cancelScheduledNotification(): void {
  if (scheduledNotificationTimeout != null) {
    clearTimeout(scheduledNotificationTimeout);
    scheduledNotificationTimeout = null;
  }
}
