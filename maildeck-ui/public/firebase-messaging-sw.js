importScripts('https://www.gstatic.com/firebasejs/10.13.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.13.1/firebase-messaging-compat.js');

// Initialize the Firebase app in the service worker by passing in
// your app's Firebase config object.
// https://firebase.google.com/docs/web/setup#config-object
firebase.initializeApp({
  apiKey: 'AIzaSyDQhSoq1kB8q5iXXTSWQlFaZ5dh36buap4',
  projectId: 'maildeck-e3e14',
  messagingSenderId: '382498780419',
  appId: '1:382498780419:web:a42a0bdbad6b4c3ecde536',
});

// Retrieve an instance of Firebase Messaging so that it can handle background
// messages.
const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Received background message ', payload);
  const notificationTitle = payload.notification?.title ?? 'New Mail';
  const notificationOptions = {
    body: payload.notification?.body ?? '',
    icon: '/firebase-logo.png',
    data: payload.data ?? {}
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const { configId, messageId } = event.notification.data ?? {};
  const url = configId && messageId
    ? `/inbox?configId=${configId}&messageId=${messageId}`
    : '/inbox';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      return clients.openWindow(url);
    })
  );
});
