'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { logger } from '@/lib/utils/logger';

const log = logger.createLogger('ServiceWorkerRegistration');

export function ServiceWorkerRegistration() {
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Online/Offline detection
    const handleOnline = () => {
      setIsOnline(true);
      toast.success('온라인 상태로 전환되었습니다.');

      // Trigger offline queue sync
      if (navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({
          type: 'SYNC_OFFLINE_QUEUE',
        });
      }
    };

    const handleOffline = () => {
      setIsOnline(false);
      toast.error('오프라인 상태입니다. 변경사항은 온라인 복귀 시 동기화됩니다.');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Service Worker registration
    if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
      navigator.serviceWorker
        .register('/erp-sw.js')
        .then((registration) => {
          log.info('Service Worker registered', { scope: registration.scope });

          // Check for updates
          registration.addEventListener('updatefound', () => {
            const newWorker = registration.installing;
            if (newWorker) {
              newWorker.addEventListener('statechange', () => {
                if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                  // New content is available
                  log.info('New content available, refresh to update');
                  toast.info('새로운 업데이트가 있습니다. 페이지를 새로고침해주세요.');
                }
              });
            }
          });

          // Subscribe to push notifications
          subscribeToPushNotifications(registration);
        })
        .catch((error) => {
          log.error('Service Worker registration failed', error);
        });

      // Listen for messages from Service Worker
      navigator.serviceWorker.addEventListener('message', (event) => {
        if (event.data && event.data.type === 'OFFLINE_SYNC_COMPLETE') {
          toast.success(`${event.data.count}개의 오프라인 요청이 동기화되었습니다.`);
        }
      });
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return null;
}

async function subscribeToPushNotifications(registration: ServiceWorkerRegistration) {
  try {
    // Check if notifications are supported
    if (!('Notification' in window)) {
      log.info('Notifications not supported');
      return;
    }

    // Check if permission is already granted
    if (Notification.permission === 'granted') {
      await createPushSubscription(registration);
      return;
    }

    // Request permission
    if (Notification.permission !== 'denied') {
      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
        await createPushSubscription(registration);
      }
    }
  } catch (error) {
    log.error('Failed to subscribe to push notifications', error);
  }
}

async function createPushSubscription(registration: ServiceWorkerRegistration) {
  try {
    // Get worker ID from localStorage
    const workerId = localStorage.getItem('erp_worker_id');
    if (!workerId) {
      log.info('No worker ID found, skipping push subscription');
      return;
    }

    // Check if subscription already exists
    const existingSubscription = await registration.pushManager.getSubscription();
    if (existingSubscription) {
      log.info('Push subscription already exists');
      return;
    }

    // VAPID public key (to be generated and stored in env)
    const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!vapidPublicKey) {
      log.info('VAPID public key not configured');
      return;
    }

    // Create new subscription
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
    });

    // Send subscription to server
    const response = await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        workerId,
        subscription: subscription.toJSON(),
      }),
    });

    if (response.ok) {
      log.info('Push subscription successful');
    } else {
      log.error('Failed to save push subscription');
    }
  } catch (error) {
    log.error('Failed to create push subscription', error);
  }
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}
