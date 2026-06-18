/**
 * WebhardDragSelection 컴포넌트 테스트
 * TDD: 테스트 먼저 작성
 */
import '@testing-library/jest-dom';
import { render } from '@testing-library/react';
import { WebhardDragSelection } from '@/app/webhard/components/WebhardDragSelection';

describe('WebhardDragSelection', () => {
  describe('렌더링', () => {
    it('isDragSelecting이 false면 아무것도 렌더링되지 않는다', () => {
      const { container } = render(
        <WebhardDragSelection isDragSelecting={false} boundingRect={null} />
      );

      expect(container.firstChild).toBeNull();
    });

    it('boundingRect가 null이면 아무것도 렌더링되지 않는다', () => {
      const { container } = render(
        <WebhardDragSelection isDragSelecting={true} boundingRect={null} />
      );

      expect(container.firstChild).toBeNull();
    });

    it('isDragSelecting이 true이고 boundingRect가 있으면 선택 박스가 렌더링된다', () => {
      const { container } = render(
        <WebhardDragSelection
          isDragSelecting={true}
          boundingRect={{
            left: 100,
            top: 200,
            width: 300,
            height: 150,
            right: 400,
            bottom: 350,
          }}
        />
      );

      const selectionBox = container.firstChild;
      expect(selectionBox).toBeInTheDocument();
    });
  });

  describe('스타일', () => {
    it('올바른 위치와 크기가 적용된다', () => {
      const { container } = render(
        <WebhardDragSelection
          isDragSelecting={true}
          boundingRect={{
            left: 50,
            top: 100,
            width: 200,
            height: 150,
            right: 250,
            bottom: 250,
          }}
        />
      );

      const selectionBox = container.firstChild as HTMLElement;
      expect(selectionBox.style.left).toBe('50px');
      expect(selectionBox.style.top).toBe('100px');
      expect(selectionBox.style.width).toBe('200px');
      expect(selectionBox.style.height).toBe('150px');
    });

    it('기본 스타일 클래스가 적용된다', () => {
      const { container } = render(
        <WebhardDragSelection
          isDragSelecting={true}
          boundingRect={{
            left: 0,
            top: 0,
            width: 100,
            height: 100,
            right: 100,
            bottom: 100,
          }}
        />
      );

      const selectionBox = container.firstChild as HTMLElement;
      expect(selectionBox).toHaveClass('absolute');
      expect(selectionBox).toHaveClass('border-2');
      expect(selectionBox).toHaveClass('pointer-events-none');
    });

    it('z-index가 적용된다', () => {
      const { container } = render(
        <WebhardDragSelection
          isDragSelecting={true}
          boundingRect={{
            left: 0,
            top: 0,
            width: 100,
            height: 100,
            right: 100,
            bottom: 100,
          }}
        />
      );

      const selectionBox = container.firstChild as HTMLElement;
      expect(selectionBox).toHaveClass('z-40');
    });
  });
});
