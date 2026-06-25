/**
 * WebhardColumnHeader 컴포넌트 테스트
 * TDD: 테스트 먼저 작성
 */
import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import { WebhardColumnHeader } from '@/app/webhard/components/WebhardColumnHeader';

// 모킹
const mockOnSort = jest.fn();
const mockOnSelectAll = jest.fn();
const mockOnColumnResizeStart = jest.fn();

const defaultProps = {
  sortBy: 'date' as const,
  sortOrder: 'desc' as const,
  fileNameColWidth: 60,
  dateColWidth: 20,
  filesCount: 10,
  selectedCount: 0,
  onSort: mockOnSort,
  onSelectAll: mockOnSelectAll,
  onColumnResizeStart: mockOnColumnResizeStart,
};

describe('WebhardColumnHeader', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('렌더링', () => {
    it('모든 컬럼 헤더가 렌더링된다', () => {
      render(<WebhardColumnHeader {...defaultProps} />);

      expect(screen.getByText('파일명')).toBeInTheDocument();
      expect(screen.getByText('업로드날짜')).toBeInTheDocument();
      expect(screen.getByText('업로더')).toBeInTheDocument();
    });

    it('체크박스가 렌더링된다', () => {
      render(<WebhardColumnHeader {...defaultProps} />);

      const checkbox = screen.getByRole('checkbox');
      expect(checkbox).toBeInTheDocument();
    });

    it('정렬 아이콘이 렌더링된다', () => {
      const { container } = render(<WebhardColumnHeader {...defaultProps} />);

      // 3개의 컬럼에 각각 정렬 아이콘이 있어야 함
      const svgIcons = container.querySelectorAll('svg');
      expect(svgIcons.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('체크박스 상태', () => {
    it('아무것도 선택되지 않으면 체크박스가 해제된다', () => {
      render(<WebhardColumnHeader {...defaultProps} selectedCount={0} />);

      const checkbox = screen.getByRole('checkbox');
      expect(checkbox).not.toBeChecked();
    });

    it('모든 파일이 선택되면 체크박스가 체크된다', () => {
      render(<WebhardColumnHeader {...defaultProps} filesCount={5} selectedCount={5} />);

      const checkbox = screen.getByRole('checkbox');
      expect(checkbox).toBeChecked();
    });

    it('파일이 없으면 체크박스가 체크되지 않는다', () => {
      render(<WebhardColumnHeader {...defaultProps} filesCount={0} selectedCount={0} />);

      const checkbox = screen.getByRole('checkbox');
      expect(checkbox).not.toBeChecked();
    });
  });

  describe('정렬 아이콘 상태', () => {
    it('정렬된 컬럼에 활성 정렬 아이콘이 표시된다', () => {
      const { container } = render(
        <WebhardColumnHeader {...defaultProps} sortBy="name" sortOrder="asc" />
      );

      // FaSortUp 아이콘 (오름차순) - brand 토큰
      const sortIcons = container.querySelectorAll('.text-brand');
      expect(sortIcons.length).toBeGreaterThanOrEqual(1);
    });

    it('정렬되지 않은 컬럼에 비활성 정렬 아이콘이 표시된다', () => {
      const { container } = render(
        <WebhardColumnHeader {...defaultProps} sortBy="name" sortOrder="asc" />
      );

      // FaSort 아이콘 (비활성) - 회색
      const inactiveIcons = container.querySelectorAll('.text-gray-400');
      expect(inactiveIcons.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('이벤트 핸들러', () => {
    it('체크박스 클릭 시 onSelectAll이 호출된다', () => {
      render(<WebhardColumnHeader {...defaultProps} />);

      const checkbox = screen.getByRole('checkbox');
      fireEvent.click(checkbox);

      expect(mockOnSelectAll).toHaveBeenCalledWith(true);
    });

    it('파일명 클릭 시 onSort("name")가 호출된다', () => {
      render(<WebhardColumnHeader {...defaultProps} />);

      fireEvent.click(screen.getByText('파일명'));

      expect(mockOnSort).toHaveBeenCalledWith('name');
    });

    it('업로드날짜 클릭 시 onSort("date")가 호출된다', () => {
      render(<WebhardColumnHeader {...defaultProps} />);

      fireEvent.click(screen.getByText('업로드날짜'));

      expect(mockOnSort).toHaveBeenCalledWith('date');
    });

    it('업로더 클릭 시 onSort("uploader")가 호출된다', () => {
      render(<WebhardColumnHeader {...defaultProps} />);

      fireEvent.click(screen.getByText('업로더'));

      expect(mockOnSort).toHaveBeenCalledWith('uploader');
    });
  });

  describe('컬럼 너비', () => {
    it('파일명 컬럼 너비가 적용된다', () => {
      const { container } = render(<WebhardColumnHeader {...defaultProps} fileNameColWidth={70} />);

      // style 속성에 70%가 포함되어 있는지 확인
      const fileNameCol = container.querySelector('[style*="70%"]');
      expect(fileNameCol).toBeInTheDocument();
    });

    it('날짜 컬럼 너비가 적용된다', () => {
      const { container } = render(<WebhardColumnHeader {...defaultProps} dateColWidth={25} />);

      const dateCol = container.querySelector('[style*="25%"]');
      expect(dateCol).toBeInTheDocument();
    });
  });

  describe('리사이즈 핸들', () => {
    it('파일명 컬럼에 리사이즈 핸들이 있다', () => {
      const { container } = render(<WebhardColumnHeader {...defaultProps} />);

      const resizeHandles = container.querySelectorAll('.cursor-col-resize');
      expect(resizeHandles.length).toBe(2); // 파일명, 날짜 컬럼
    });
  });
});
