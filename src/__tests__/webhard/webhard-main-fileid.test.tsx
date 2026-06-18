/**
 * @jest-environment jsdom
 *
 * WebhardMain URL 쿼리 fileId 하이라이트 로직 (task 22 contact-webhard-navigate).
 *
 * useWebhardFileIdHighlight 훅을 통해 shallow 하게 검증:
 * - folderId + fileId 쿼리 + 파일 리스트에 해당 파일 포함 → setHighlight 호출
 * - fileId 만 단독 (folderId 없음) → setHighlight 미호출
 */

import { renderHook } from '@testing-library/react';
import { useSearchParams } from 'next/navigation';
import { useWebhardFileIdHighlight } from '@/app/webhard/hooks/useWebhardFileIdHighlight';
import { useWebhardHighlightStore } from '@/store/webhard/useWebhardHighlightStore';

jest.mock('next/navigation', () => ({
  useSearchParams: jest.fn(),
}));

jest.mock('@/store/webhard/useWebhardHighlightStore', () => ({
  useWebhardHighlightStore: {
    getState: jest.fn(),
  },
}));

const mockedUseSearchParams = useSearchParams as jest.MockedFunction<typeof useSearchParams>;
const mockedHighlightStore = useWebhardHighlightStore as unknown as {
  getState: jest.Mock;
};

describe('useWebhardFileIdHighlight', () => {
  let setHighlight: jest.Mock;
  let clearHighlight: jest.Mock;

  beforeEach(() => {
    setHighlight = jest.fn();
    clearHighlight = jest.fn();
    mockedHighlightStore.getState.mockReturnValue({ setHighlight, clearHighlight });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  const setSearchParams = (qs: string) => {
    mockedUseSearchParams.mockReturnValue(
      new URLSearchParams(qs) as unknown as ReturnType<typeof useSearchParams>
    );
  };

  it('folderId + fileId 쿼리 + 파일 리스트에 해당 파일 포함 → setHighlight(fileId, "file") 호출', () => {
    setSearchParams('folderId=A&fileId=B');
    const files = [{ id: 'B' }, { id: 'C' }];

    renderHook(() => useWebhardFileIdHighlight('A', files));

    expect(setHighlight).toHaveBeenCalledTimes(1);
    expect(setHighlight).toHaveBeenCalledWith('B', 'file');
  });

  it('fileId 만 단독 (folderId 없음) → setHighlight 호출 안 됨', () => {
    setSearchParams('fileId=B');
    const files = [{ id: 'B' }];

    renderHook(() => useWebhardFileIdHighlight(null, files));

    expect(setHighlight).not.toHaveBeenCalled();
  });
});
