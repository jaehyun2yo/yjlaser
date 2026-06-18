/**
 * WebhardContextMenu 컴포넌트 테스트
 * TDD: 테스트 먼저 작성
 */
import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import { WebhardContextMenu } from '@/app/webhard/components/WebhardContextMenu';
import { WebhardFile } from '@/types/webhard';

// 테스트용 파일 데이터
const mockFile: WebhardFile = {
  id: 'file-1',
  name: '테스트파일.pdf',
  original_name: '테스트파일.pdf',
  path: '/test/file.pdf',
  size: 1024,
  mime_type: 'application/pdf',
  is_downloaded: false,
  folder_id: 'folder-1',
  company_id: 1,
  uploaded_by: 1,
  inquiry_number: null,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
  deleted_at: null,
  deleted_by: null,
};

// 모킹
const mockOnDownload = jest.fn();
const mockOnRename = jest.fn();
const mockOnDelete = jest.fn();
const mockOnPreview = jest.fn();
const mockOnClose = jest.fn();

const defaultProps = {
  file: mockFile,
  x: 100,
  y: 200,
  onDownload: mockOnDownload,
  onRename: mockOnRename,
  onDelete: mockOnDelete,
  onClose: mockOnClose,
};

describe('WebhardContextMenu', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('렌더링', () => {
    it('메뉴가 올바른 위치에 렌더링된다', () => {
      const { container } = render(<WebhardContextMenu {...defaultProps} />);

      const menu = container.firstChild as HTMLElement;
      expect(menu).toHaveStyle({ left: '100px', top: '200px' });
    });

    it('다운로드 버튼이 렌더링된다', () => {
      render(<WebhardContextMenu {...defaultProps} />);

      expect(screen.getByText('다운로드')).toBeInTheDocument();
    });

    it('이름 수정 버튼이 렌더링된다', () => {
      render(<WebhardContextMenu {...defaultProps} />);

      expect(screen.getByText('이름 수정')).toBeInTheDocument();
    });

    it('삭제 버튼이 렌더링된다', () => {
      render(<WebhardContextMenu {...defaultProps} />);

      expect(screen.getByText('삭제')).toBeInTheDocument();
    });

    it('미리보기 핸들러가 있으면 미리보기 버튼이 렌더링된다', () => {
      render(<WebhardContextMenu {...defaultProps} onPreview={mockOnPreview} />);

      expect(screen.getByText('미리보기')).toBeInTheDocument();
    });

    it('삭제 핸들러가 없으면 파일 삭제 버튼을 렌더링하지 않는다', () => {
      render(<WebhardContextMenu {...defaultProps} onDelete={undefined} />);

      expect(screen.queryByText('삭제')).not.toBeInTheDocument();
    });

    it('폴더 메뉴에 폴더 권한 핸들러가 없으면 이름 변경과 삭제를 렌더링하지 않는다', () => {
      render(
        <WebhardContextMenu
          mode="folder"
          folder={{
            id: 'folder-1',
            name: '업체 폴더',
            parent_id: null,
            company_id: 1,
          }}
          x={100}
          y={200}
          onClose={mockOnClose}
        />
      );

      expect(screen.queryByText('이름 변경')).not.toBeInTheDocument();
      expect(screen.queryByText('삭제')).not.toBeInTheDocument();
    });
  });

  describe('스타일', () => {
    it('기본 컨테이너 스타일이 적용된다', () => {
      const { container } = render(<WebhardContextMenu {...defaultProps} />);

      const menu = container.firstChild as HTMLElement;
      expect(menu).toHaveClass('fixed');
      expect(menu).toHaveClass('z-50');
      expect(menu).toHaveClass('rounded-lg');
      expect(menu).toHaveClass('shadow-lg');
    });

    it('삭제 버튼에 빨간색 스타일이 적용된다', () => {
      render(<WebhardContextMenu {...defaultProps} />);

      const deleteButton = screen.getByText('삭제').closest('button');
      expect(deleteButton).toHaveClass('text-destructive');
    });
  });

  describe('이벤트 핸들러', () => {
    it('다운로드 클릭 시 onDownload가 호출된다', () => {
      render(<WebhardContextMenu {...defaultProps} onPreview={mockOnPreview} />);

      fireEvent.click(screen.getByText('다운로드'));

      expect(mockOnDownload).toHaveBeenCalledWith(mockFile);
      expect(mockOnPreview).not.toHaveBeenCalled();
      expect(mockOnClose).toHaveBeenCalled();
    });

    it('미리보기 클릭 시 onPreview가 호출된다', () => {
      render(<WebhardContextMenu {...defaultProps} onPreview={mockOnPreview} />);

      fireEvent.click(screen.getByText('미리보기'));

      expect(mockOnPreview).toHaveBeenCalledWith(mockFile);
      expect(mockOnDownload).not.toHaveBeenCalled();
      expect(mockOnClose).toHaveBeenCalled();
    });

    it('이름 수정 클릭 시 onRename이 호출된다', () => {
      render(<WebhardContextMenu {...defaultProps} />);

      fireEvent.click(screen.getByText('이름 수정'));

      expect(mockOnRename).toHaveBeenCalledWith(mockFile);
    });

    it('삭제 클릭 시 onDelete가 호출된다', () => {
      render(<WebhardContextMenu {...defaultProps} />);

      fireEvent.click(screen.getByText('삭제'));

      expect(mockOnDelete).toHaveBeenCalledWith(mockFile.id);
    });

    it('메뉴 클릭 시 이벤트 전파가 중지된다', () => {
      const { container } = render(<WebhardContextMenu {...defaultProps} />);

      const menu = container.firstChild as HTMLElement;
      const clickEvent = new MouseEvent('click', { bubbles: true });
      jest.spyOn(clickEvent, 'stopPropagation');

      menu.dispatchEvent(clickEvent);

      expect(clickEvent.stopPropagation).toHaveBeenCalled();
    });
  });

  describe('아이콘', () => {
    it('모든 버튼에 아이콘이 렌더링된다', () => {
      const { container } = render(<WebhardContextMenu {...defaultProps} />);

      // 3개 버튼에 각각 SVG 아이콘이 있어야 함
      const svgIcons = container.querySelectorAll('svg');
      expect(svgIcons.length).toBe(3);
    });
  });

  describe('ref 전달', () => {
    it('contextMenuRef가 전달되면 적용된다', () => {
      const ref = { current: null } as React.RefObject<HTMLDivElement | null>;
      render(<WebhardContextMenu {...defaultProps} contextMenuRef={ref} />);

      expect(ref.current).toBeInstanceOf(HTMLDivElement);
    });
  });
});
