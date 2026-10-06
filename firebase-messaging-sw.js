/* Service Worker de Firebase Cloud Messaging.
   Este archivo recibe las notificaciones cuando la PWA está en segundo plano.
*/
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
  const notification = payload?.notification || {};
  const title = data.title || notification.title || 'Control Faltas';
  const body = data.body || notification.body || 'Tienes un evento próximo.';
  const url = data.url || './';
  const tag = data.notificationId || `control-faltas-${Date.now()}`;

  self.registration.showNotification(title, {
    body,
    icon: './sinfondo.png',
    badge: './sinfondo.png',
    tag,
    data: { url }
  });
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = new URL(event.notification.data?.url || './', self.location.origin).href;

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          try {
            const current = new URL(client.url);
            if (current.origin === self.location.origin) {
              if ('navigate' in client) client.navigate(targetUrl);
              return client.focus();
            }
          } catch (_) {}
        }
      }
      if (clients.openWindow) return clients.openWindow(targetUrl);
    })
  );
});
