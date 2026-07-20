import { getApp, getApps, initializeApp } from 'firebase/app';
import { getFirebaseConfig, getMissingFirebaseEnvKeys, hasFirebaseConfig } from './firebaseConfig';

// Firebase app is initialized exactly once and re-used across the app.
const firebaseConfig = getFirebaseConfig();

if (!hasFirebaseConfig()) {
  console.warn('[firebase] missing env vars', getMissingFirebaseEnvKeys());
}

export const firebaseApp = hasFirebaseConfig() ? (getApps().length ? getApp() : initializeApp(firebaseConfig)) : null;

export default firebaseApp;