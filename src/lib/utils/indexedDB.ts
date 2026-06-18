/**
 * IndexedDB 유틸리티 - File System Access API의 folderHandle 저장용
 *
 * 브라우저 새로고침/재시작 후에도 folderHandle을 복원할 수 있도록 IndexedDB에 저장
 * 단, 복원 후 첫 사용 시 권한 재요청이 필요함
 */

// File System Access API 확장 타입 (일부 브라우저에서 지원)
interface FileSystemHandlePermissionDescriptor {
  mode?: 'read' | 'readwrite';
}

interface ExtendedFileSystemDirectoryHandle extends FileSystemDirectoryHandle {
  queryPermission?: (descriptor: FileSystemHandlePermissionDescriptor) => Promise<PermissionState>;
  requestPermission?: (
    descriptor: FileSystemHandlePermissionDescriptor
  ) => Promise<PermissionState>;
}

const DB_NAME = 'webhard-storage';
const DB_VERSION = 1;
const STORE_NAME = 'folder-handles';
const FOLDER_HANDLE_KEY = 'download-folder';

/**
 * IndexedDB 연결
 */
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB is not supported'));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      reject(new Error('Failed to open IndexedDB'));
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      // folder-handles 스토어 생성
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
  });
}

/**
 * folderHandle을 IndexedDB에 저장
 */
export async function saveFolderHandle(handle: FileSystemDirectoryHandle): Promise<void> {
  try {
    const db = await openDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);

      const request = store.put(handle, FOLDER_HANDLE_KEY);

      request.onerror = () => {
        reject(new Error('Failed to save folder handle'));
      };

      request.onsuccess = () => {
        resolve();
      };

      transaction.oncomplete = () => {
        db.close();
      };
    });
  } catch (error) {
    throw error;
  }
}

/**
 * IndexedDB에서 folderHandle 복원
 */
export async function loadFolderHandle(): Promise<FileSystemDirectoryHandle | null> {
  try {
    const db = await openDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);

      const request = store.get(FOLDER_HANDLE_KEY);

      request.onerror = () => {
        reject(new Error('Failed to load folder handle'));
      };

      request.onsuccess = () => {
        resolve(request.result || null);
      };

      transaction.oncomplete = () => {
        db.close();
      };
    });
  } catch (error) {
    return null;
  }
}

/**
 * IndexedDB에서 folderHandle 삭제
 */
export async function removeFolderHandle(): Promise<void> {
  try {
    const db = await openDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);

      const request = store.delete(FOLDER_HANDLE_KEY);

      request.onerror = () => {
        reject(new Error('Failed to remove folder handle'));
      };

      request.onsuccess = () => {
        resolve();
      };

      transaction.oncomplete = () => {
        db.close();
      };
    });
  } catch (error) {
    throw error;
  }
}

/**
 * folderHandle의 권한 상태 확인 및 요청
 * @returns 권한이 있으면 true, 없으면 false
 */
export async function verifyFolderPermission(
  handle: FileSystemDirectoryHandle,
  requestPermissionFlag: boolean = false
): Promise<boolean> {
  try {
    const extHandle = handle as ExtendedFileSystemDirectoryHandle;

    // queryPermission이 없으면 (구형 브라우저) 권한 없음으로 처리
    if (!extHandle.queryPermission) {
      return false;
    }

    // 현재 권한 상태 확인
    const options: FileSystemHandlePermissionDescriptor = { mode: 'readwrite' };

    let permission = await extHandle.queryPermission(options);

    if (permission === 'granted') {
      return true;
    }

    // 권한 요청이 필요하고 허용된 경우
    if (requestPermissionFlag && permission === 'prompt' && extHandle.requestPermission) {
      permission = await extHandle.requestPermission(options);
      return permission === 'granted';
    }

    return false;
  } catch (error) {
    return false;
  }
}

/**
 * IndexedDB 지원 여부 확인
 */
export function isIndexedDBSupported(): boolean {
  return typeof window !== 'undefined' && 'indexedDB' in window;
}
