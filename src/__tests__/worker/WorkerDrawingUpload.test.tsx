/**
 * WorkerDrawingUpload 테스트 (Phase 3: frontend-modal)
 * - 드래그드랍 하이라이트 / drop 처리 / 비허용 확장자
 * - BaseModal 기본 동작: overlay click, ESC
 * - webhardWarning 응답 반영 vs 일반 성공
 */

import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { WorkerDrawingUpload } from '@/app/worker/_components/WorkerDrawingUpload';
import { queryKeys } from '@/lib/react-query/queryKeys';

jest.mock('@/app/worker/_lib/store', () => ({
  useErpMobileStore: (
    selector: (s: { workerSession: { name: string } | null }) => unknown
  ): unknown => selector({ workerSession: { name: 'Test Worker' } }),
}));

function createWrapper() {
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
  return Wrapper;
}

function createWrapperWithClient() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  Wrapper.displayName = 'TestQueryWrapperWithClient';
  return { Wrapper, queryClient };
}

function getDropzone(): HTMLElement {
  // 드래그 중이 아닐 때의 기본 라벨 기준으로 드롭존 탐색
  const label = screen.getByText(/파일 선택/);
  const dropzone = label.closest('[role="button"]');
  if (!dropzone) throw new Error('dropzone not found');
  return dropzone as HTMLElement;
}

describe('WorkerDrawingUpload — 드래그드랍', () => {
  it('M1: 드래그 진입 시 드롭존에 data-drag-active 속성이 적용된다', () => {
    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <WorkerDrawingUpload contactId="c1" companyName="A사" onClose={jest.fn()} />
      </Wrapper>
    );

    const dropzone = getDropzone();
    expect(dropzone).not.toHaveAttribute('data-drag-active');
    fireEvent.dragEnter(dropzone);
    expect(dropzone).toHaveAttribute('data-drag-active', 'true');
  });

  it('M2: 허용 확장자 파일 drop 시 selectedFile 상태가 업데이트되어 파일명이 노출된다', () => {
    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <WorkerDrawingUpload contactId="c1" companyName="A사" onClose={jest.fn()} />
      </Wrapper>
    );

    const dropzone = getDropzone();
    const file = new File(['x'], 'draft.dxf', { type: 'application/dxf' });

    fireEvent.drop(dropzone, { dataTransfer: { files: [file] } });

    expect(screen.getByText('draft.dxf')).toBeInTheDocument();
  });

  it('M3: 비허용 확장자 파일 drop 시 에러 모달이 뜨고 selectedFile은 변경되지 않는다', () => {
    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <WorkerDrawingUpload contactId="c1" companyName="A사" onClose={jest.fn()} />
      </Wrapper>
    );

    const dropzone = getDropzone();
    const file = new File(['x'], 'bad.exe', { type: 'application/octet-stream' });

    fireEvent.drop(dropzone, { dataTransfer: { files: [file] } });

    expect(screen.getByText(/허용되지 않는 형식/)).toBeInTheDocument();
    expect(screen.queryByText('bad.exe')).toBeNull();
  });
});

describe('WorkerDrawingUpload — BaseModal overlay / ESC', () => {
  it('M4: overlay(backdrop) 클릭 시 onClose가 호출된다', () => {
    const onClose = jest.fn();
    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <WorkerDrawingUpload contactId="c1" companyName="A사" onClose={onClose} />
      </Wrapper>
    );

    const title = screen.getByText('도면 업로드');
    const backdrop = title.closest('.fixed');
    expect(backdrop).toBeTruthy();

    fireEvent.click(backdrop as HTMLElement);
    expect(onClose).toHaveBeenCalled();
  });

  it('M5: ESC 키 입력 시 onClose가 호출된다', () => {
    const onClose = jest.fn();
    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <WorkerDrawingUpload contactId="c1" companyName="A사" onClose={onClose} />
      </Wrapper>
    );

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });
});

describe('WorkerDrawingUpload — webhardWarning 처리', () => {
  let originalFetch: typeof global.fetch | undefined;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    originalFetch = global.fetch;
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof global.fetch;
  });

  afterEach(() => {
    if (originalFetch) {
      global.fetch = originalFetch;
    } else {
      delete (global as { fetch?: typeof global.fetch }).fetch;
    }
  });

  function mockFetchSuccess(createResponseBody: object) {
    fetchMock.mockImplementation((input: RequestInfo | URL): Promise<Response> => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('/upload-urls')) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve([
              { uploadUrl: 'https://r2.example/upload', key: 'key1', fileName: 'draft.dxf' },
            ]),
        } as unknown as Response);
      }
      if (url.includes('/drawing-revisions')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(createResponseBody),
        } as unknown as Response);
      }
      return Promise.resolve({ ok: true } as unknown as Response);
    });
  }

  async function uploadFile() {
    const dropzone = getDropzone();
    const file = new File(['x'], 'draft.dxf', { type: 'application/dxf' });
    fireEvent.drop(dropzone, { dataTransfer: { files: [file] } });

    const uploadSpan = screen.getByText('업로드');
    const uploadBtn = uploadSpan.closest('button');
    if (!uploadBtn) throw new Error('upload button not found');
    await act(async () => {
      fireEvent.click(uploadBtn);
    });
  }

  it('M6: createResponse에 webhardWarning이 있으면 onSuccess가 warning 인자와 함께 호출된다', async () => {
    mockFetchSuccess({
      webhardWarning: { code: 'NO_INQUIRY_NUMBER', message: '문의번호 미발급' },
    });

    const onSuccess = jest.fn();
    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <WorkerDrawingUpload
          contactId="c1"
          companyName="A사"
          onClose={jest.fn()}
          onSuccess={onSuccess}
        />
      </Wrapper>
    );

    await uploadFile();

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalledWith({
        code: 'NO_INQUIRY_NUMBER',
        message: '문의번호 미발급',
      });
    });
  });

  it('M7: webhardWarning 없이 업로드 성공 시 onSuccess가 warning 없이 호출된다', async () => {
    mockFetchSuccess({});

    const onSuccess = jest.fn();
    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <WorkerDrawingUpload
          contactId="c1"
          companyName="A사"
          onClose={jest.fn()}
          onSuccess={onSuccess}
        />
      </Wrapper>
    );

    await uploadFile();

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalled();
    });
    // warning 없이 호출 (첫 인자 falsy)
    const firstArg = onSuccess.mock.calls[0]?.[0];
    expect(firstArg).toBeFalsy();
  });

  it('T2: 업로드 성공 시 invalidateQueries가 contacts.timeline(contactId) + refetchType:all 로 호출된다', async () => {
    mockFetchSuccess({});

    const { Wrapper, queryClient } = createWrapperWithClient();
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

    render(
      <Wrapper>
        <WorkerDrawingUpload contactId="c1" companyName="A사" onClose={jest.fn()} />
      </Wrapper>
    );

    await uploadFile();

    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalled();
    });

    const expectedKey = JSON.stringify(queryKeys.contacts.timeline('c1'));
    const matched = invalidateSpy.mock.calls.find(
      ([arg]) =>
        JSON.stringify((arg as { queryKey: unknown }).queryKey) === expectedKey &&
        (arg as { refetchType?: string }).refetchType === 'all'
    );
    expect(matched).toBeDefined();
  });

  it('T3: 업로드 성공 시 invalidateQueries가 contacts.detail(contactId) 로 호출된다', async () => {
    mockFetchSuccess({});

    const { Wrapper, queryClient } = createWrapperWithClient();
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

    render(
      <Wrapper>
        <WorkerDrawingUpload contactId="c1" companyName="A사" onClose={jest.fn()} />
      </Wrapper>
    );

    await uploadFile();

    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalled();
    });

    const expectedKey = JSON.stringify(queryKeys.contacts.detail('c1'));
    const matched = invalidateSpy.mock.calls.find(
      ([arg]) => JSON.stringify((arg as { queryKey: unknown }).queryKey) === expectedKey
    );
    expect(matched).toBeDefined();
  });

  it('T4: 업로드 성공 시 웹하드 파일/폴더/뱃지 쿼리도 즉시 무효화한다', async () => {
    mockFetchSuccess({});

    const { Wrapper, queryClient } = createWrapperWithClient();
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

    render(
      <Wrapper>
        <WorkerDrawingUpload contactId="c1" companyName="A사" onClose={jest.fn()} />
      </Wrapper>
    );

    await uploadFile();

    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalled();
    });

    const calls = invalidateSpy.mock.calls.map(([arg]) =>
      JSON.stringify((arg as { queryKey: unknown }).queryKey)
    );
    expect(calls).toContain(JSON.stringify(queryKeys.webhard.files.all()));
    expect(calls).toContain(JSON.stringify(queryKeys.webhard.folders.all()));
    expect(calls).toContain(JSON.stringify(queryKeys.webhard.badgeCounts()));
    expect(calls).toContain(JSON.stringify(queryKeys.webhard.newFilesAll()));
  });
});
