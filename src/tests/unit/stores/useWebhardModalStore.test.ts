/**
 * useWebhardModalStore 테스트
 * TDD: 테스트 먼저 작성
 */
import { act, renderHook } from '@testing-library/react';

// 스토어는 아직 구현되지 않음 - TDD
import { useWebhardModalStore, ModalType } from '@/store/webhard/useWebhardModalStore';

describe('useWebhardModalStore', () => {
  beforeEach(() => {
    const { result } = renderHook(() => useWebhardModalStore());
    act(() => {
      result.current.closeModal();
    });
  });

  describe('초기 상태', () => {
    it('activeModal이 null이어야 한다', () => {
      const { result } = renderHook(() => useWebhardModalStore());
      expect(result.current.activeModal).toBeNull();
    });

    it('modalData가 빈 객체여야 한다', () => {
      const { result } = renderHook(() => useWebhardModalStore());
      expect(result.current.modalData).toEqual({});
    });
  });

  describe('openModal', () => {
    it('모달을 열면 activeModal이 설정된다', () => {
      const { result } = renderHook(() => useWebhardModalStore());

      act(() => {
        result.current.openModal('settings');
      });

      expect(result.current.activeModal).toBe('settings');
    });

    it('모달과 함께 데이터를 전달할 수 있다', () => {
      const { result } = renderHook(() => useWebhardModalStore());
      const testData = { fileId: 'file-1', fileName: 'test.pdf' };

      act(() => {
        result.current.openModal('download', testData);
      });

      expect(result.current.activeModal).toBe('download');
      expect(result.current.modalData).toEqual(testData);
    });

    it('새 모달을 열면 기존 모달이 닫힌다', () => {
      const { result } = renderHook(() => useWebhardModalStore());

      act(() => {
        result.current.openModal('settings');
        result.current.openModal('trash');
      });

      expect(result.current.activeModal).toBe('trash');
    });

    it('모달 타입별로 올바르게 열린다', () => {
      const { result } = renderHook(() => useWebhardModalStore());
      const modalTypes: NonNullable<ModalType>[] = [
        'settings',
        'search',
        'trash',
        'move',
        'download',
        'delete',
        'folderUpload',
        'folderSelect',
      ];

      modalTypes.forEach((type) => {
        act(() => {
          result.current.openModal(type);
        });
        expect(result.current.activeModal).toBe(type);
      });
    });
  });

  describe('closeModal', () => {
    it('모달을 닫으면 activeModal이 null이 된다', () => {
      const { result } = renderHook(() => useWebhardModalStore());

      act(() => {
        result.current.openModal('settings');
        result.current.closeModal();
      });

      expect(result.current.activeModal).toBeNull();
    });

    it('모달을 닫으면 modalData가 초기화된다', () => {
      const { result } = renderHook(() => useWebhardModalStore());

      act(() => {
        result.current.openModal('download', { fileId: 'file-1' });
        result.current.closeModal();
      });

      expect(result.current.modalData).toEqual({});
    });
  });

  describe('isModalOpen', () => {
    it('특정 모달이 열려있으면 true를 반환한다', () => {
      const { result } = renderHook(() => useWebhardModalStore());

      act(() => {
        result.current.openModal('settings');
      });

      expect(result.current.isModalOpen('settings')).toBe(true);
      expect(result.current.isModalOpen('trash')).toBe(false);
    });

    it('모달이 닫혀있으면 false를 반환한다', () => {
      const { result } = renderHook(() => useWebhardModalStore());

      expect(result.current.isModalOpen('settings')).toBe(false);
    });
  });

  describe('updateModalData', () => {
    it('모달 데이터를 부분 업데이트할 수 있다', () => {
      const { result } = renderHook(() => useWebhardModalStore());

      act(() => {
        result.current.openModal('download', { fileId: 'file-1', progress: 0 });
        result.current.updateModalData({ progress: 50 });
      });

      expect(result.current.modalData).toEqual({ fileId: 'file-1', progress: 50 });
    });
  });

  describe('hasAnyModalOpen (via activeModal !== null)', () => {
    it('모달이 열려있으면 true를 반환한다', () => {
      const { result } = renderHook(() => useWebhardModalStore());

      act(() => {
        result.current.openModal('settings');
      });

      // Zustand에서는 getter 대신 직접 상태 접근
      expect(result.current.activeModal !== null).toBe(true);
    });

    it('모달이 없으면 false를 반환한다', () => {
      const { result } = renderHook(() => useWebhardModalStore());

      expect(result.current.activeModal !== null).toBe(false);
    });
  });
});
