/**
 * 웹하드 다운로드 관련 헬퍼 함수들
 */
import { logger } from '@/lib/utils/logger';

const log = logger.createLogger('DownloadHelpers');

/**
 * 브라우저 기본 다운로드 폴더에 파일 다운로드
 */
export function downloadToDefault(blob: Blob, filename: string): void {
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename || 'download';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
}

/**
 * File System Access API를 사용하여 지정된 폴더에 파일 저장
 * @param blob 저장할 파일 Blob
 * @param filename 파일명
 * @param folderHandle 폴더 핸들
 * @param permissionStatus 현재 권한 상태
 * @param requestPermission 권한 요청 함수
 * @returns 저장 성공 여부
 */
export async function saveToFolder(
  blob: Blob,
  filename: string,
  folderHandle: FileSystemDirectoryHandle | null,
  permissionStatus: 'granted' | 'denied' | 'prompt' | 'unknown',
  requestPermission: () => Promise<boolean>
): Promise<boolean> {
  if (!folderHandle) return false;

  try {
    // 권한 확인 및 요청
    if (permissionStatus !== 'granted') {
      const granted = await requestPermission();
      if (!granted) {
        return false;
      }
    }

    const fileHandle = await folderHandle.getFileHandle(filename || 'download', {
      create: true,
    });
    const writable = await fileHandle.createWritable();
    await writable.write(blob);
    await writable.close();
    return true;
  } catch (error) {
    log.error('Failed to save to folder:', error);
    return false;
  }
}

interface DownloadViaSignedUrlOptions {
  folderHandle: FileSystemDirectoryHandle | null;
  permissionStatus: 'granted' | 'denied' | 'prompt' | 'unknown';
  requestPermission: () => Promise<boolean>;
}

/**
 * Signed URL을 통한 직접 다운로드 (서버 우회, 2-3배 빠름)
 * @param url Signed URL
 * @param filename 파일명
 * @param options 폴더 핸들 옵션
 * @returns 다운로드 성공 여부
 */
export async function downloadViaSignedUrl(
  url: string,
  filename: string,
  options?: DownloadViaSignedUrlOptions
): Promise<boolean> {
  try {
    // folderHandle이 있으면 해당 폴더에 저장
    if (options?.folderHandle) {
      const response = await fetch(url);
      if (!response.ok) throw new Error('Failed to fetch file');
      const blob = await response.blob();
      return await saveToFolder(
        blob,
        filename,
        options.folderHandle,
        options.permissionStatus,
        options.requestPermission
      );
    }

    // folderHandle이 없으면 브라우저 기본 다운로드 (anchor 태그 사용)
    const link = document.createElement('a');
    link.href = url;
    link.download = filename || 'download';
    // Signed URL이므로 cross-origin download 허용
    link.setAttribute('target', '_blank');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    return true;
  } catch (error) {
    log.error('Signed URL download failed:', error);
    return false;
  }
}
