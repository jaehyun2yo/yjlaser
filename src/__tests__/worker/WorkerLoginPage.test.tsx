import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import WorkerLoginPage from '@/app/worker/login/page';
import { useErpMobileStore } from '@/app/worker/_lib/store';

jest.mock('@/app/worker/_lib/store', () => ({
  useErpMobileStore: jest.fn(),
}));

const mockedUseErpMobileStore = jest.mocked(useErpMobileStore);

describe('WorkerLoginPage', () => {
  beforeEach(() => {
    mockedUseErpMobileStore.mockReturnValue({
      setWorkerSession: jest.fn(),
      workerSession: null,
    } as ReturnType<typeof useErpMobileStore>);
    global.fetch = jest.fn();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('관리자 문의 안내는 최초 화면에서 숨긴다', () => {
    render(<WorkerLoginPage />);

    expect(screen.getByRole('heading', { name: '작업관리' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '현장작업' })).toBeNull();
    expect(screen.getByText('이름과 PIN을 입력해주세요')).toBeInTheDocument();
    expect(screen.queryByText('PIN을 모르면 현장 관리자에게 문의해주세요.')).toBeNull();
  });

  it('로그인 실패 후 타이틀 안내 아래에 관리자 문의 안내를 표시한다', async () => {
    const user = userEvent.setup();
    const fetchMock = jest.mocked(global.fetch);
    fetchMock.mockResolvedValue({
      ok: false,
      json: async () => ({ message: '이름 또는 PIN이 일치하지 않습니다.' }),
    } as Response);

    render(<WorkerLoginPage />);

    await user.type(screen.getByLabelText('작업자 이름'), '김재현');
    await user.click(screen.getByRole('button', { name: '1' }));
    await user.click(screen.getByRole('button', { name: '2' }));
    await user.click(screen.getByRole('button', { name: '3' }));
    await user.click(screen.getByRole('button', { name: '4' }));

    const helpText = await screen.findByText('PIN을 모르면 현장 관리자에게 문의해주세요.');
    const subtitle = screen.getByText('이름과 PIN을 입력해주세요');
    const nameLabel = screen.getByText('작업자 이름');

    expect(screen.getByText('이름 또는 PIN이 일치하지 않습니다.')).toBeInTheDocument();
    expect(helpText).toBeInTheDocument();
    expect(
      subtitle.compareDocumentPosition(helpText) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(
      helpText.compareDocumentPosition(nameLabel) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  });
});
