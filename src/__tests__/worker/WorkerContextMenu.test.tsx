/**
 * WorkerContextMenu 컴포넌트 테스트
 * - 재분류 섹션 표시/숨김 (canReclassify)
 * - 현재 inquiry_type 항목 disabled
 * - 재분류 클릭 → onReclassify + onClose 호출
 * - 기존 긴급/분할 회귀
 */

import { render, screen, fireEvent } from '@testing-library/react';
import { WorkerContextMenu } from '@/app/worker/_components/WorkerContextMenu';
import type { InquiryType } from '@/lib/types';

describe('WorkerContextMenu', () => {
  describe('재분류 섹션', () => {
    it('canReclassify: false → 재분류 항목 렌더 안 됨', () => {
      render(
        <WorkerContextMenu
          x={10}
          y={10}
          isUrgent={false}
          canSplit={false}
          canReclassify={false}
          onReclassify={jest.fn()}
          onToggleUrgent={jest.fn()}
          onClose={jest.fn()}
        />
      );

      expect(screen.queryByRole('menuitem', { name: '칼선의뢰로 변경' })).toBeNull();
      expect(screen.queryByRole('menuitem', { name: '목형의뢰로 변경' })).toBeNull();
    });

    it('canReclassify: true → 2개 재분류 항목 렌더', () => {
      render(
        <WorkerContextMenu
          x={10}
          y={10}
          isUrgent={false}
          canSplit={false}
          currentInquiryType="cutting_request"
          canReclassify={true}
          onReclassify={jest.fn()}
          onToggleUrgent={jest.fn()}
          onClose={jest.fn()}
        />
      );

      expect(screen.getByRole('menuitem', { name: '칼선의뢰로 변경' })).toBeInTheDocument();
      expect(screen.getByRole('menuitem', { name: '목형의뢰로 변경' })).toBeInTheDocument();
    });

    it('currentInquiryType === "mold_request" → "목형의뢰로 변경" disabled', () => {
      render(
        <WorkerContextMenu
          x={10}
          y={10}
          isUrgent={false}
          canSplit={false}
          currentInquiryType="mold_request"
          canReclassify={true}
          onReclassify={jest.fn()}
          onToggleUrgent={jest.fn()}
          onClose={jest.fn()}
        />
      );

      const cuttingItem = screen.getByRole('menuitem', { name: '칼선의뢰로 변경' });
      const moldItem = screen.getByRole('menuitem', { name: '목형의뢰로 변경' });
      expect(cuttingItem).not.toBeDisabled();
      expect(moldItem).toBeDisabled();
    });

    it('"칼선의뢰" 클릭 → onReclassify("cutting_request") + onClose 호출', () => {
      const onReclassify = jest.fn<void, [InquiryType]>();
      const onClose = jest.fn();
      render(
        <WorkerContextMenu
          x={10}
          y={10}
          isUrgent={false}
          canSplit={false}
          currentInquiryType="mold_request"
          canReclassify={true}
          onReclassify={onReclassify}
          onToggleUrgent={jest.fn()}
          onClose={onClose}
        />
      );

      fireEvent.click(screen.getByRole('menuitem', { name: '칼선의뢰로 변경' }));

      expect(onReclassify).toHaveBeenCalledTimes(1);
      expect(onReclassify).toHaveBeenCalledWith('cutting_request');
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  describe('기존 긴급/분할 회귀', () => {
    it('기본 props로 렌더 시 긴급 배치 항목 표시', () => {
      render(
        <WorkerContextMenu
          x={10}
          y={10}
          isUrgent={false}
          canSplit={false}
          canReclassify={false}
          onReclassify={jest.fn()}
          onToggleUrgent={jest.fn()}
          onClose={jest.fn()}
        />
      );

      expect(screen.getByText('긴급 배치')).toBeInTheDocument();
    });

    it('isUrgent: true → "긴급 해제" 표시', () => {
      render(
        <WorkerContextMenu
          x={10}
          y={10}
          isUrgent={true}
          canSplit={false}
          canReclassify={false}
          onReclassify={jest.fn()}
          onToggleUrgent={jest.fn()}
          onClose={jest.fn()}
        />
      );

      expect(screen.getByText('긴급 해제')).toBeInTheDocument();
    });

    it('canSplit: true + onSplit 제공 → "도면 분할" 항목 표시', () => {
      render(
        <WorkerContextMenu
          x={10}
          y={10}
          isUrgent={false}
          canSplit={true}
          canReclassify={false}
          onReclassify={jest.fn()}
          onToggleUrgent={jest.fn()}
          onSplit={jest.fn()}
          onClose={jest.fn()}
        />
      );

      expect(screen.getByText('도면 분할')).toBeInTheDocument();
    });

    it('긴급 클릭 → onToggleUrgent + onClose 호출', () => {
      const onToggleUrgent = jest.fn();
      const onClose = jest.fn();
      render(
        <WorkerContextMenu
          x={10}
          y={10}
          isUrgent={false}
          canSplit={false}
          canReclassify={false}
          onReclassify={jest.fn()}
          onToggleUrgent={onToggleUrgent}
          onClose={onClose}
        />
      );

      fireEvent.click(screen.getByText('긴급 배치'));

      expect(onToggleUrgent).toHaveBeenCalledTimes(1);
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('분할 클릭 → onSplit + onClose 호출', () => {
      const onSplit = jest.fn();
      const onClose = jest.fn();
      render(
        <WorkerContextMenu
          x={10}
          y={10}
          isUrgent={false}
          canSplit={true}
          canReclassify={false}
          onReclassify={jest.fn()}
          onToggleUrgent={jest.fn()}
          onSplit={onSplit}
          onClose={onClose}
        />
      );

      fireEvent.click(screen.getByText('도면 분할'));

      expect(onSplit).toHaveBeenCalledTimes(1);
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  describe('정보 보기 (Phase 4)', () => {
    it('onViewInfo prop 없으면 "정보 보기" 메뉴 항목 렌더 안 됨', () => {
      render(
        <WorkerContextMenu
          x={10}
          y={10}
          isUrgent={false}
          canSplit={false}
          canReclassify={false}
          onReclassify={jest.fn()}
          onToggleUrgent={jest.fn()}
          onClose={jest.fn()}
        />
      );

      expect(screen.queryByRole('menuitem', { name: '정보 보기' })).toBeNull();
    });

    it('onViewInfo prop 전달 시 "정보 보기" 메뉴 항목 렌더', () => {
      render(
        <WorkerContextMenu
          x={10}
          y={10}
          isUrgent={false}
          canSplit={false}
          canReclassify={false}
          onReclassify={jest.fn()}
          onToggleUrgent={jest.fn()}
          onViewInfo={jest.fn()}
          onClose={jest.fn()}
        />
      );

      expect(screen.getByRole('menuitem', { name: '정보 보기' })).toBeInTheDocument();
    });

    it('"정보 보기" 클릭 시 onViewInfo + onClose 호출', () => {
      const onViewInfo = jest.fn();
      const onClose = jest.fn();
      render(
        <WorkerContextMenu
          x={10}
          y={10}
          isUrgent={false}
          canSplit={false}
          canReclassify={false}
          onReclassify={jest.fn()}
          onToggleUrgent={jest.fn()}
          onViewInfo={onViewInfo}
          onClose={onClose}
        />
      );

      fireEvent.click(screen.getByRole('menuitem', { name: '정보 보기' }));

      expect(onViewInfo).toHaveBeenCalledTimes(1);
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  describe('상호작용', () => {
    it('ESC 키 → onClose 호출', () => {
      const onClose = jest.fn();
      render(
        <WorkerContextMenu
          x={10}
          y={10}
          isUrgent={false}
          canSplit={false}
          canReclassify={false}
          onReclassify={jest.fn()}
          onToggleUrgent={jest.fn()}
          onClose={onClose}
        />
      );

      fireEvent.keyDown(document, { key: 'Escape' });

      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('메뉴 외부 mousedown → onClose 호출', () => {
      const onClose = jest.fn();
      render(
        <WorkerContextMenu
          x={10}
          y={10}
          isUrgent={false}
          canSplit={false}
          canReclassify={false}
          onReclassify={jest.fn()}
          onToggleUrgent={jest.fn()}
          onClose={onClose}
        />
      );

      fireEvent.mouseDown(document.body);

      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });
});
