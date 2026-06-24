/**
 * @jest-environment node
 */

import { NextRequest } from 'next/server';
import webpush from 'web-push';

jest.mock('web-push', () => ({
  __esModule: true,
  default: {
    setVapidDetails: jest.fn(),
    sendNotification: jest.fn(),
  },
}));

jest.mock('@/lib/api/nestjs-server-client', () => ({
  serverGetPushSubscriptions: jest.fn(),
  serverUpsertPushSubscription: jest.fn(),
  nestjsFetch: jest.fn(),
}));

jest.mock('@/lib/auth/session', () => ({
  verifySession: jest.fn(),
  getSessionUser: jest.fn(),
}));

jest.mock('@/lib/auth/erp-session', () => ({
  getErpWorkerSession: jest.fn(),
}));

jest.mock('@/lib/utils/logger', () => ({
  logger: {
    createLogger: () => ({
      error: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    }),
  },
}));

import {
  serverGetPushSubscriptions,
  serverUpsertPushSubscription,
  nestjsFetch,
} from '@/lib/api/nestjs-server-client';
import { verifySession, getSessionUser } from '@/lib/auth/session';
import { getErpWorkerSession } from '@/lib/auth/erp-session';
import { POST as sendPush } from '@/app/api/push/send/route';
import { POST as subscribePush, DELETE as unsubscribePush } from '@/app/api/push/subscribe/route';
import { POST as controlSync } from '@/app/api/sync/control/route';
import { GET as getSyncEvents } from '@/app/api/sync/events/route';
import { GET as getSyncStats } from '@/app/api/sync/stats/route';
import { GET as getSyncStatus } from '@/app/api/sync/status/route';

const mockedWebpush = webpush as jest.Mocked<typeof webpush>;
const mockedServerGetPushSubscriptions = serverGetPushSubscriptions as jest.MockedFunction<
  typeof serverGetPushSubscriptions
>;
const mockedServerUpsertPushSubscription = serverUpsertPushSubscription as jest.MockedFunction<
  typeof serverUpsertPushSubscription
>;
const mockedNestjsFetch = nestjsFetch as jest.MockedFunction<typeof nestjsFetch>;
const mockedVerifySession = verifySession as jest.MockedFunction<typeof verifySession>;
const mockedGetSessionUser = getSessionUser as jest.MockedFunction<typeof getSessionUser>;
const mockedGetErpWorkerSession = getErpWorkerSession as jest.MockedFunction<
  typeof getErpWorkerSession
>;

function makeRequest(path: string, init?: RequestInit): NextRequest {
  return new NextRequest(new URL(`http://localhost:3000${path}`), init);
}

function expectAuthRejected(response: Response) {
  expect([401, 403]).toContain(response.status);
}

describe('security-sensitive Next.js mutation routes', () => {
  const originalFetch = global.fetch;
  const originalVapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const originalVapidPrivateKey = process.env.VAPID_PRIVATE_KEY;

  beforeEach(() => {
    jest.clearAllMocks();
    mockedVerifySession.mockResolvedValue(false);
    mockedGetSessionUser.mockResolvedValue(null);
    mockedGetErpWorkerSession.mockResolvedValue(null);
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = 'public-test-key';
    process.env.VAPID_PRIVATE_KEY = 'private-test-key';
    global.fetch = jest.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    if (originalVapidPublicKey === undefined) {
      delete process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    } else {
      process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = originalVapidPublicKey;
    }
    if (originalVapidPrivateKey === undefined) {
      delete process.env.VAPID_PRIVATE_KEY;
    } else {
      process.env.VAPID_PRIVATE_KEY = originalVapidPrivateKey;
    }
  });

  it('rejects unauthenticated push send before reading subscriptions or sending messages', async () => {
    mockedServerGetPushSubscriptions.mockResolvedValue([
      { endpoint: 'https://push.example.test/1', p256dh: 'p256dh', auth: 'auth' },
    ]);
    mockedWebpush.sendNotification.mockResolvedValue(
      {} as Awaited<ReturnType<typeof webpush.sendNotification>>
    );

    const response = await sendPush(
      makeRequest('/api/push/send', {
        method: 'POST',
        body: JSON.stringify({
          workerId: 'worker-1',
          title: '테스트',
          body: '메시지',
        }),
      })
    );

    expectAuthRejected(response);
    expect(mockedServerGetPushSubscriptions).not.toHaveBeenCalled();
    expect(mockedWebpush.sendNotification).not.toHaveBeenCalled();
  });

  it('rejects push subscription writes when the worker session is missing', async () => {
    mockedServerUpsertPushSubscription.mockResolvedValue({ success: true });

    const response = await subscribePush(
      makeRequest('/api/push/subscribe', {
        method: 'POST',
        body: JSON.stringify({
          workerId: 'worker-1',
          subscription: {
            endpoint: 'https://push.example.test/1',
            keys: { p256dh: 'p256dh', auth: 'auth' },
          },
        }),
      })
    );

    expectAuthRejected(response);
    expect(mockedServerUpsertPushSubscription).not.toHaveBeenCalled();
  });

  it('rejects push subscription writes for a different worker id than the verified session', async () => {
    mockedGetErpWorkerSession.mockResolvedValue({
      workerId: 'worker-1',
      workerName: '작업자',
    });
    mockedServerUpsertPushSubscription.mockResolvedValue({ success: true });

    const response = await subscribePush(
      makeRequest('/api/push/subscribe', {
        method: 'POST',
        body: JSON.stringify({
          workerId: 'worker-2',
          subscription: {
            endpoint: 'https://push.example.test/2',
            keys: { p256dh: 'p256dh', auth: 'auth' },
          },
        }),
      })
    );

    expect(response.status).toBe(403);
    expect(mockedServerUpsertPushSubscription).not.toHaveBeenCalled();
  });

  it('rejects push unsubscribe when the worker session is missing', async () => {
    mockedNestjsFetch.mockResolvedValue(new Response(JSON.stringify({ success: true })));

    const response = await unsubscribePush(
      makeRequest(
        '/api/push/subscribe?workerId=worker-1&endpoint=https%3A%2F%2Fpush.example.test%2F1',
        { method: 'DELETE' }
      )
    );

    expectAuthRejected(response);
    expect(mockedNestjsFetch).not.toHaveBeenCalled();
  });

  it('rejects sync control mutations without an admin or trusted internal credential', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(
      new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    const response = await controlSync(
      makeRequest('/api/sync/control', {
        method: 'POST',
        body: JSON.stringify({ action: 'restart' }),
      })
    );

    expectAuthRejected(response);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('rejects sync read proxies without an admin session before contacting the sync service', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(
      new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    const responses = await Promise.all([
      getSyncStatus(),
      getSyncStats(),
      getSyncEvents(makeRequest('/api/sync/events?page=1')),
    ]);

    responses.forEach(expectAuthRejected);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
