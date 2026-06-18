/**
 * WebhardFileItem 컴포넌트 테스트
 * TDD: 테스트 먼저 작성
 */
import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import { WebhardFileItem } from '@/app/webhard/components/WebhardFileItem';
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
  companies: {
    company_name: '테스트회사',
    manager_name: '홍길동',
  },
};

// 모킹
const mockOnDragStart = jest.fn();
const mockOnDragEnd = jest.fn();
const mockOnClick = jest.fn();
const mockOnDoubleClick = jest.fn();
const mockOnContextMenu = jest.fn();
const mockOnMouseEnter = jest.fn();
const mockOnMouseMove = jest.fn();
const mockOnMouseLeave = jest.fn();
const mockOnCheckboxChange = jest.fn();
const mockOnEditChange = jest.fn();
const mockOnEditBlur = jest.fn();
const mockOnEditKeyDown = jest.fn();
const mockOnDownload = jest.fn();
const mockOnDelete = jest.fn();

const defaultProps = {
  file: mockFile,
  index: 0,
  isSelected: false,
  isEditing: false,
  editingFileName: '',
  isDragging: false,
  isDragSelecting: false,
  isNewFilesMode: false,
  isNew: false,
  canPreview: false,
  fileNameColWidth: 60,
  dateColWidth: 20,
  onDragStart: mockOnDragStart,
  onDragEnd: mockOnDragEnd,
  onClick: mockOnClick,
  onDoubleClick: mockOnDoubleClick,
  onContextMenu: mockOnContextMenu,
  onMouseEnter: mockOnMouseEnter,
  onMouseMove: mockOnMouseMove,
  onMouseLeave: mockOnMouseLeave,
  onCheckboxChange: mockOnCheckboxChange,
  onEditChange: mockOnEditChange,
  onEditBlur: mockOnEditBlur,
  onEditKeyDown: mockOnEditKeyDown,
  onDownload: mockOnDownload,
  onDelete: mockOnDelete,
};

describe('WebhardFileItem', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('렌더링', () => {
    it('파일명이 렌더링된다', () => {
      render(<WebhardFileItem {...defaultProps} />);

      expect(screen.getByText('테스트파일.pdf')).toBeInTheDocument();
    });

    it('업로드 날짜가 렌더링된다', () => {
      render(<WebhardFileItem {...defaultProps} />);

      // 2024-01-01 형식으로 렌더링
      expect(screen.getByText(/2024/)).toBeInTheDocument();
    });

    it('업로더 이름이 렌더링된다', () => {
      render(<WebhardFileItem {...defaultProps} />);

      expect(screen.getByText('홍길동')).toBeInTheDocument();
    });

    it('체크박스가 렌더링된다', () => {
      render(<WebhardFileItem {...defaultProps} />);

      expect(screen.getByRole('checkbox')).toBeInTheDocument();
    });

    it('다운로드 버튼이 렌더링된다', () => {
      render(<WebhardFileItem {...defaultProps} />);

      expect(screen.getByTitle('다운로드')).toBeInTheDocument();
    });

    it('삭제 버튼이 렌더링된다', () => {
      render(<WebhardFileItem {...defaultProps} />);

      expect(screen.getByTitle('삭제')).toBeInTheDocument();
    });

    it('삭제 권한이 없으면 삭제 버튼을 렌더링하지 않는다', () => {
      render(<WebhardFileItem {...defaultProps} canDelete={false} />);

      expect(screen.queryByTitle('삭제')).not.toBeInTheDocument();
    });
  });

  describe('선택 상태', () => {
    it('선택되지 않은 경우 체크박스가 해제된다', () => {
      render(<WebhardFileItem {...defaultProps} isSelected={false} />);

      expect(screen.getByRole('checkbox')).not.toBeChecked();
    });

    it('선택된 경우 체크박스가 체크된다', () => {
      render(<WebhardFileItem {...defaultProps} isSelected={true} />);

      expect(screen.getByRole('checkbox')).toBeChecked();
    });
  });

  describe('편집 모드', () => {
    it('편집 모드일 때 입력 필드가 표시된다', () => {
      render(<WebhardFileItem {...defaultProps} isEditing={true} editingFileName="새이름.pdf" />);

      const input = screen.getByDisplayValue('새이름.pdf');
      expect(input).toBeInTheDocument();
    });

    it('편집 모드가 아닐 때 파일명 텍스트가 표시된다', () => {
      render(<WebhardFileItem {...defaultProps} isEditing={false} />);

      expect(screen.getByText('테스트파일.pdf')).toBeInTheDocument();
    });
  });

  describe('새 파일 모드', () => {
    it('새 파일일 때 N 뱃지가 표시된다', () => {
      render(<WebhardFileItem {...defaultProps} isNew={true} />);

      expect(screen.getByText('N')).toBeInTheDocument();
    });

    it('새 파일 모드이고 폴더 경로가 있을 때 폴더 경로가 표시된다', () => {
      const fileWithPath = {
        ...mockFile,
        folder_path: '업로드/2024년',
      };

      render(<WebhardFileItem {...defaultProps} file={fileWithPath} isNewFilesMode={true} />);

      expect(screen.getByText(/업로드\/2024년/)).toBeInTheDocument();
    });
  });

  describe('이벤트 핸들러', () => {
    it('체크박스 변경 시 onCheckboxChange가 호출된다', () => {
      render(<WebhardFileItem {...defaultProps} />);

      fireEvent.click(screen.getByRole('checkbox'));

      expect(mockOnCheckboxChange).toHaveBeenCalledWith(true);
    });

    it('행 클릭 시 onClick이 호출된다', () => {
      const { container } = render(<WebhardFileItem {...defaultProps} />);

      const row = container.querySelector('[data-file-item]');
      if (row) fireEvent.click(row);

      expect(mockOnClick).toHaveBeenCalled();
    });

    it('행 더블클릭 시 onDoubleClick이 호출된다', () => {
      const { container } = render(<WebhardFileItem {...defaultProps} />);

      const row = container.querySelector('[data-file-item]');
      if (row) fireEvent.doubleClick(row);

      expect(mockOnDoubleClick).toHaveBeenCalled();
    });

    it('우클릭 시 onContextMenu가 호출된다', () => {
      const { container } = render(<WebhardFileItem {...defaultProps} />);

      const row = container.querySelector('[data-file-item]');
      if (row) fireEvent.contextMenu(row);

      expect(mockOnContextMenu).toHaveBeenCalled();
    });

    it('다운로드 버튼 클릭 시 onDownload가 호출된다', () => {
      render(<WebhardFileItem {...defaultProps} />);

      fireEvent.click(screen.getByTitle('다운로드'));

      expect(mockOnDownload).toHaveBeenCalled();
    });

    it('삭제 버튼 클릭 시 onDelete가 호출된다', () => {
      render(<WebhardFileItem {...defaultProps} />);

      fireEvent.click(screen.getByTitle('삭제'));

      expect(mockOnDelete).toHaveBeenCalled();
    });
  });

  describe('드래그', () => {
    it('요소가 draggable이다', () => {
      const { container } = render(<WebhardFileItem {...defaultProps} />);

      const row = container.querySelector('[data-file-item]');
      expect(row).toHaveAttribute('draggable', 'true');
    });
  });

  describe('컬럼 너비', () => {
    it('파일명 컬럼 너비가 적용된다', () => {
      const { container } = render(<WebhardFileItem {...defaultProps} fileNameColWidth={70} />);

      // style 속성에 70%가 포함되어 있는지 확인
      const fileNameCol = container.querySelector('[style*="70%"]');
      expect(fileNameCol).toBeInTheDocument();
    });

    it('날짜 컬럼 너비가 적용된다', () => {
      const { container } = render(<WebhardFileItem {...defaultProps} dateColWidth={25} />);

      const dateCol = container.querySelector('[style*="25%"]');
      expect(dateCol).toBeInTheDocument();
    });
  });

  describe('스타일', () => {
    it('드래그 중일 때 드래그 스타일이 적용된다', () => {
      const { container } = render(<WebhardFileItem {...defaultProps} isDragging={true} />);

      const row = container.querySelector('[data-file-item]');
      expect(row).toHaveClass('opacity-50');
    });

    it('선택된 경우 선택 스타일이 적용된다', () => {
      const { container } = render(<WebhardFileItem {...defaultProps} isSelected={true} />);

      const row = container.querySelector('[data-file-item]');
      expect(row).toHaveClass('bg-brand-light');
    });

    it('미리보기 가능 파일이어도 hover preview ring 스타일을 적용하지 않는다', () => {
      const { container } = render(<WebhardFileItem {...defaultProps} canPreview={true} />);

      const row = container.querySelector('[data-file-item]');
      expect(row).not.toHaveClass('hover:ring-2');
      expect(row).not.toHaveClass('hover:ring-brand/30');
    });
  });
});
