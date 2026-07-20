import { getMessaging, getToken, isSupported, onMessage } from 'firebase/messaging';
import { firebaseApp } from './firebase';
import { getFirebaseConfig, getMissingFirebaseEnvKeys, hasFirebaseConfig } from './firebaseConfig';

const SW_FILE = '/firebase-messaging-sw.js';

let cachedMessaging = null;

// Shared public Firebase config values used by the SW via query params.
const getPublicFirebaseConfig = () => getFirebaseConfig();

const getVapidKey = () => String(import.meta.env.VITE_FIREBASE_VAPID_KEY || '').trim();

async function getMessagingInstance() {
  if (typeof window === 'undefined') return null;
  if (!hasFirebaseConfig() || !firebaseApp) return null;
  const firebaseMessagingSupported = await isSupported().catch(() => false);
  if (!firebaseMessagingSupported) return null;
  if (!cachedMessaging) cachedMessaging = getMessaging(firebaseApp);
  return cachedMessaging;
}

// Registers the Firebase messaging service worker only when push is explicitly requested.
async function registerMessagingServiceWorker() {
  const config = getPublicFirebaseConfig();
  const query = new URLSearchParams(config).toString();
  return navigator.serviceWorker.register(`${SW_FILE}?${query}`, { scope: '/' });
}

// Requests notification permission and retrieves FCM token when explicitly called by app code.
export async function requestPushPermission() {
  const result = {
    supported: false,
    permission: typeof Notification === 'undefined' ? 'unsupported' : Notification.permission,
    token: '',
    error: '',
  };

  try {
    if (!hasFirebaseConfig()) {
      result.error = `Missing Firebase env vars: ${getMissingFirebaseEnvKeys().join(', ')}`;
      return result;
    }

    const basicBrowserSupport = typeof window !== 'undefined'
      && 'Notification' in window
      && 'serviceWorker' in navigator
      && 'PushManager' in window;
    const firebaseMessagingSupported = await isSupported().catch(() => false);
    result.supported = Boolean(basicBrowserSupport && firebaseMessagingSupported);

    if (!result.supported) return result;

    const registration = await registerMessagingServiceWorker();

    if (Notification.permission === 'default') {
      result.permission = await Notification.requestPermission();
    } else {
      result.permission = Notification.permission;
    }

    if (result.permission !== 'granted') return result;

    const vapidKey = getVapidKey();
    if (!vapidKey) {
      result.error = 'Missing VITE_FIREBASE_VAPID_KEY.';
      return result;
    }

    const messaging = await getMessagingInstance();
    if (!messaging) {
      result.supported = false;
      return result;
    }

    const token = await getToken(messaging, {
      vapidKey,
      serviceWorkerRegistration: registration,
    });

    result.token = token || '';
    if (!result.token) result.error = 'FCM token was not returned.';
    return result;
  } catch (error) {
    result.error = error?.message || String(error);
    return result;
  }
}

// Foreground listener helper that callers can subscribe to when app is open.
export async function listenForForegroundMessages(onPayload) {
  const messaging = await getMessagingInstance();
  if (!messaging) return () => {};
  return onMessage(messaging, (payload) => {
    if (typeof onPayload === 'function') onPayload(payload);
  });
}
