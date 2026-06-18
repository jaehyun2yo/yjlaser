import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { LoginForm } from '@/app/login/LoginForm';

const replaceStateMock = jest.fn();
const mockSearchParams = new URLSearchParams('view=find-id');

jest.mock('next/navigation', () => ({
  useSearchParams: () => mockSearchParams,
}));

jest.mock('next/link', () => {
  function MockLink({
    href,
    children,
    className,
  }: {
    href: string;
    children: React.ReactNode;
    className?: string;
  }) {
    return (
      <a href={href} className={className}>
        {children}
      </a>
    );
  }

  return MockLink;
});

describe('LoginForm account recovery', () => {
  const originalFetch = global.fetch;
  const originalReplaceState = window.history.replaceState;

  beforeEach(() => {
    mockSearchParams.set('view', 'find-id');
    window.localStorage.clear();
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
    jest.clearAllMocks();
  });

  it('아이디 찾기 성공 시 안내 문구만 표시하고 응답 username은 표시하지 않는다', async () => {
    (global.fetch as jest.MockedFunction<typeof fetch>).mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        message: '입력하신 정보와 일치하는 계정이 있으면 등록 이메일로 아이디 안내를 보냈습니다.',
        username: 'acme-manager',
      }),
    } as Response);

    render(<LoginForm loginAction={jest.fn()} />);

    fireEvent.change(screen.getByLabelText('업체명'), {
      target: { value: '대성목형' },
    });
    fireEvent.change(screen.getByLabelText('이메일'), {
      target: { value: 'manager@example.com' },
    });
    fireEvent.change(screen.getByLabelText('연락처'), {
      target: { value: '010-1234-5678' },
    });
    fireEvent.click(screen.getByRole('button', { name: '아이디 찾기' }));

    expect(
      await screen.findByText(
        '입력하신 정보와 일치하는 계정이 있으면 등록 이메일로 아이디 안내를 보냈습니다.'
      )
    ).toBeInTheDocument();
    expect(screen.queryByText('acme-manager')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '로그인하러 가기' })).toBeInTheDocument();

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/auth/find-id', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyName: '대성목형',
          email: 'manager@example.com',
          phone: '010-1234-5678',
        }),
      });
    });
  });

  it('저장된 아이디와 자동로그인 선택 상태를 로그인 폼에 복원한다', async () => {
    mockSearchParams.delete('view');
    window.localStorage.setItem('yjlaser-login-remembered-username', 'saved-company');
    window.localStorage.setItem('yjlaser-login-auto-login', 'true');

    render(<LoginForm loginAction={jest.fn()} />);

    expect(await screen.findByDisplayValue('saved-company')).toBeInTheDocument();
    expect(screen.getByLabelText('아이디 저장')).toBeChecked();
    expect(screen.getByLabelText('자동로그인')).toBeChecked();
  });

  it('로그인 제출 전 아이디 저장과 자동로그인 선호를 localStorage에 저장한다', async () => {
    mockSearchParams.delete('view');
    const loginAction = jest.fn(() => Promise.resolve());

    render(<LoginForm loginAction={loginAction} />);

    fireEvent.change(screen.getByLabelText('아이디'), {
      target: { value: 'company-user' },
    });
    fireEvent.change(screen.getByLabelText('비밀번호'), {
      target: { value: 'Password123!' },
    });
    fireEvent.click(screen.getByLabelText('아이디 저장'));
    fireEvent.click(screen.getByLabelText('자동로그인'));
    fireEvent.click(screen.getByRole('button', { name: '로그인' }));

    await waitFor(() => {
      expect(loginAction).toHaveBeenCalledTimes(1);
    });
    expect(window.localStorage.getItem('yjlaser-login-remembered-username')).toBe('company-user');
    expect(window.localStorage.getItem('yjlaser-login-auto-login')).toBe('true');

    const submittedFormData = loginAction.mock.calls[0]?.[0] as FormData;
    expect(submittedFormData.get('autoLogin')).toBe('on');
  });
});
