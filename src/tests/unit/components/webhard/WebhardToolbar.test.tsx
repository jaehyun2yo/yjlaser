/**
 * WebhardToolbar 컴포넌트 테스트
 * TDD: 테스트 먼저 작성
 */
import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import { WebhardToolbar } from '@/app/webhard/components/WebhardToolbar';

// 모킹
const mockOnMarkAllDownloaded = jest.fn();
const mockOnDownload = jest.fn();
const mockOnMove = jest.fn();
const mockOnDelete = jest.fn();

const defaultProps = {
  selectedCount: 0,
  onMarkAllDownloaded: mockOnMarkAllDownloaded,
  onDownload: mockOnDownload,
  onMove: mockOnMove,
  onDelete: mockOnDelete,
};

describe('WebhardToolbar', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('렌더링', () => {
    it('모든 액션 버튼이 렌더링된다', () => {
      render(<WebhardToolbar {...defaultProps} />);

      expect(screen.getByTitle(/확인 처리/i)).toBeInTheDocument();
      expect(screen.getByTitle(/다운로드/i)).toBeInTheDocument();
      expect(screen.getByTitle(/이동/i)).toBeInTheDocument();
      expect(screen.getByTitle(/삭제/i)).toBeInTheDocument();
    });

    it('삭제 권한이 없으면 삭제 버튼을 렌더링하지 않는다', () => {
      render(<WebhardToolbar {...defaultProps} canDelete={false} />);

      expect(screen.queryByTitle(/삭제/i)).not.toBeInTheDocument();
    });

    it('선택된 파일이 없으면 카운트가 표시되지 않는다', () => {
      render(<WebhardToolbar {...defaultProps} selectedCount={0} />);

      expect(screen.queryByText(/개 선택/)).not.toBeInTheDocument();
    });

    it('선택된 파일 수가 표시된다', () => {
      render(<WebhardToolbar {...defaultProps} selectedCount={5} />);

      expect(screen.getByText('5개 선택')).toBeInTheDocument();
    });
  });

  describe('버튼 상태', () => {
    it('선택된 파일이 없으면 다운로드, 이동, 삭제 버튼이 비활성화된다', () => {
      render(<WebhardToolbar {...defaultProps} selectedCount={0} />);

      expect(screen.getByTitle(/다운로드/i)).toBeDisabled();
      expect(screen.getByTitle(/이동/i)).toBeDisabled();
      expect(screen.getByTitle(/삭제/i)).toBeDisabled();
    });

    it('확인처리 버튼은 항상 활성화된다', () => {
      render(<WebhardToolbar {...defaultProps} selectedCount={0} />);

      expect(screen.getByTitle(/확인 처리/i)).not.toBeDisabled();
    });

    it('선택된 파일이 있으면 모든 버튼이 활성화된다', () => {
      render(<WebhardToolbar {...defaultProps} selectedCount={3} />);

      expect(screen.getByTitle(/확인 처리/i)).not.toBeDisabled();
      expect(screen.getByTitle(/다운로드/i)).not.toBeDisabled();
      expect(screen.getByTitle(/이동/i)).not.toBeDisabled();
      expect(screen.getByTitle(/삭제/i)).not.toBeDisabled();
    });
  });

  describe('이벤트 핸들러', () => {
    it('확인처리 버튼 클릭 시 onMarkAllDownloaded가 호출된다', () => {
      render(<WebhardToolbar {...defaultProps} selectedCount={3} />);

      fireEvent.click(screen.getByTitle(/확인 처리/i));

      expect(mockOnMarkAllDownloaded).toHaveBeenCalledTimes(1);
    });

    it('다운로드 버튼 클릭 시 onDownload가 호출된다', () => {
      render(<WebhardToolbar {...defaultProps} selectedCount={3} />);

      fireEvent.click(screen.getByTitle(/다운로드/i));

      expect(mockOnDownload).toHaveBeenCalledTimes(1);
    });

    it('이동 버튼 클릭 시 onMove가 호출된다', () => {
      render(<WebhardToolbar {...defaultProps} selectedCount={3} />);

      fireEvent.click(screen.getByTitle(/이동/i));

      expect(mockOnMove).toHaveBeenCalledTimes(1);
    });

    it('삭제 버튼 클릭 시 onDelete가 호출된다', () => {
      render(<WebhardToolbar {...defaultProps} selectedCount={3} />);

      fireEvent.click(screen.getByTitle(/삭제/i));

      expect(mockOnDelete).toHaveBeenCalledTimes(1);
    });

    it('비활성화된 버튼은 클릭해도 핸들러가 호출되지 않는다', () => {
      render(<WebhardToolbar {...defaultProps} selectedCount={0} />);

      fireEvent.click(screen.getByTitle(/다운로드/i));
      fireEvent.click(screen.getByTitle(/이동/i));
      fireEvent.click(screen.getByTitle(/삭제/i));

      expect(mockOnDownload).not.toHaveBeenCalled();
      expect(mockOnMove).not.toHaveBeenCalled();
      expect(mockOnDelete).not.toHaveBeenCalled();
    });
  });

  describe('로딩 상태', () => {
    it('다운로드 중일 때 다운로드 버튼이 비활성화된다', () => {
      render(<WebhardToolbar {...defaultProps} selectedCount={3} isDownloading />);

      expect(screen.getByTitle(/다운로드/i)).toBeDisabled();
    });

    it('삭제 중일 때 삭제 버튼이 비활성화된다', () => {
      render(<WebhardToolbar {...defaultProps} selectedCount={3} isDeleting />);

      expect(screen.getByTitle(/삭제/i)).toBeDisabled();
    });

    it('이동 중일 때 이동 버튼이 비활성화된다', () => {
      render(<WebhardToolbar {...defaultProps} selectedCount={3} isMoving />);

      expect(screen.getByTitle(/이동/i)).toBeDisabled();
    });
  });

  describe('접근성', () => {
    it('버튼에 적절한 title이 있다', () => {
      render(<WebhardToolbar {...defaultProps} selectedCount={0} />);

      expect(screen.getByTitle(/새 파일 확인 처리/i)).toBeInTheDocument();
      expect(screen.getByTitle(/선택한 파일 다운로드/i)).toBeInTheDocument();
      expect(screen.getByTitle(/선택한 파일 이동/i)).toBeInTheDocument();
      expect(screen.getByTitle(/선택한 파일 삭제/i)).toBeInTheDocument();
    });

    it('선택된 파일이 있을 때 확인처리 title이 변경된다', () => {
      render(<WebhardToolbar {...defaultProps} selectedCount={3} />);

      expect(screen.getByTitle(/선택한 파일 확인 처리/i)).toBeInTheDocument();
    });
  });
});
