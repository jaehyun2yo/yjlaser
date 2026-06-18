import { ActivityLogsGateway } from './activity-logs.gateway';
import { AuthService } from '../auth/auth.service';

function makeClient(cookie: string) {
  return {
    id: 'socket-1',
    handshake: { headers: { cookie } },
    join: jest.fn(),
    disconnect: jest.fn(),
  };
}

describe('ActivityLogsGateway connection auth', () => {
  it('company-session은 admin-only activity room 연결을 거부한다', async () => {
    const gateway = new ActivityLogsGateway({
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
  });

  it('admin-session만 admin room에 join한다', async () => {
    const gateway = new ActivityLogsGateway({
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
