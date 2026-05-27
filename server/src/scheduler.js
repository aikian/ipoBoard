import cron from 'node-cron';
import webPush from 'web-push';
import dayjs from 'dayjs';
import { store } from './store.js';

const KST_OFFSET_HOURS = 9;
const sentKeys = new Set();

function nowKst() {
  return dayjs().add(KST_OFFSET_HOURS, 'hour');
}

function toKstDateTime(date, hour) {
  if (!date) return null;
  return dayjs(`${date}T${String(hour).padStart(2, '0')}:00:00`);
}

function makeAlertKey(ipo, type) {
  return `${ipo.no38 || ipo.name}:${type}`;
}

function shouldSend(target, windowMinutes = 10) {
  if (!target) return false;
  const diff = nowKst().diff(target, 'minute');
  return diff >= 0 && diff < windowMinutes;
}

function makePayload(ipo, type) {
  if (type === 'subscription_10') {
    return {
      title: `청약 시작: ${ipo.name}`,
      body: `오늘 오전 10시 청약 체크. 공모가 ${ipo.fixedPrice || '-'} / 주관사 ${ipo.underwriter || '-'}`,
      url: ipo.detailUrl || '/'
    };
  }

  if (type === 'pre_listing_21') {
    return {
      title: `내일 상장: ${ipo.name}`,
      body: `상장 전날 21시 체크. 점수 ${ipo.score?.totalScore ?? '-'}점 / 등급 ${ipo.score?.grade ?? '-'}`,
      url: ipo.detailUrl || '/'
    };
  }

  return {
    title: `오늘 상장: ${ipo.name}`,
    body: `오전 9시 상장 체크. 유통부담·확약·호가를 확인하세요.` ,
    url: ipo.detailUrl || '/'
  };
}

export function configurePush() {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || 'mailto:admin@example.com';

  if (!publicKey || !privateKey) {
    console.warn('[push] VAPID keys are missing. Push notification sending is disabled.');
    return false;
  }

  webPush.setVapidDetails(subject, publicKey, privateKey);
  return true;
}

export async function sendPushToAll(payload) {
  if (!store.subscriptions.length) return { sent: 0, failed: 0 };

  let sent = 0;
  let failed = 0;

  await Promise.all(store.subscriptions.map(async (subscription) => {
    try {
      await webPush.sendNotification(subscription, JSON.stringify(payload));
      sent += 1;
    } catch (error) {
      failed += 1;
      console.error('[push] send failed:', error.message);
    }
  }));

  return { sent, failed };
}

export async function runDueNotifications() {
  const ipos = store.ipos || [];

  for (const ipo of ipos) {
    const schedules = [
      {
        type: 'subscription_10',
        target: toKstDateTime(ipo.subscriptionStart, 10)
      },
      {
        type: 'pre_listing_21',
        target: ipo.listingDate ? toKstDateTime(dayjs(ipo.listingDate).subtract(1, 'day').format('YYYY-MM-DD'), 21) : null
      },
      {
        type: 'listing_09',
        target: toKstDateTime(ipo.listingDate, 9)
      }
    ];

    for (const item of schedules) {
      const key = makeAlertKey(ipo, item.type);
      if (sentKeys.has(key)) continue;
      if (!shouldSend(item.target)) continue;

      const payload = makePayload(ipo, item.type);
      const result = await sendPushToAll(payload);
      sentKeys.add(key);
      store.alerts.unshift({ key, ipoNo: ipo.no38, ipoName: ipo.name, type: item.type, payload, result, createdAt: new Date().toISOString() });
    }
  }
}

export function startNotificationScheduler() {
  cron.schedule('* * * * *', () => {
    runDueNotifications().catch((error) => console.error('[scheduler] error:', error));
  }, {
    timezone: 'Asia/Seoul'
  });

  console.log('[scheduler] notification scheduler started');
}
