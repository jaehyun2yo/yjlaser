import { BookingsGateway } from './bookings.gateway';
import { AuthService } from '../auth/auth.service';

function makeClient(cookie: string) {
  return {
    id: 'socket-1',
    handshake: { headers: { cookie } },
    join: jest.fn(),
    disconnect: jest.fn(),
  };
}

describe('BookingsGateway connection auth', () => {
  it('stale admin-session 뒤의 유효한 company-session을 검증하고 company room에 join한다', async () => {
    const verifySession = jest.fn((token: string | undefined) => {
      if (token === 'valid-company') {
        return { userType: 'company', userId: 7, companyId: 7 };
      }
      return null;
    });
    const gateway = new BookingsGateway({ verifySession } as unknown as AuthService);
    const client = makeClient('admin-session=stale-admin; company-session=valid-company');

    await gateway.handleConnection(client as never);

    expect(verifySession).toHaveBeenCalledWith('stale-admin');
    expect(verifySession).toHaveBeenCalledWith('valid-company');
    expect(client.join).toHaveBeenCalledWith('company:7');
    expect(client.disconnect).not.toHaveBeenCalled();
  });
});
