/* Firebase Cloud Messaging Service Worker */
importScripts('https://www.gstatic.com/firebasejs/12.19.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/12.19.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'AIzaSyBapjfSE61etzDjye-bFN5x6XcP_5s1nTo',
  authDomain: 'control-faltas-26.firebaseapp.com',
  databaseURL: 'https://control-faltas-26-default-rtdb.europe-west1.firebasedatabase.app',
  projectId: 'control-faltas-26',
  storageBucket: 'control-faltas-26.firebasestorage.app',
  messagingSenderId: '1036495041102',
  appId: '1:1036495041102:web:f623dfb2a046abafca891f',
  measurementId: 'G-9REG1X986N'
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const data = payload?.data || {};
  const title = data.title || 'Control Faltas';
  const body = data.body || 'Tienes un evento próximo.';
  const url = data.url || './';
  const notificationId = data.notificationId || ('notification-' + Date.now());

  self.registration.showNotification(title, {
    body,
    icon: './sinfondo.png',
    badge: './sinfondo.png',
    tag: notificationId,
    renotify: true,
    data: { url }
  });
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification?.data?.url || './';

  event.waitUntil((async () => {
    const absoluteUrl = new URL(targetUrl, self.registration.scope).href;
    const clientsList = await clients.matchAll({ type: 'window', includeUncontrolled: true });

    for (const client of clientsList) {
      if ('focus' in client) {
        try {
          await client.navigate(absoluteUrl);
        } catch (_) {}
        return client.focus();
      }
    }

    if (clients.openWindow) return clients.openWindow(absoluteUrl);
  })());
});
