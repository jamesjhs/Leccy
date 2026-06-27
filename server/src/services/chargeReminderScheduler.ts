import webpush from 'web-push';
import db, { getSetting } from '../db/database';

const DEFAULT_TIME_ZONE = 'Europe/London';
const CHECK_INTERVAL_MS = 60_000;

interface ReminderCandidate {
  user_id: number;
  push_reminder_time: string;
  push_time_zone: string | null;
  vehicle_id: number | null;
  started_at: string;
  last_notified_date: string | null;
}

interface PushSubscriptionRow {
  id: number;
  endpoint: string;
  keys_p256dh: string;
  keys_auth: string;
}

let schedulerStarted = false;

function getVapidSetting(key: 'VAPID_PUBLIC_KEY' | 'VAPID_PRIVATE_KEY' | 'VAPID_SUBJECT'): string {
  return getSetting(key) ?? process.env[key] ?? '';
}

export function isPushConfigured(): boolean {
  return Boolean(getVapidSetting('VAPID_PUBLIC_KEY') && getVapidSetting('VAPID_PRIVATE_KEY'));
}

export function configureWebPush(): boolean {
  const publicKey = getVapidSetting('VAPID_PUBLIC_KEY');
  const privateKey = getVapidSetting('VAPID_PRIVATE_KEY');
  if (!publicKey || !privateKey) return false;
  const subject = getVapidSetting('VAPID_SUBJECT') || 'mailto:admin@localhost';
  webpush.setVapidDetails(subject, publicKey, privateKey);
  return true;
}

function localDateAndTime(now: Date, timeZone: string): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now);

  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    time: `${get('hour')}:${get('minute')}`,
  };
}

function shouldSend(candidate: ReminderCandidate, now: Date): { due: boolean; localDate: string } {
  const timeZone = candidate.push_time_zone || DEFAULT_TIME_ZONE;
  const { date, time } = localDateAndTime(now, timeZone);
  return {
    due: time >= candidate.push_reminder_time && candidate.last_notified_date !== date,
    localDate: date,
  };
}

async function sendPushNotifications(candidate: ReminderCandidate): Promise<boolean> {
  const subscriptions = db
    .prepare(`SELECT id, endpoint, keys_p256dh, keys_auth FROM push_subscriptions WHERE user_id = ?`)
    .all(candidate.user_id) as PushSubscriptionRow[];

  if (subscriptions.length === 0) return false;

  const started = new Date(candidate.started_at);
  const startedText = Number.isNaN(started.getTime()) ? 'earlier' : started.toLocaleString('en-GB');
  const payload = JSON.stringify({
    title: 'Leccy charge reminder',
    body: `A charge was started ${startedText}. Enter the end-charge data when you next use the car.`,
    icon: '/icons/icon-192x192.png',
    badge: '/icons/icon-96x96.png',
    url: '/quick-data-entry',
    tag: 'leccy-charge-in-progress',
  });

  let delivered = false;
  await Promise.all(
    subscriptions.map(async (subscription) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: {
              p256dh: subscription.keys_p256dh,
              auth: subscription.keys_auth,
            },
          },
          payload,
          { TTL: 24 * 60 * 60, urgency: 'normal' },
        );
        delivered = true;
      } catch (err: unknown) {
        const statusCode = (err as { statusCode?: number })?.statusCode;
        if (statusCode === 404 || statusCode === 410) {
          db.prepare(`DELETE FROM push_subscriptions WHERE id = ?`).run(subscription.id);
        } else {
          console.error('[push/reminder send]', err);
        }
      }
    }),
  );

  return delivered;
}

export function startChargeReminderScheduler(): void {
  if (!configureWebPush()) {
    console.warn('[push] VAPID keys are not configured; charge reminder push notifications are disabled.');
    return;
  }
  if (schedulerStarted) return;
  schedulerStarted = true;

  async function tick(): Promise<void> {
    const now = new Date();
    const candidates = db
      .prepare(
        `SELECT
           u.id AS user_id,
           u.push_reminder_time,
           u.push_time_zone,
           p.vehicle_id,
           p.started_at,
           p.last_notified_date
         FROM pending_charge_reminders p
         JOIN users u ON u.id = p.user_id
         WHERE u.push_notifications_enabled = 1`,
      )
      .all() as ReminderCandidate[];

    for (const candidate of candidates) {
      const { due, localDate } = shouldSend(candidate, now);
      if (!due) continue;
      const delivered = await sendPushNotifications(candidate);
      if (delivered) {
        db.prepare(`UPDATE pending_charge_reminders SET last_notified_date = ? WHERE user_id = ?`)
          .run(localDate, candidate.user_id);
      }
    }
  }

  setInterval(() => {
    void tick().catch((err) => console.error('[push/reminder scheduler]', err));
  }, CHECK_INTERVAL_MS);
  void tick().catch((err) => console.error('[push/reminder scheduler]', err));
}
