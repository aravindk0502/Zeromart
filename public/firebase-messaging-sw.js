/*
  Firebase Messaging Service Worker
  - Receives Firebase config through the SW URL query params at registration time.
  - Handles background push messages.
*/

/* eslint-disable no-undef */
importScripts('https://www.gstatic.com/firebasejs/12.16.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/12.16.0/firebase-messaging-compat.js');

const params = new URLSearchParams(self.location.search);

const firebaseConfig = {
  apiKey: params.get('apiKey') || '',
  authDomain: params.get('authDomain') || '',
  projectId: params.get('projectId') || '',
  storageBucket: params.get('storageBucket') || '',
  messagingSenderId: params.get('messagingSenderId') || '',
  appId: params.get('appId') || '',
};

const hasRequiredConfig = firebaseConfig.apiKey
  && firebaseConfig.projectId
  && firebaseConfig.messagingSenderId
  && firebaseConfig.appId;

if (!hasRequiredConfig) {
  console.warn('[firebase-sw] missing config', Object.keys(firebaseConfig).filter((key) => !firebaseConfig[key]));
}

if (hasRequiredConfig) {
  firebase.initializeApp(firebaseConfig);

  const messaging = firebase.messaging();

  // Fired when a push is received while app is in background.
  messaging.onBackgroundMessage((payload) => {
    const notification = payload?.notification || {};
    const data = payload?.data || {};
    const title = notification.title || data.title || 'Drizn';

    const options = {
      body: notification.body || data.body || 'You have a new notification.',
      icon: notification.icon || '/assets/drizn-logo.png',
      badge: data.badge || '/favicon.ico',
      data,
    };

    self.registration.showNotification(title, options);
  });

  self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const targetUrl = event.notification?.data?.click_action
      || event.notification?.data?.url
      || '/';
    event.waitUntil(clients.openWindow(targetUrl));
  });
}
