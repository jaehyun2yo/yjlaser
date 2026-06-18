import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ResetPasswordForm } from '@/app/reset-password/ResetPasswordForm';

describe('ResetPasswordForm', () => {
  const originalFetch = global.fetch;
  const originalReplaceState = window.history.replaceState;
  const replaceStateMock = jest.fn();

  beforeEach(() => {
    global.fetch = jest.fn();
    Object.defineProperty(window.history, 'replaceState', {
      configurable: true,
      value: replaceStateMock,
    });
  });

  afterEach(() => {
    global.fetch = originalFetch;
    Object.defineProperty(window.history, 'replaceState', {
      configurable: true,
      value: originalReplaceState,
    });
    replaceStateMock.mockReset();
    window.location.hash = '';
    jest.clearAllMocks();
  });

  it('토큰이 없으면 새 비밀번호 입력 폼을 표시하지 않는다', () => {
    render(<ResetPasswordForm token="" />);

    expect(screen.getByText('재설정 링크가 올바르지 않습니다.')).toBeInTheDocument();
    expect(screen.queryByLabelText('새 비밀번호')).not.toBeInTheDocument();
  });

  it('비밀번호 확인이 다르면 API를 호출하지 않고 오류를 표시한다', async () => {
    render(<ResetPasswordForm token="reset-token" />);

    fireEvent.change(screen.getByLabelText('새 비밀번호'), {
      target: { value: 'NewStrong1!' },
    });
    fireEvent.change(screen.getByLabelText('새 비밀번호 확인'), {
      target: { value: 'Different1!' },
    });
    fireEvent.click(screen.getByRole('button', { name: '비밀번호 재설정' }));

    expect(await screen.findByText('비밀번호가 일치하지 않습니다.')).toBeInTheDocument();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('유효한 입력이면 reset-password API를 호출하고 성공 메시지를 표시한다', async () => {
    (global.fetch as jest.MockedFunction<typeof fetch>).mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, message: '비밀번호가 재설정되었습니다.' }),
    } as Response);

    render(<ResetPasswordForm token="reset-token" />);

    fireEvent.change(screen.getByLabelText('새 비밀번호'), {
      target: { value: 'NewStrong1!' },
    });
    fireEvent.change(screen.getByLabelText('새 비밀번호 확인'), {
      target: { value: 'NewStrong1!' },
    });
    fireEvent.click(screen.getByRole('button', { name: '비밀번호 재설정' }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: 'reset-token',
          password: 'NewStrong1!',
          passwordConfirm: 'NewStrong1!',
        }),
      });
    });
    expect(await screen.findByText('비밀번호가 재설정되었습니다.')).toBeInTheDocument();
  });

  it('mount 직후 URL query를 제거하고 state에 보관한 token으로 confirm을 요청한다', async () => {
    (global.fetch as jest.MockedFunction<typeof fetch>).mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, message: '비밀번호가 재설정되었습니다.' }),
    } as Response);

    render(<ResetPasswordForm token="reset-token" />);

    expect(replaceStateMock).toHaveBeenCalledWith(null, '', '/reset-password');

    fireEvent.change(screen.getByLabelText('새 비밀번호'), {
      target: { value: 'NewStrong1!' },
    });
    fireEvent.change(screen.getByLabelText('새 비밀번호 확인'), {
      target: { value: 'NewStrong1!' },
    });
    fireEvent.click(screen.getByRole('button', { name: '비밀번호 재설정' }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: 'reset-token',
          password: 'NewStrong1!',
          passwordConfirm: 'NewStrong1!',
        }),
      });
    });
  });

  it('URL fragment token을 읽은 뒤 fragment를 제거하고 confirm body로만 보낸다', async () => {
    (global.fetch as jest.MockedFunction<typeof fetch>).mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, message: '비밀번호가 재설정되었습니다.' }),
    } as Response);
    window.location.hash = '#token=fragment-token';

    render(<ResetPasswordForm token="" />);

    expect(replaceStateMock).toHaveBeenCalledWith(null, '', '/reset-password');

    fireEvent.change(screen.getByLabelText('새 비밀번호'), {
      target: { value: 'NewStrong1!' },
    });
    fireEvent.change(screen.getByLabelText('새 비밀번호 확인'), {
      target: { value: 'NewStrong1!' },
    });
    fireEvent.click(screen.getByRole('button', { name: '비밀번호 재설정' }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: 'fragment-token',
          password: 'NewStrong1!',
          passwordConfirm: 'NewStrong1!',
        }),
      });
    });
  });
});
