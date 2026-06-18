import { useEffect } from 'react';

/**
 * 페이지 타이틀에 읽지 않은 알림 개수 표시
 */
export function usePageTitle(unreadCount: number, baseTitle: string = '진행상황') {
  useEffect(() => {
    if (unreadCount > 0) {
      document.title = `(${unreadCount > 99 ? '99+' : unreadCount}) ${baseTitle}`;
    } else {
      document.title = baseTitle;
    }

    // 컴포넌트 언마운트 시 원래 타이틀로 복원
    return () => {
      document.title = baseTitle;
    };
  }, [unreadCount, baseTitle]);
}
