/**
 * WebhardBreadcrumb 컴포넌트 테스트
 * TDD: 테스트 먼저 작성
 */
import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import { WebhardBreadcrumb } from '@/app/webhard/components/WebhardBreadcrumb';

// 테스트용 폴더 데이터
const mockFolders = [
  { id: 'folder-1', name: '업로드' },
  { id: 'folder-2', name: '2024년' },
  { id: 'folder-3', name: '12월' },
];

// 모킹
const mockOnFolderSelect = jest.fn();

describe('WebhardBreadcrumb', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('렌더링', () => {
    it('Home 링크가 항상 렌더링된다', () => {
      render(
        <WebhardBreadcrumb
          breadcrumbPath={[]}
          selectedFolderId={null}
          isNewFilesMode={false}
          onFolderSelect={mockOnFolderSelect}
        />
      );

      expect(screen.getByText('Home')).toBeInTheDocument();
    });

    it('breadcrumb 경로가 올바르게 렌더링된다', () => {
      render(
        <WebhardBreadcrumb
          breadcrumbPath={mockFolders}
          selectedFolderId="folder-3"
          isNewFilesMode={false}
          onFolderSelect={mockOnFolderSelect}
        />
      );

      expect(screen.getByText('Home')).toBeInTheDocument();
      expect(screen.getByText('업로드')).toBeInTheDocument();
      expect(screen.getByText('2024년')).toBeInTheDocument();
      expect(screen.getByText('12월')).toBeInTheDocument();
    });

    it('문의 폴더명을 사무실 / 현장 표시로 렌더링한다', () => {
      render(
        <WebhardBreadcrumb
          breadcrumbPath={[{ id: 'folder-inquiry', name: '260511-O-001_260511-F-001' }]}
          selectedFolderId="folder-inquiry"
          isNewFilesMode={false}
          onFolderSelect={mockOnFolderSelect}
        />
      );

      expect(screen.getByText('260511-O-001 / 260511-F-001')).toBeInTheDocument();
    });

    it('새 파일 모드일 때 "새 파일" 텍스트가 표시된다', () => {
      render(
        <WebhardBreadcrumb
          breadcrumbPath={[]}
          selectedFolderId={null}
          isNewFilesMode={true}
          onFolderSelect={mockOnFolderSelect}
        />
      );

      expect(screen.getByText('새 파일')).toBeInTheDocument();
    });

    it('새 파일 모드일 때 breadcrumb 경로가 표시되지 않는다', () => {
      render(
        <WebhardBreadcrumb
          breadcrumbPath={mockFolders}
          selectedFolderId="folder-3"
          isNewFilesMode={true}
          onFolderSelect={mockOnFolderSelect}
        />
      );

      expect(screen.getByText('새 파일')).toBeInTheDocument();
      expect(screen.queryByText('업로드')).not.toBeInTheDocument();
      expect(screen.queryByText('2024년')).not.toBeInTheDocument();
      expect(screen.queryByText('12월')).not.toBeInTheDocument();
    });
  });

  describe('스타일', () => {
    it('Home이 선택되었을 때 하이라이트된다', () => {
      render(
        <WebhardBreadcrumb
          breadcrumbPath={[]}
          selectedFolderId={null}
          isNewFilesMode={false}
          onFolderSelect={mockOnFolderSelect}
        />
      );

      const homeLink = screen.getByText('Home');
      expect(homeLink).toHaveClass('text-brand');
    });

    it('현재 폴더가 하이라이트된다', () => {
      render(
        <WebhardBreadcrumb
          breadcrumbPath={mockFolders}
          selectedFolderId="folder-2"
          isNewFilesMode={false}
          onFolderSelect={mockOnFolderSelect}
        />
      );

      const selectedFolder = screen.getByText('2024년');
      expect(selectedFolder).toHaveClass('text-brand');
    });

    it('새 파일 모드일 때 "새 파일"이 하이라이트된다', () => {
      render(
        <WebhardBreadcrumb
          breadcrumbPath={[]}
          selectedFolderId={null}
          isNewFilesMode={true}
          onFolderSelect={mockOnFolderSelect}
        />
      );

      const newFilesText = screen.getByText('새 파일');
      expect(newFilesText.closest('span')).toHaveClass('text-brand');
    });
  });

  describe('이벤트 핸들러', () => {
    it('Home 클릭 시 onFolderSelect(null)이 호출된다', () => {
      render(
        <WebhardBreadcrumb
          breadcrumbPath={mockFolders}
          selectedFolderId="folder-3"
          isNewFilesMode={false}
          onFolderSelect={mockOnFolderSelect}
        />
      );

      fireEvent.click(screen.getByText('Home'));

      expect(mockOnFolderSelect).toHaveBeenCalledWith(null);
    });

    it('폴더 클릭 시 해당 폴더 ID로 onFolderSelect가 호출된다', () => {
      render(
        <WebhardBreadcrumb
          breadcrumbPath={mockFolders}
          selectedFolderId="folder-3"
          isNewFilesMode={false}
          onFolderSelect={mockOnFolderSelect}
        />
      );

      fireEvent.click(screen.getByText('2024년'));

      expect(mockOnFolderSelect).toHaveBeenCalledWith('folder-2');
    });

    it('새 파일 모드에서 Home 클릭 시 onFolderSelect(null)이 호출된다', () => {
      render(
        <WebhardBreadcrumb
          breadcrumbPath={[]}
          selectedFolderId={null}
          isNewFilesMode={true}
          onFolderSelect={mockOnFolderSelect}
        />
      );

      fireEvent.click(screen.getByText('Home'));

      expect(mockOnFolderSelect).toHaveBeenCalledWith(null);
    });
  });

  describe('구분자', () => {
    it('폴더 사이에 구분자(chevron)가 렌더링된다', () => {
      const { container } = render(
        <WebhardBreadcrumb
          breadcrumbPath={mockFolders}
          selectedFolderId="folder-3"
          isNewFilesMode={false}
          onFolderSelect={mockOnFolderSelect}
        />
      );

      // SVG 구분자 아이콘 확인 (FaChevronRight)
      const separators = container.querySelectorAll('svg');
      expect(separators.length).toBe(3); // 3개 폴더 = 3개 구분자
    });

    it('새 파일 모드에서도 구분자가 렌더링된다', () => {
      const { container } = render(
        <WebhardBreadcrumb
          breadcrumbPath={[]}
          selectedFolderId={null}
          isNewFilesMode={true}
          onFolderSelect={mockOnFolderSelect}
        />
      );

      // 새 파일 모드: 1개의 chevron + 1개의 star icon
      const svgs = container.querySelectorAll('svg');
      expect(svgs.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('추가 props', () => {
    it('className prop이 적용된다', () => {
      const { container } = render(
        <WebhardBreadcrumb
          breadcrumbPath={[]}
          selectedFolderId={null}
          isNewFilesMode={false}
          onFolderSelect={mockOnFolderSelect}
          className="custom-class"
        />
      );

      expect(container.firstChild).toHaveClass('custom-class');
    });
  });
});
