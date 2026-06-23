// YJLaser ERP Service Worker
const CACHE_NAME = 'yjlaser-erp-v1';
const API_CACHE_NAME = 'yjlaser-erp-api-v1';
const OFFLINE_URL = '/erp/login';
const OFFLINE_QUEUE_DB = 'offline-queue';
const OFFLINE_QUEUE_STORE = 'requests';

// Assets to cache
const ASSETS_TO_CACHE = ['/erp', '/erp/login', '/erp/tasks', '/erp-manifest.json'];

// Install event - cache assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  self.skipWaiting();
});

// Activate event - clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((cacheName) => cacheName !== CACHE_NAME)
          .map((cacheName) => {
            return caches.delete(cacheName);
          })
      );
    })
  );
  self.clients.claim();
});

// IndexedDB helper functions
function openOfflineQueueDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(OFFLINE_QUEUE_DB, 1);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(OFFLINE_QUEUE_STORE)) {
        db.createObjectStore(OFFLINE_QUEUE_STORE, { keyPath: 'id', autoIncrement: true });
      }
    };
  });
}

async function queueOfflineRequest(requestData) {
  try {
    const db = await openOfflineQueueDB();
    const transaction = db.transaction([OFFLINE_QUEUE_STORE], 'readwrite');
    const store = transaction.objectStore(OFFLINE_QUEUE_STORE);

    await new Promise((resolve, reject) => {
      const request = store.add({
        ...requestData,
        timestamp: Date.now(),
      });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } catch {
    // Offline queue storage is best-effort; the foreground request still receives the offline response.
  }
}

async function processOfflineQueue() {
  try {
    const db = await openOfflineQueueDB();
    const transaction = db.transaction([OFFLINE_QUEUE_STORE], 'readonly');
    const store = transaction.objectStore(OFFLINE_QUEUE_STORE);

    const allRequests = await new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    for (const item of allRequests) {
      try {
        const response = await fetch(item.url, {
          method: item.method,
          headers: item.headers,
          body: item.body,
        });

        if (response.ok) {
          // Success - remove from queue
          const deleteTransaction = db.transaction([OFFLINE_QUEUE_STORE], 'readwrite');
          const deleteStore = deleteTransaction.objectStore(OFFLINE_QUEUE_STORE);
          await new Promise((resolve, reject) => {
            const request = deleteStore.delete(item.id);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
          });
        }
      } catch {
        // Keep failed requests in the queue for the next sync attempt.
      }
    }

    // Notify clients that sync is complete
    const clients = await self.clients.matchAll();
    clients.forEach((client) => {
      client.postMessage({
        type: 'OFFLINE_SYNC_COMPLETE',
        count: allRequests.length,
      });
    });
  } catch {
    // Offline queue processing is best-effort in the service worker.
  }
}

// Listen for online event to sync queued requests
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SYNC_OFFLINE_QUEUE') {
    processOfflineQueue();
  }
});

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Handle POST/PUT/DELETE requests when offline
  if (['POST', 'PUT', 'DELETE'].includes(event.request.method)) {
    if (url.pathname.startsWith('/api/erp')) {
      event.respondWith(
        fetch(event.request).catch(async () => {
          // Queue for offline sync
          const requestData = {
            url: event.request.url,
            method: event.request.method,
            headers: Object.fromEntries(event.request.headers.entries()),
            body: await event.request.text(),
          };
          await queueOfflineRequest(requestData);

          // Return a response indicating queued
          return new Response(
            JSON.stringify({
              success: false,
              queued: true,
              message: '오프라인 상태입니다. 요청이 큐에 저장되었습니다.',
            }),
            {
              status: 202,
              headers: { 'Content-Type': 'application/json' },
            }
          );
        })
      );
      return;
    }
  }

  // Skip non-GET requests (except queued above)
  if (event.request.method !== 'GET') {
    return;
  }

  // Handle API requests with Network First strategy + cache
  if (url.pathname.startsWith('/api/erp')) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          // Cache successful GET API responses
          if (response.ok) {
            const responseClone = response.clone();
            caches.open(API_CACHE_NAME).then((cache) => {
              cache.put(event.request, responseClone);
            });
          }
          return response;
        })
        .catch(() => {
          // Fallback to cached API response
          return caches.match(event.request).then((cachedResponse) => {
            if (cachedResponse) {
              return cachedResponse;
            }
            // Return offline error
            return new Response(
              JSON.stringify({
                success: false,
                offline: true,
                message: '오프라인 상태입니다.',
              }),
              {
                status: 503,
                headers: { 'Content-Type': 'application/json' },
              }
            );
          });
        })
    );
    return;
  }

  // Skip non-ERP API requests
  if (url.pathname.startsWith('/api') || url.hostname !== self.location.hostname) {
    return;
  }

  // For ERP pages, use network-first strategy
  if (url.pathname.startsWith('/erp')) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          // Cache the response
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
          return response;
        })
        .catch(() => {
          // Fallback to cache
          return caches.match(event.request).then((cachedResponse) => {
            if (cachedResponse) {
              return cachedResponse;
            }
            // If no cache, show offline page
            return caches.match(OFFLINE_URL);
          });
        })
    );
    return;
  }

  // For other assets, use cache-first strategy
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(event.request).then((response) => {
        // Don't cache non-successful responses
        if (!response || response.status !== 200 || response.type !== 'basic') {
          return response;
        }
        const responseClone = response.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseClone);
        });
        return response;
      });
    })
  );
});

// Handle push notifications (future feature)
self.addEventListener('push', (event) => {
  if (event.data) {
    const data = event.data.json();
    const options = {
      body: data.body,
      icon: '/erp-icon-192.png',
      badge: '/erp-icon-192.png',
      vibrate: [100, 50, 100],
      data: {
        url: data.url || '/erp/tasks',
      },
    };
    event.waitUntil(self.registration.showNotification(data.title, options));
  }
});

// Handle notification click
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(clients.openWindow(event.notification.data.url || '/erp/tasks'));
});
