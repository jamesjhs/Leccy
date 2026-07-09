import { pushApi } from './api';

export function isStandalonePwa(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function urlBase64ToArrayBuffer(base64String: string): ArrayBuffer {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray.buffer as ArrayBuffer;
}

export function browserSupportsPush(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

export async function enablePushNotifications(): Promise<PushSubscriptionJSON> {
  if (!browserSupportsPush()) {
    throw new Error('This browser does not support push notifications.');
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error('Notification permission was not granted.');
  }

  const [{ data }, registration] = await Promise.all([
    pushApi.getVapidPublicKey(),
    navigator.serviceWorker.ready,
  ]);

  const existing = await registration.pushManager.getSubscription();
  if (existing) {
    const json = existing.toJSON();
    await pushApi.subscribe(json);
    await pushApi.updateSettings({
      enabled: true,
      time_zone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    });
    return json;
  }

  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToArrayBuffer(data.publicKey),
  });
  const json = subscription.toJSON();
  await pushApi.subscribe(json);
  await pushApi.updateSettings({
    enabled: true,
    time_zone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  });
  return json;
}

export async function disablePushNotifications(): Promise<void> {
  if ('serviceWorker' in navigator) {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (subscription) {
      await pushApi.unsubscribe(subscription.endpoint);
      await subscription.unsubscribe();
    }
  }
  await pushApi.updateSettings({ enabled: false });
}
