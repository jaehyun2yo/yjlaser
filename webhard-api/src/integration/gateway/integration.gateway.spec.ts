import { Logger } from '@nestjs/common';
import { hashIdentifier } from '../../common/logging/log-event';
import { IntegrationGateway } from './integration.gateway';
import { AuthService } from '../../auth/auth.service';
import { ApiKeyService } from '../auth/api-key.service';

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

function makeClient(options: { cookie?: string; apiKey?: string } = {}) {
  return {
    id: 'socket-1',
    handshake: {
      headers: { cookie: options.cookie ?? '' },
      auth: options.apiKey ? { apiKey: options.apiKey } : {},
    },
    join: jest.fn(),
    leave: jest.fn(),
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

describe('IntegrationGateway room ACL', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('unauthenticated connection log omits raw cookie and API key', async () => {
    const debugSpy = jest.spyOn(Logger.prototype, 'debug').mockImplementation();
    const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    const gateway = new IntegrationGateway(
      {
        verifySession: jest.fn(() => null),
        verifyWorkerSession: jest.fn(() => null),
      } as unknown as AuthService,
      { validateKey: jest.fn(async () => null) } as unknown as ApiKeyService
    );
    const client = makeClient({
      cookie: 'admin-session=raw-admin-session-token; erp-session=raw-worker-session-token',
      apiKey: 'raw-integration-api-key',
    });

    await gateway.handleConnection(client as never);

    expect(client.disconnect).toHaveBeenCalledTimes(1);
    const event = findJsonLogEvent(warnSpy, 'integration_gateway_connection_rejected');
    expect(event).toMatchObject({
      level: 'warn',
      project: 'company_site',
      component: 'IntegrationGateway',
      feature: 'integration_gateway',
      action: 'connect',
      status: 'failure',
      channel: 'security',
      actor_id_hash: hashIdentifier('socket-1'),
      metadata: {
        browser_present: true,
        integration_auth_present: true,
      },
    });

    const serialized = serializeLoggerCalls(debugSpy, warnSpy);
    expect(serialized).not.toContain('raw-admin-session-token');
    expect(serialized).not.toContain('raw-worker-session-token');
    expect(serialized).not.toContain('raw-integration-api-key');
    expect(serialized).not.toContain('available cookies');
  });

  it('integration API key principal cannot join admin room', async () => {
    const debugSpy = jest.spyOn(Logger.prototype, 'debug').mockImplementation();
    const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    const gateway = new IntegrationGateway(
      {} as AuthService,
      {
        validateKey: jest.fn(async () => ({
          id: 'key-1',
          programType: 'laser',
          permissions: ['orders:read'],
        })),
      } as unknown as ApiKeyService
    );
    const client = makeClient({ apiKey: 'valid-key' });

    await gateway.handleConnection(client as never);
    const result = gateway.handleJoin(client as never, 'admin');

    expect(client.join).not.toHaveBeenCalledWith('admin');
    expect(result).toEqual({ event: 'join:denied', room: 'admin' });

    const event = findJsonLogEvent(warnSpy, 'integration_gateway_room_join_denied');
    expect(event).toMatchObject({
      level: 'warn',
      project: 'company_site',
      component: 'IntegrationGateway',
      feature: 'integration_gateway',
      action: 'join_room',
      status: 'failure',
      channel: 'security',
      actor_id_hash: hashIdentifier('socket-1'),
      target_id_hash: hashIdentifier('admin'),
      metadata: {
        room_type: 'admin',
      },
    });

    const serialized = serializeLoggerCalls(debugSpy, warnSpy);
    expect(serialized).not.toContain('valid-key');
    expect(serialized).not.toContain('Client socket-1 denied room join: admin');
  });

  it('admin session can join admin room', async () => {
    jest.spyOn(Logger.prototype, 'debug').mockImplementation();
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    const gateway = new IntegrationGateway(
      {
        verifySession: jest.fn(() => ({
          userType: 'admin',
          userId: 'admin-1',
          companyId: null,
        })),
      } as unknown as AuthService,
      { validateKey: jest.fn() } as unknown as ApiKeyService
    );
    const client = makeClient({ cookie: 'admin-session=admin-token' });

    await gateway.handleConnection(client as never);
    const result = gateway.handleJoin(client as never, 'admin');

    expect(client.join).toHaveBeenCalledWith('admin');
    expect(result).toEqual({ event: 'joined', room: 'admin' });
  });

  it('company session cannot join another company room', async () => {
    jest.spyOn(Logger.prototype, 'debug').mockImplementation();
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    const gateway = new IntegrationGateway(
      {
        verifySession: jest.fn(() => ({
          userType: 'company',
          userId: 7,
          companyId: 7,
        })),
      } as unknown as AuthService,
      { validateKey: jest.fn() } as unknown as ApiKeyService
    );
    const client = makeClient({ cookie: 'company-session=company-token' });

    await gateway.handleConnection(client as never);
    const result = gateway.handleJoin(client as never, 'company:8');

    expect(client.join).not.toHaveBeenCalledWith('company:8');
    expect(result).toEqual({ event: 'join:denied', room: 'company:8' });
  });
});
