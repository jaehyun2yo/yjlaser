import { Logger } from '@nestjs/common';
import { NotificationsGateway } from './notifications.gateway';
import { AuthService } from '../auth/auth.service';
import { hashIdentifier } from '../common/logging/log-event';

type LoggedBackendEvent = {
  schema_version: 1;
  event: string;
  level: string;
  project: string;
  component: string;
  feature: string;
  action: string;
  status: string;
  channel: string;
  actor_id_hash?: string;
  target_id_hash?: string;
  metadata?: Record<string, unknown>;
};

function makeClient(cookie: string) {
  return {
    id: 'socket-1',
    handshake: { headers: { cookie } },
    join: jest.fn(),
    disconnect: jest.fn(),
  };
}

function serializeLoggerCalls(...spies: jest.SpyInstance[]): string {
  return JSON.stringify(
    spies.flatMap((spy) =>
      spy.mock.calls.flatMap((call: unknown[]) => call.map((value: unknown) => String(value)))
    )
  );
}

function findJsonLogEvent(spy: jest.SpyInstance, eventName: string): LoggedBackendEvent {
  const event = spy.mock.calls
    .flatMap((call: unknown[]) => call.map((value: unknown) => String(value)))
    .map((value) => {
      try {
        return JSON.parse(value) as Partial<LoggedBackendEvent>;
      } catch {
        return null;
      }
    })
    .find(
      (value): value is LoggedBackendEvent =>
        value?.schema_version === 1 && value.event === eventName
    );

  if (!event) {
    throw new Error(`Missing JSON log event: ${eventName}`);
  }

  return event;
}

describe('NotificationsGateway connection auth', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('stale admin-session 뒤의 유효한 company-session을 검증하고 company room에 join한다', async () => {
    const debugSpy = jest.spyOn(Logger.prototype, 'debug').mockImplementation();
    const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    const verifySession = jest.fn((token: string | undefined) => {
      if (token === 'valid-company') {
        return { userType: 'company', userId: 7, companyId: 7 };
      }
      return null;
    });
    const gateway = new NotificationsGateway({ verifySession } as unknown as AuthService);
    const client = makeClient('admin-session=stale-admin; company-session=valid-company');

    await gateway.handleConnection(client as never);

    expect(verifySession).toHaveBeenCalledWith('stale-admin');
    expect(verifySession).toHaveBeenCalledWith('valid-company');
    expect(client.join).toHaveBeenCalledWith('company:7');
    expect(client.disconnect).not.toHaveBeenCalled();

    const event = findJsonLogEvent(debugSpy, 'notifications_gateway_room_joined');
    expect(event).toMatchObject({
      level: 'debug',
      project: 'company_site',
      component: 'NotificationsGateway',
      feature: 'notifications_gateway',
      action: 'join_room',
      status: 'success',
      channel: 'audit',
      actor_id_hash: hashIdentifier('socket-1'),
      target_id_hash: hashIdentifier('company:7'),
      metadata: {
        user_type: 'company',
        room_type: 'company',
      },
    });

    const serialized = serializeLoggerCalls(debugSpy, warnSpy);
    expect(serialized).not.toContain('valid-company');
    expect(serialized).not.toContain('stale-admin');
    expect(serialized).not.toContain('socket-1');
    expect(serialized).not.toContain('company:7');
  });
});
