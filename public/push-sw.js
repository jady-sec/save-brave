// Loaded into the generated service worker (vite.config.ts → workbox.importScripts). Shows notifications sent by
// supabase/functions/notify and opens the app on tap.
self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { body: event.data && event.data.text() }; }
  event.waitUntil(self.registration.showNotification(data.title || 'Save Brave', {
    body: data.body || '',
    icon: '/icon-192.png',
    badge: '/icons/badge-96.png', // Android uses only its alpha channel, so an opaque icon shows as a white square
    data: { url: data.url || '/' },
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data && event.notification.data.url || '/';
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const open = windows[0];
    if (!open) return self.clients.openWindow(url);
    await open.focus();
    // navigate() rejects for a window this worker doesn't control yet; the app still comes to the front.
    try { await open.navigate(url); } catch { /* stay on the current screen */ }
  })());
});
