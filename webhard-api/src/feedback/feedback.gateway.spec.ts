import { Logger } from '@nestjs/common';
import { FeedbackGateway } from './feedback.gateway';
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

describe('FeedbackGateway connection auth', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('company-session은 admin-only feedback room 연결을 거부한다', async () => {
    const debugSpy = jest.spyOn(Logger.prototype, 'debug').mockImplementation();
    const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    const gateway = new FeedbackGateway({
      verifySession: jest.fn(() => ({
        userType: 'company',
        userId: 7,
        companyId: 7,
      })),
    } as unknown as AuthService);
    const client = makeClient('company-session=company-token');

    await gateway.handleConnection(client as never);

    expect(client.join).not.toHaveBeenCalled();
    expect(client.disconnect).toHaveBeenCalled();

    const event = findJsonLogEvent(warnSpy, 'feedback_gateway_connection_rejected');
    expect(event).toMatchObject({
      level: 'warn',
      project: 'company_site',
      component: 'FeedbackGateway',
      feature: 'feedback_gateway',
      action: 'connect',
      status: 'failure',
      channel: 'security',
      actor_id_hash: hashIdentifier('socket-1'),
      metadata: {
        reason: 'unauthenticated',
        browser_present: true,
      },
    });

    const serialized = serializeLoggerCalls(debugSpy, warnSpy);
    expect(serialized).not.toContain('company-token');
    expect(serialized).not.toContain('socket-1');
    expect(serialized).not.toContain('Unauthenticated connection rejected');
  });

  it('admin-session만 admin room에 join한다', async () => {
    jest.spyOn(Logger.prototype, 'debug').mockImplementation();
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    const gateway = new FeedbackGateway({
      verifySession: jest.fn(() => ({
        userType: 'admin',
        userId: 'admin-1',
        companyId: null,
      })),
    } as unknown as AuthService);
    const client = makeClient('admin-session=admin-token');

    await gateway.handleConnection(client as never);

    expect(client.join).toHaveBeenCalledWith('admin');
    expect(client.disconnect).not.toHaveBeenCalled();
  });
});
