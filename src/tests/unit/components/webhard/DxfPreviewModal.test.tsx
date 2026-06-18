import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { DxfPreviewModal } from '@/app/webhard/components/DxfPreviewModal';

jest.mock('dxf-parser', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    parseSync: jest.fn().mockReturnValue({
      entities: [
        {
          type: 'LINE',
          vertices: [
            { x: 0, y: 0 },
            { x: 10, y: 10 },
          ],
        },
      ],
    }),
  })),
}));

function mockCanvasContext() {
  const context = {
    fillRect: jest.fn(),
    beginPath: jest.fn(),
    moveTo: jest.fn(),
    lineTo: jest.fn(),
    stroke: jest.fn(),
    arc: jest.fn(),
    fill: jest.fn(),
    closePath: jest.fn(),
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    lineCap: 'round',
    lineJoin: 'round',
  } as unknown as CanvasRenderingContext2D;

  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
    configurable: true,
    value: jest.fn(() => context),
  });
}

describe('DxfPreviewModal', () => {
  beforeEach(() => {
    mockCanvasContext();
    global.fetch = jest.fn<Promise<Response>, Parameters<typeof fetch>>().mockResolvedValue({
      ok: true,
      text: async () => '0\nSECTION\n2\nENTITIES\n0\nENDSEC\n0\nEOF',
    } as Response);
  });

  it('renders a download action next to the reset-view control', async () => {
    const onDownload = jest.fn();

    render(
      <DxfPreviewModal
        fileId="11111111-1111-4111-8111-111111111111"
        filename="테스트.dxf"
        isOpen
        onClose={jest.fn()}
        onDownload={onDownload}
      />
    );

    const resetButton = await screen.findByRole('button', { name: '원본 크기' });
    const downloadButton = screen.getByRole('button', { name: '다운로드' });

    expect(resetButton.parentElement).toContainElement(downloadButton);
    fireEvent.click(downloadButton);

    await waitFor(() => {
      expect(onDownload).toHaveBeenCalledTimes(1);
    });
  });
});
