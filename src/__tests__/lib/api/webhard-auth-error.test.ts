import {
  WEBHARD_LOGIN_REQUIRED_MESSAGE,
  WebhardApiError,
  createWebhardApiError,
  isWebhardAuthError,
} from '@/lib/api/webhard';

describe('webhard API auth errors', () => {
  it('maps 401 responses to the login-required message', async () => {
    const response = {
      status: 401,
      json: jest.fn().mockResolvedValue({ error: '인증이 필요합니다.' }),
    } as unknown as Response;

    const error = await createWebhardApiError(response, 'Failed to fetch files');

    expect(error).toBeInstanceOf(WebhardApiError);
    expect(error.status).toBe(401);
    expect(error.message).toBe(WEBHARD_LOGIN_REQUIRED_MESSAGE);
    expect(isWebhardAuthError(error)).toBe(true);
  });
});
