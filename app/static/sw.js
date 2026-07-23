self.addEventListener('install', (e) => {
    self.skipWaiting();
});

self.addEventListener('fetch', (e) => {
    // Pass-through padrão
    e.respondWith(fetch(e.request));
});
