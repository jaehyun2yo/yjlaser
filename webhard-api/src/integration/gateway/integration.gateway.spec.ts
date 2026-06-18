import { IntegrationGateway } from './integration.gateway';
import { AuthService } from '../../auth/auth.service';
import { ApiKeyService } from '../auth/api-key.service';

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

describe('IntegrationGateway room ACL', () => {
  it('integration API key principal cannot join admin room', async () => {
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
  });

  it('admin session can join admin room', async () => {
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
