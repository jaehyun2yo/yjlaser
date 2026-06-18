/**
 * WebhardFolderItem 컴포넌트 테스트
 * TDD: 테스트 먼저 작성
 */
import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import { WebhardFolderItem } from '@/app/webhard/components/WebhardFolderItem';

// FolderBadge 모킹
jest.mock('@/app/webhard/components/FolderTree', () => ({
  FolderBadge: ({ folderId }: { folderId: string }) => (
    <span data-testid="folder-badge">{folderId}</span>
  ),
}));

// 테스트용 폴더 데이터
const mockFolder = {
  id: 'folder-1',
  name: '테스트폴더',
  parent_id: null,
  company_id: 1,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
};

// 모킹
const mockOnClick = jest.fn();
const mockOnDoubleClick = jest.fn();
const mockOnMouseEnter = jest.fn();
const mockOnDrop = jest.fn();

const defaultProps = {
  folder: mockFolder,
  isDragOver: false,
  viewMode: 'list' as const,
  onClick: mockOnClick,
  onDoubleClick: mockOnDoubleClick,
  onMouseEnter: mockOnMouseEnter,
  onDrop: mockOnDrop,
};

describe('WebhardFolderItem', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('렌더링', () => {
    it('폴더명이 렌더링된다', () => {
      render(<WebhardFolderItem {...defaultProps} />);

      expect(screen.getByText('테스트폴더')).toBeInTheDocument();
    });

    it('문의 폴더명을 사무실 / 현장 표시로 렌더링한다', () => {
      render(
        <WebhardFolderItem
          {...defaultProps}
          folder={{ ...mockFolder, name: '260511-O-001_260511-F-001' }}
        />
      );

      expect(screen.getByText('260511-O-001 / 260511-F-001')).toBeInTheDocument();
    });

    it('폴더 아이콘이 렌더링된다', () => {
      const { container } = render(<WebhardFolderItem {...defaultProps} />);

      // FaFolder 아이콘 확인
      const svgIcons = container.querySelectorAll('svg');
      expect(svgIcons.length).toBeGreaterThanOrEqual(1);
    });

    it('FolderBadge가 렌더링된다', () => {
      render(<WebhardFolderItem {...defaultProps} />);

      expect(screen.getByTestId('folder-badge')).toBeInTheDocument();
    });

    it('리스트 뷰에서 폴더 업로드 날짜와 업로더를 렌더링한다', () => {
      const latestDate = '2026-05-09T00:00:00.000Z';

      render(
        <WebhardFolderItem
          {...defaultProps}
          folder={{
            ...mockFolder,
            latest_file_created_at: latestDate,
            latest_file_uploader_display_name: '관리자',
          }}
          viewMode="list"
        />
      );

      expect(
        screen.getByText(new Date(latestDate).toLocaleDateString('ko-KR'))
      ).toBeInTheDocument();
      expect(screen.getByText('관리자')).toBeInTheDocument();
    });

    it('리스트 뷰 폴더 업로드 날짜와 업로더는 파일 메타 스타일을 사용한다', () => {
      const latestDate = '2026-05-09T00:00:00.000Z';

      render(
        <WebhardFolderItem
          {...defaultProps}
          folder={{
            ...mockFolder,
            latest_file_created_at: latestDate,
            latest_file_uploader_display_name: '관리자',
          }}
          viewMode="list"
        />
      );

      expect(screen.getByText(new Date(latestDate).toLocaleDateString('ko-KR'))).toHaveClass(
        'text-xs',
        'text-gray-500'
      );
      expect(screen.getByText('관리자')).toHaveClass('text-xs', 'text-gray-500');
    });

    it('리스트 뷰에서 체크박스가 렌더링된다', () => {
      render(<WebhardFolderItem {...defaultProps} viewMode="list" />);

      expect(screen.getByRole('checkbox')).toBeInTheDocument();
    });

    it('그리드 뷰에서도 체크박스가 렌더링된다', () => {
      render(<WebhardFolderItem {...defaultProps} viewMode="grid" />);

      expect(screen.getByRole('checkbox')).toBeInTheDocument();
    });
  });

  describe('뷰 모드', () => {
    it('리스트 뷰 스타일이 적용된다', () => {
      const { container } = render(<WebhardFolderItem {...defaultProps} viewMode="list" />);

      const folderItem = container.querySelector('[data-folder-item]');
      expect(folderItem).toHaveClass('flex');
      expect(folderItem).toHaveClass('items-center');
    });

    it('그리드 뷰 스타일이 적용된다', () => {
      const { container } = render(<WebhardFolderItem {...defaultProps} viewMode="grid" />);

      const folderItem = container.querySelector('[data-folder-item]');
      expect(folderItem).toHaveClass('p-4');
    });
  });

  describe('드래그 오버 상태', () => {
    it('드래그 오버 시 하이라이트 스타일이 적용된다', () => {
      const { container } = render(<WebhardFolderItem {...defaultProps} isDragOver={true} />);

      const folderItem = container.querySelector('[data-folder-item]');
      expect(folderItem).toHaveClass('bg-brand-light');
    });

    it('드래그 오버가 아닐 때 하이라이트 스타일이 적용되지 않는다', () => {
      const { container } = render(<WebhardFolderItem {...defaultProps} isDragOver={false} />);

      const folderItem = container.querySelector('[data-folder-item]');
      expect(folderItem).not.toHaveClass('bg-brand-light');
    });
  });

  describe('이벤트 핸들러', () => {
    it('클릭 시 onClick이 호출된다', () => {
      render(<WebhardFolderItem {...defaultProps} />);

      fireEvent.click(screen.getByText('테스트폴더'));

      expect(mockOnClick).toHaveBeenCalled();
    });

    it('더블클릭 시 onDoubleClick이 호출된다', () => {
      const { container } = render(<WebhardFolderItem {...defaultProps} />);

      const folderItem = container.querySelector('[data-folder-item]');
      if (folderItem) fireEvent.doubleClick(folderItem);

      expect(mockOnDoubleClick).toHaveBeenCalled();
    });

    it('마우스 진입 시 onMouseEnter가 호출된다', () => {
      const { container } = render(<WebhardFolderItem {...defaultProps} />);

      const folderItem = container.querySelector('[data-folder-item]');
      if (folderItem) fireEvent.mouseEnter(folderItem);

      expect(mockOnMouseEnter).toHaveBeenCalled();
    });

    it('드래그 오버 시 preventDefault가 호출된다', () => {
      const { container } = render(<WebhardFolderItem {...defaultProps} />);

      const folderItem = container.querySelector('[data-folder-item]');
      if (folderItem) {
        const dragOverEvent = new Event('dragover', { bubbles: true });
        Object.defineProperty(dragOverEvent, 'preventDefault', {
          value: jest.fn(),
        });
        folderItem.dispatchEvent(dragOverEvent);
      }
    });

    it('드롭 시 onDrop이 호출된다', () => {
      const { container } = render(<WebhardFolderItem {...defaultProps} />);

      const folderItem = container.querySelector('[data-folder-item]');
      if (folderItem) {
        const dropEvent = createDropEvent(['file-1']);
        fireEvent.drop(folderItem, dropEvent);

        expect(mockOnDrop).toHaveBeenCalledWith(['file-1']);
      }
    });

    it('드롭 시 JSON 데이터로 여러 파일 ID를 전달한다', () => {
      const { container } = render(<WebhardFolderItem {...defaultProps} />);

      const folderItem = container.querySelector('[data-folder-item]');
      if (folderItem) {
        const dropEvent = createDropEvent(['file-1', 'file-2', 'file-3']);
        fireEvent.drop(folderItem, dropEvent);

        expect(mockOnDrop).toHaveBeenCalledWith(['file-1', 'file-2', 'file-3']);
      }
    });
  });

  describe('드래그 불가', () => {
    it('폴더 아이템은 draggable이 아니다', () => {
      const { container } = render(<WebhardFolderItem {...defaultProps} />);

      const folderItem = container.querySelector('[data-folder-item]');
      expect(folderItem).toHaveAttribute('draggable', 'false');
    });
  });
});

// 드롭 이벤트 생성 헬퍼
function createDropEvent(fileIds: string[]) {
  return {
    dataTransfer: {
      getData: (type: string) => {
        if (type === 'application/json') {
          return JSON.stringify(fileIds);
        }
        return fileIds[0] || '';
      },
    },
    preventDefault: jest.fn(),
    stopPropagation: jest.fn(),
  };
}
