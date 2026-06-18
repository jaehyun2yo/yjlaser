/**
 * 업체 대시보드 공통 타입 정의
 */

// ============================================
// Notification Types
// ============================================

export type NotificationType = 'info' | 'success' | 'warning' | 'error';

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: Date;
  link?: string; // 클릭 시 이동할 링크
}

export interface NotificationState {
  notifications: Notification[];
  unreadCount: number;
  isLoading: boolean;
}

// ============================================
// Search Types
// ============================================

export type SearchResultType = 'contact' | 'booking' | 'billing';

export interface SearchResult {
  id: string;
  type: SearchResultType;
  title: string;
  subtitle: string;
  status?: string;
  date?: string;
  link: string;
}

export interface SearchState {
  query: string;
  results: SearchResult[];
  isLoading: boolean;
  isOpen: boolean;
}

// ============================================
// Navigation Types
// ============================================

export interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
  badge?: number;
}

export interface ActionItem extends NavItem {
  hasBadge?: boolean;
}
