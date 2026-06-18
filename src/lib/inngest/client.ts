/**
 * Inngest 클라이언트
 * 백그라운드 작업 처리를 위한 서버리스 함수 실행 플랫폼
 */

import { Inngest } from 'inngest';

// Inngest 클라이언트 인스턴스
export const inngest = new Inngest({
  id: 'yj-laser-webhard',
  // 개발 환경에서는 이벤트 전송 비활성화 (환경 변수로 제어)
  isDev: process.env.NODE_ENV !== 'production',
});

// 이벤트 타입 정의
export type WebhardEvents = {
  // 활동 로그 이벤트
  'webhard/activity.log': {
    data: {
      actorType: 'admin' | 'company';
      actorId: string;
      actorName?: string;
      action: string;
      resourceType?: string;
      resourceId?: string;
      details?: Record<string, unknown>;
      ipAddress?: string;
      userAgent?: string;
    };
  };

  // Slack 알림 이벤트
  'webhard/notification.slack': {
    data: {
      type: 'file_upload' | 'file_delete' | 'error';
      fileName?: string;
      fileSize?: number;
      companyName?: string;
      folderName?: string;
      inquiryNumber?: string;
      uploadedAt?: string;
      errorMessage?: string;
    };
  };

  // 대용량 파일 동기화 이벤트
  'webhard/sync.files': {
    data: {
      companyId: number;
      folderId: string | null;
      files: Array<{
        name: string;
        size: number;
        path: string;
      }>;
    };
  };

  // 캐시 무효화 이벤트
  'webhard/cache.invalidate': {
    data: {
      type: 'folder' | 'file' | 'company' | 'all';
      companyId?: number;
      folderId?: string;
      fileId?: string;
    };
  };
};
