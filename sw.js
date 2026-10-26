const CACHE_NAME = 'faltas-app-v3';

const APP_SHELL = [
    './',
    './index.html',
    './manifest.json'
];

// Instalación: guardar los archivos principales
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => cache.addAll(APP_SHELL))
            .then(() => self.skipWaiting())
    );
});

// Activación: eliminar la caché antigua de la aplicación
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then((cacheNames) => {
                return Promise.all(
                    cacheNames
                        .filter((cacheName) =>
                            cacheName.startsWith('faltas-app-') &&
                            cacheName !== CACHE_NAME
                        )
                        .map((cacheName) => caches.delete(cacheName))
                );
            })
            .then(() => self.clients.claim())
    );
});

// Peticiones: red primero; caché si no hay conexión
self.addEventListener('fetch', (event) => {
    const request = event.request;

    if (request.method !== 'GET') {
        return;
    }

    event.respondWith(
        fetch(request)
            .then((response) => {
                if (response && response.status === 200) {
                    const responseClone = response.clone();

                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(request, responseClone).catch(() => {});
                    });
                }

                return response;
            })
            .catch(async () => {
                const cachedResponse = await caches.match(request);

                if (cachedResponse) {
                    return cachedResponse;
                }

                // Si se solicita una página y no hay conexión,
                // mostrar el HTML guardado como alternativa.
                if (request.mode === 'navigate') {
                    const cachedPage = await caches.match('./index.html');

                    if (cachedPage) {
                        return cachedPage;
                    }
                }

                return new Response('No hay conexión a Internet y este recurso no está guardado.', {
                    status: 503,
                    statusText: 'Sin conexión',
                    headers: {
                        'Content-Type': 'text/plain; charset=utf-8'
                    }
                });
            })
    );
});