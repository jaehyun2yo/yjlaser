/**
 * useWebhardUploadStore 테스트
 * TDD: 테스트 먼저 작성
 */
import { act, renderHook } from '@testing-library/react';

// 스토어는 아직 구현되지 않음 - TDD
import { useWebhardUploadStore } from '@/store/webhard/useWebhardUploadStore';

// Mock File 생성 헬퍼
const createMockFile = (name: string, _size: number = 1024): File => {
  return new File([''], name, { type: 'application/octet-stream' });
};

describe('useWebhardUploadStore', () => {
  beforeEach(() => {
    const { result } = renderHook(() => useWebhardUploadStore());
    act(() => {
      result.current.clearQueue();
    });
  });

  describe('초기 상태', () => {
    it('isUploading이 false여야 한다', () => {
      const { result } = renderHook(() => useWebhardUploadStore());
      expect(result.current.isUploading).toBe(false);
    });

    it('uploadQueue가 빈 배열이어야 한다', () => {
      const { result } = renderHook(() => useWebhardUploadStore());
      expect(result.current.uploadQueue).toEqual([]);
    });

    it('uploadProgress가 빈 객체여야 한다', () => {
      const { result } = renderHook(() => useWebhardUploadStore());
      expect(result.current.uploadProgress).toEqual({});
    });

    it('getTotalProgress()가 0이어야 한다', () => {
      const { result } = renderHook(() => useWebhardUploadStore());
      expect(result.current.getTotalProgress()).toBe(0);
    });
  });

  describe('addToQueue', () => {
    it('파일을 업로드 큐에 추가할 수 있다', () => {
      const { result } = renderHook(() => useWebhardUploadStore());
      const files = [createMockFile('test1.pdf'), createMockFile('test2.pdf')];

      act(() => {
        result.current.addToQueue(files, 'folder-1');
      });

      expect(result.current.uploadQueue.length).toBe(2);
      expect(result.current.uploadQueue[0].fileName).toBe('test1.pdf');
      expect(result.current.uploadQueue[0].folderId).toBe('folder-1');
    });

    it('추가된 파일의 상태는 pending이어야 한다', () => {
      const { result } = renderHook(() => useWebhardUploadStore());
      const files = [createMockFile('test.pdf')];

      act(() => {
        result.current.addToQueue(files, 'folder-1');
      });

      expect(result.current.uploadQueue[0].status).toBe('pending');
    });

    it('각 파일에 고유 ID가 부여된다', () => {
      const { result } = renderHook(() => useWebhardUploadStore());
      const files = [createMockFile('test1.pdf'), createMockFile('test2.pdf')];

      act(() => {
        result.current.addToQueue(files, 'folder-1');
      });

      const ids = result.current.uploadQueue.map((item) => item.id);
      expect(new Set(ids).size).toBe(2); // 중복 없음
    });

    it('getQueueCount()가 올바르게 계산된다', () => {
      const { result } = renderHook(() => useWebhardUploadStore());
      const files = [createMockFile('test1.pdf'), createMockFile('test2.pdf')];

      act(() => {
        result.current.addToQueue(files, 'folder-1');
      });

      expect(result.current.getQueueCount()).toBe(2);
    });
  });

  describe('startUpload', () => {
    it('업로드 시작 시 isUploading이 true가 된다', () => {
      const { result } = renderHook(() => useWebhardUploadStore());

      act(() => {
        result.current.addToQueue([createMockFile('test.pdf')], 'folder-1');
        result.current.startUpload();
      });

      expect(result.current.isUploading).toBe(true);
    });
  });

  describe('updateItemStatus', () => {
    it('아이템 상태를 업데이트할 수 있다', () => {
      const { result } = renderHook(() => useWebhardUploadStore());

      act(() => {
        result.current.addToQueue([createMockFile('test.pdf')], 'folder-1');
      });

      const itemId = result.current.uploadQueue[0].id;

      act(() => {
        result.current.updateItemStatus(itemId, 'uploading');
      });

      expect(result.current.uploadQueue[0].status).toBe('uploading');
    });

    it('상태를 error로 변경하면 에러 메시지를 저장할 수 있다', () => {
      const { result } = renderHook(() => useWebhardUploadStore());

      act(() => {
        result.current.addToQueue([createMockFile('test.pdf')], 'folder-1');
      });

      const itemId = result.current.uploadQueue[0].id;

      act(() => {
        result.current.updateItemStatus(itemId, 'error', '네트워크 오류');
      });

      expect(result.current.uploadQueue[0].status).toBe('error');
      expect(result.current.uploadQueue[0].errorMessage).toBe('네트워크 오류');
    });
  });

  describe('updateProgress', () => {
    it('파일별 진행률을 업데이트할 수 있다', () => {
      const { result } = renderHook(() => useWebhardUploadStore());

      act(() => {
        result.current.addToQueue([createMockFile('test.pdf')], 'folder-1');
      });

      const itemId = result.current.uploadQueue[0].id;

      act(() => {
        result.current.updateProgress(itemId, 50);
      });

      expect(result.current.uploadProgress[itemId]).toBe(50);
    });

    it('진행률이 100이면 상태가 completed로 변경된다', () => {
      const { result } = renderHook(() => useWebhardUploadStore());

      act(() => {
        result.current.addToQueue([createMockFile('test.pdf')], 'folder-1');
      });

      const itemId = result.current.uploadQueue[0].id;

      act(() => {
        result.current.updateProgress(itemId, 100);
      });

      expect(result.current.uploadQueue[0].status).toBe('completed');
    });

    it('getTotalProgress()가 올바르게 계산된다', () => {
      const { result } = renderHook(() => useWebhardUploadStore());
      const files = [createMockFile('test1.pdf'), createMockFile('test2.pdf')];

      act(() => {
        result.current.addToQueue(files, 'folder-1');
      });

      const item1Id = result.current.uploadQueue[0].id;
      const item2Id = result.current.uploadQueue[1].id;

      act(() => {
        result.current.updateProgress(item1Id, 100);
        result.current.updateProgress(item2Id, 50);
      });

      // (100 + 50) / 2 = 75
      expect(result.current.getTotalProgress()).toBe(75);
    });
  });

  describe('removeFromQueue', () => {
    it('큐에서 아이템을 제거할 수 있다', () => {
      const { result } = renderHook(() => useWebhardUploadStore());

      act(() => {
        result.current.addToQueue([createMockFile('test.pdf')], 'folder-1');
      });

      const itemId = result.current.uploadQueue[0].id;

      act(() => {
        result.current.removeFromQueue(itemId);
      });

      expect(result.current.uploadQueue.length).toBe(0);
    });

    it('진행률 정보도 함께 제거된다', () => {
      const { result } = renderHook(() => useWebhardUploadStore());

      act(() => {
        result.current.addToQueue([createMockFile('test.pdf')], 'folder-1');
      });

      const itemId = result.current.uploadQueue[0].id;

      act(() => {
        result.current.updateProgress(itemId, 50);
        result.current.removeFromQueue(itemId);
      });

      expect(result.current.uploadProgress[itemId]).toBeUndefined();
    });
  });

  describe('clearQueue', () => {
    it('모든 업로드 상태가 초기화된다', () => {
      const { result } = renderHook(() => useWebhardUploadStore());
      const files = [createMockFile('test1.pdf'), createMockFile('test2.pdf')];

      act(() => {
        result.current.addToQueue(files, 'folder-1');
      });

      const itemId = result.current.uploadQueue[0].id;

      act(() => {
        result.current.startUpload();
        result.current.updateProgress(itemId, 50);
        result.current.clearQueue();
      });

      expect(result.current.uploadQueue).toEqual([]);
      expect(result.current.uploadProgress).toEqual({});
      expect(result.current.isUploading).toBe(false);
    });
  });

  describe('clearCompleted', () => {
    it('완료된 아이템만 제거된다', () => {
      const { result } = renderHook(() => useWebhardUploadStore());
      const files = [createMockFile('test1.pdf'), createMockFile('test2.pdf')];

      act(() => {
        result.current.addToQueue(files, 'folder-1');
      });

      const item1Id = result.current.uploadQueue[0].id;

      act(() => {
        result.current.updateProgress(item1Id, 100); // completed
        result.current.clearCompleted();
      });

      expect(result.current.uploadQueue.length).toBe(1);
      expect(result.current.uploadQueue[0].fileName).toBe('test2.pdf');
    });
  });

  describe('retryFailed', () => {
    it('실패한 아이템을 다시 시도할 수 있다', () => {
      const { result } = renderHook(() => useWebhardUploadStore());

      act(() => {
        result.current.addToQueue([createMockFile('test.pdf')], 'folder-1');
      });

      const itemId = result.current.uploadQueue[0].id;

      act(() => {
        result.current.updateItemStatus(itemId, 'error', '실패');
        result.current.retryFailed(itemId);
      });

      expect(result.current.uploadQueue[0].status).toBe('pending');
      expect(result.current.uploadQueue[0].errorMessage).toBeUndefined();
      expect(result.current.uploadProgress[itemId]).toBe(0);
    });
  });

  describe('computed value methods', () => {
    it('getPendingCount()가 올바르게 계산된다', () => {
      const { result } = renderHook(() => useWebhardUploadStore());
      const files = [
        createMockFile('test1.pdf'),
        createMockFile('test2.pdf'),
        createMockFile('test3.pdf'),
      ];

      act(() => {
        result.current.addToQueue(files, 'folder-1');
      });

      const item1Id = result.current.uploadQueue[0].id;

      act(() => {
        result.current.updateProgress(item1Id, 100); // completed
      });

      expect(result.current.getPendingCount()).toBe(2);
    });

    it('getCompletedCount()가 올바르게 계산된다', () => {
      const { result } = renderHook(() => useWebhardUploadStore());
      const files = [createMockFile('test1.pdf'), createMockFile('test2.pdf')];

      act(() => {
        result.current.addToQueue(files, 'folder-1');
      });

      const item1Id = result.current.uploadQueue[0].id;

      act(() => {
        result.current.updateProgress(item1Id, 100);
      });

      expect(result.current.getCompletedCount()).toBe(1);
    });

    it('getFailedCount()가 올바르게 계산된다', () => {
      const { result } = renderHook(() => useWebhardUploadStore());
      const files = [createMockFile('test1.pdf'), createMockFile('test2.pdf')];

      act(() => {
        result.current.addToQueue(files, 'folder-1');
      });

      const item1Id = result.current.uploadQueue[0].id;

      act(() => {
        result.current.updateItemStatus(item1Id, 'error');
      });

      expect(result.current.getFailedCount()).toBe(1);
    });

    it('getHasErrors()가 올바르게 계산된다', () => {
      const { result } = renderHook(() => useWebhardUploadStore());

      act(() => {
        result.current.addToQueue([createMockFile('test.pdf')], 'folder-1');
      });

      expect(result.current.getHasErrors()).toBe(false);

      act(() => {
        result.current.updateItemStatus(result.current.uploadQueue[0].id, 'error');
      });

      expect(result.current.getHasErrors()).toBe(true);
    });
  });
});
