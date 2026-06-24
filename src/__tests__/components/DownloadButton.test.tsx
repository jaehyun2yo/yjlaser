import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { DownloadButton } from '@/components/DownloadButton';

jest.mock('@/lib/utils/logger', () => ({
  logger: {
    createLogger: () => ({
      error: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    }),
  },
}));

describe('DownloadButton', () => {
  const originalFetch = global.fetch;
  const originalCreateObjectURL = URL.createObjectURL;
  const originalRevokeObjectURL = URL.revokeObjectURL;
  const originalCreateElement = document.createElement.bind(document);

  beforeEach(() => {
    jest.useFakeTimers();
    URL.createObjectURL = jest.fn(() => 'blob:download-url');
    URL.revokeObjectURL = jest.fn();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
    global.fetch = originalFetch;
    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevokeObjectURL;
  });

  it('apiUrl 다운로드는 presigned URL을 blob으로 받아 API 파일명을 적용한다', async () => {
    const clickedAnchors: HTMLAnchorElement[] = [];
    jest.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
      const element = originalCreateElement(tagName);
      if (tagName.toLowerCase() === 'a') {
        Object.defineProperty(element, 'click', {
          value: () => clickedAnchors.push(element as HTMLAnchorElement),
        });
      }
      return element;
    });

    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          url: 'https://r2.example.test/file.ai',
          fileName: '260519-F-004 - 테스트거래처 - 250530.ai',
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        blob: async () => new Blob(['file']),
      });

    render(<DownloadButton apiUrl="/api/drawing-revisions/rev-1/download?fileIndex=0" />);

    fireEvent.click(screen.getByRole('button', { name: '다운로드' }));

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2));
    expect(global.fetch).toHaveBeenNthCalledWith(
      1,
      '/api/drawing-revisions/rev-1/download?fileIndex=0'
    );
    expect(global.fetch).toHaveBeenNthCalledWith(2, 'https://r2.example.test/file.ai');
    expect(clickedAnchors).toHaveLength(1);
    expect(clickedAnchors[0].href).toBe('blob:download-url');
    expect(clickedAnchors[0].download).toBe('260519-F-004 - 테스트거래처 - 250530.ai');

    jest.runOnlyPendingTimers();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:download-url');
  });
});
