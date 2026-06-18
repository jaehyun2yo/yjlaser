/**
 * Admin UpdateProcessStageButton 테스트 (Phase 6: stage-transition-frontend).
 *
 * - 성공 응답 → contacts.all / contacts.detail / processBoard.all invalidate + router.refresh 호출.
 * - 422 응답 → mapStageTransitionError 결과의 title + message 가 alert 에 포함.
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { UpdateProcessStageButton } from '@/app/(admin)/admin/contacts/[id]/update-process-stage-button';
import { queryKeys } from '@/lib/react-query/queryKeys';

const mockRefresh = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}));

jest.mock('@/app/actions/contacts', () => ({
  updateProcessStage: jest.fn(),
}));

import { updateProcessStage } from '@/app/actions/contacts';

const mockedUpdateProcessStage = updateProcessStage as jest.MockedFunction<
  typeof updateProcessStage
>;

function createTestSetup() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  Wrapper.displayName = 'TestQueryWrapper';
  return { Wrapper, queryClient };
}

describe('UpdateProcessStageButton — 성공 경로', () => {
  beforeEach(() => {
    mockedUpdateProcessStage.mockReset();
    mockRefresh.mockReset();
  });

  it('성공 시 contacts.all, contacts.detail, processBoard.all invalidate + router.refresh 호출', async () => {
    mockedUpdateProcessStage.mockResolvedValue({ success: true });
    const { Wrapper, queryClient } = createTestSetup();
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

    render(
      <Wrapper>
        <UpdateProcessStageButton
          contactId="contact-admin-p6"
          currentStage="sample"
          status="drawing"
        />
      </Wrapper>
    );

    const select = screen.getByRole('combobox');
    fireEvent.change(select, { target: { value: 'drawing_confirmed' } });

    await waitFor(() => {
      expect(mockedUpdateProcessStage).toHaveBeenCalledWith(
        'contact-admin-p6',
        'drawing_confirmed'
      );
    });

    const invalidatedKeys = invalidateSpy.mock.calls.map((c) => JSON.stringify(c[0]?.queryKey));
    expect(invalidatedKeys).toContain(JSON.stringify(queryKeys.contacts.all));
    expect(invalidatedKeys).toContain(
      JSON.stringify(queryKeys.contacts.detail('contact-admin-p6'))
    );
    expect(invalidatedKeys).toContain(JSON.stringify(queryKeys.processBoard.all));
    expect(mockRefresh).toHaveBeenCalled();
  });
});

describe('UpdateProcessStageButton — 422 구조화 에러 alert', () => {
  let alertSpy: jest.SpyInstance;

  beforeEach(() => {
    mockedUpdateProcessStage.mockReset();
    mockRefresh.mockReset();
    alertSpy = jest.spyOn(window, 'alert').mockImplementation(() => {});
  });

  afterEach(() => {
    alertSpy.mockRestore();
  });

  it('INQUIRY_NUMBER_REQUIRED → alert 에 "도면 확정 불가" + 문의번호 안내 포함', async () => {
    mockedUpdateProcessStage.mockResolvedValue({
      success: false,
      error: {
        code: 'INQUIRY_NUMBER_REQUIRED',
        message: '도면 확정 전에 문의번호(O) 또는 작업번호(F) 가 할당되어야 합니다.',
        statusCode: 422,
      },
    });
    const { Wrapper } = createTestSetup();

    render(
      <Wrapper>
        <UpdateProcessStageButton
          contactId="contact-admin-p6"
          currentStage="sample"
          status="drawing"
        />
      </Wrapper>
    );

    const select = screen.getByRole('combobox');
    fireEvent.change(select, { target: { value: 'drawing_confirmed' } });

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalled();
    });
    const alertMessage = alertSpy.mock.calls[0][0] as string;
    expect(alertMessage).toContain('도면 확정 불가');
    expect(alertMessage).toContain('문의번호');
    expect(alertMessage).not.toContain('INQUIRY_NUMBER_REQUIRED');

    // 실패 시 router.refresh 미호출.
    expect(mockRefresh).not.toHaveBeenCalled();
  });

  it('FOLDER_CREATION_FAILED → alert 에 "웹하드 폴더 생성 실패" + 업체 정보 안내', async () => {
    mockedUpdateProcessStage.mockResolvedValue({
      success: false,
      error: {
        code: 'FOLDER_CREATION_FAILED',
        message: '문의 폴더 생성 실패',
        statusCode: 422,
      },
    });
    const { Wrapper } = createTestSetup();

    render(
      <Wrapper>
        <UpdateProcessStageButton
          contactId="contact-admin-p6"
          currentStage="sample"
          status="drawing"
        />
      </Wrapper>
    );

    const select = screen.getByRole('combobox');
    fireEvent.change(select, { target: { value: 'drawing_confirmed' } });

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalled();
    });
    const alertMessage = alertSpy.mock.calls[0][0] as string;
    expect(alertMessage).toContain('웹하드 폴더 생성 실패');
    expect(alertMessage).toContain('업체 정보');
    expect(alertMessage).not.toContain('FOLDER_CREATION_FAILED');
  });

  it('문자열 에러(구 shape 호환) → "전환 실패" title + 원본 메시지', async () => {
    mockedUpdateProcessStage.mockResolvedValue({
      success: false,
      error: 'API error: 500',
    });
    const { Wrapper } = createTestSetup();

    render(
      <Wrapper>
        <UpdateProcessStageButton
          contactId="contact-admin-p6"
          currentStage="sample"
          status="drawing"
        />
      </Wrapper>
    );

    const select = screen.getByRole('combobox');
    fireEvent.change(select, { target: { value: 'drawing_confirmed' } });

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalled();
    });
    const alertMessage = alertSpy.mock.calls[0][0] as string;
    expect(alertMessage).toContain('전환 실패');
    expect(alertMessage).toContain('API error: 500');
  });
});
