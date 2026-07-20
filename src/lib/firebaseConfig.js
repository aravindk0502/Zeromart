const FIREBASE_ENV_KEYS = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_STORAGE_BUCKET',
  'VITE_FIREBASE_MESSAGING_SENDER_ID',
  'VITE_FIREBASE_APP_ID',
  'VITE_FIREBASE_VAPID_KEY',
];

export const getFirebaseConfig = () => ({
  apiKey: String(import.meta.env.VITE_FIREBASE_API_KEY || '').trim(),
  authDomain: String(import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || '').trim(),
  projectId: String(import.meta.env.VITE_FIREBASE_PROJECT_ID || '').trim(),
  storageBucket: String(import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || '').trim(),
  messagingSenderId: String(import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '').trim(),
  appId: String(import.meta.env.VITE_FIREBASE_APP_ID || '').trim(),
  vapidKey: String(import.meta.env.VITE_FIREBASE_VAPID_KEY || '').trim(),
});

export const getMissingFirebaseEnvKeys = () => {
  const config = getFirebaseConfig();
  return FIREBASE_ENV_KEYS.filter((key) => {
    if (key === 'VITE_FIREBASE_API_KEY') return !config.apiKey;
    if (key === 'VITE_FIREBASE_AUTH_DOMAIN') return !config.authDomain;
    if (key === 'VITE_FIREBASE_PROJECT_ID') return !config.projectId;
    if (key === 'VITE_FIREBASE_STORAGE_BUCKET') return !config.storageBucket;
    if (key === 'VITE_FIREBASE_MESSAGING_SENDER_ID') return !config.messagingSenderId;
    if (key === 'VITE_FIREBASE_APP_ID') return !config.appId;
    if (key === 'VITE_FIREBASE_VAPID_KEY') return !config.vapidKey;
    return false;
  });
};

export const hasFirebaseConfig = () => getMissingFirebaseEnvKeys().length === 0;
