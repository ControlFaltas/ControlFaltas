const CACHE_NAME = 'faltas-app-v2';

const APP_SHELL = [
    './',
    './index.html',
    './manifest.json'
];

// Instalación del service worker
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => cache.addAll(APP_SHELL))
            .then(() => self.skipWaiting())
    );
});

// Activación y eliminación de cachés antiguas
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then((cacheNames) => {
                return Promise.all(
                    cacheNames
                        .filter((cacheName) => cacheName !== CACHE_NAME)
                        .map((cacheName) => caches.delete(cacheName))
                );
            })
            .then(() => self.clients.claim())
    );
});

// Peticiones de red
// Intentamos siempre obtener la versión actual de Internet.
// Si no hay conexión, utilizamos la caché.
self.addEventListener('fetch', (event) => {
    // Solo gestionamos peticiones GET
    if (event.request.method !== 'GET') {
        return;
    }

    event.respondWith(
        fetch(event.request)
            .then((response) => {
                // Guardamos una copia actualizada en caché
                if (response && response.status === 200) {
                    const responseClone = response.clone();

                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, responseClone);
                    });
                }

                return response;
            })
            .catch(() => {
                // Si no hay Internet, usamos la caché
                return caches.match(event.request);
            })
    );
});