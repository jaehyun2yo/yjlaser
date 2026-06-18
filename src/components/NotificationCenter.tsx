'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FaBell,
  FaCheck,
  FaCheckDouble,
  FaEnvelope,
  FaCalendar,
  FaFile,
  FaFileInvoice,
  FaCog,
} from 'react-icons/fa';
import {
  useNotifications,
  useUnreadNotificationCount,
  type Notification,
} from '@/hooks/useNotifications';
import {
  NOTIFICATION_CATEGORY_OPTIONS,
  type NotificationCategory,
} from '@/lib/notifications/categories';
import { BG_COLOR, BORDER_COLOR, DIVIDE_COLOR, TEXT_COLOR } from '@/lib/styles';
import { formatDistanceToNow } from 'date-fns';
import { ko } from 'date-fns/locale';

interface NotificationCenterProps {
  className?: string;
}

/**
 * 알림 타입별 아이콘 매핑
 */
function getNotificationIcon(type: string) {
  switch (type) {
    case 'new_contact':
      return <FaEnvelope className="text-blue-500" />;
    case 'booking_created':
    case 'booking_updated':
    case 'booking_cancelled':
      return <FaCalendar className="text-green-500" />;
    case 'file_uploaded':
      return <FaFile className="text-purple-500" />;
    case 'invoice_created':
    case 'invoice_paid':
      return <FaFileInvoice className="text-amber-500" />;
    case 'system':
      return <FaCog className="text-gray-500" />;
    default:
      return <FaBell className="text-gray-500" />;
  }
}

/**
 * 알림 센터 컴포넌트
 * Bell icon + dropdown으로 구성
 */
export function NotificationCenter({ className = '' }: NotificationCenterProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [category, setCategory] = useState<NotificationCategory>('all');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const { notifications, isLoading, markAsRead, markAllAsRead, isMarkingAllRead } =
    useNotifications({ category, limit: 10, enabled: true });
  const { count: totalUnreadCount } = useUnreadNotificationCount(true);

  // 드롭다운 외부 클릭 시 닫기
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // 알림 클릭 핸들러
  const ALLOWED_LINK_PREFIXES = ['/admin/', '/company/', '/worker/', '/webhard/'];

  const handleNotificationClick = (notification: Notification) => {
    if (!notification.is_read) {
      markAsRead(notification.id);
    }

    const link = notification.metadata?.link;
    if (
      typeof link === 'string' &&
      link.startsWith('/') &&
      ALLOWED_LINK_PREFIXES.some((prefix) => link.startsWith(prefix))
    ) {
      setIsOpen(false);
      router.push(link);
    }
  };

  // 모두 읽음 처리
  const handleMarkAllRead = () => {
    if (totalUnreadCount > 0) {
      markAllAsRead();
    }
  };

  return (
    <div ref={dropdownRef} className={`relative ${className}`}>
      {/* Bell Icon Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`relative p-2 text-gray-500 ${TEXT_COLOR.hoverBright} ${BG_COLOR.hoverLightDark} rounded-lg transition-colors`}
        aria-label={`알림 ${totalUnreadCount > 0 ? `${totalUnreadCount}개의 읽지 않은 알림` : ''}`}
      >
        <FaBell className="text-lg" />
        {/* 읽지 않은 알림 뱃지 */}
        {totalUnreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 flex items-center justify-center text-[10px] font-bold text-white bg-red-500 rounded-full">
            {totalUnreadCount > 99 ? '99+' : totalUnreadCount}
          </span>
        )}
      </button>

      {/* Dropdown */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className={`absolute right-0 mt-2 w-80 max-h-[70vh] ${BG_COLOR.darker} border ${BORDER_COLOR.default} rounded-xl shadow-xl overflow-hidden z-50`}
          >
            {/* Header */}
            <div
              className={`flex items-center justify-between px-4 py-3 border-b ${BORDER_COLOR.default} ${BG_COLOR.grayDark}/50`}
            >
              <h3 className={`text-sm font-semibold ${TEXT_COLOR.primary}`}>알림</h3>
              {category === 'all' && totalUnreadCount > 0 && (
                <button
                  onClick={handleMarkAllRead}
                  disabled={isMarkingAllRead}
                  className={`flex items-center gap-1 text-xs ${TEXT_COLOR.info} ${TEXT_COLOR.hoverInfoStrong} disabled:opacity-50`}
                >
                  <FaCheckDouble className="text-xs" />
                  모두 읽음
                </button>
              )}
            </div>

            <div className={`flex gap-1 px-3 py-2 border-b ${BORDER_COLOR.light}`}>
              {NOTIFICATION_CATEGORY_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setCategory(option.value)}
                  className={`rounded-md px-2 py-1 text-xs font-medium transition-colors ${
                    category === option.value
                      ? `${BG_COLOR.brandLight} ${TEXT_COLOR.brand}`
                      : `${TEXT_COLOR.secondary} ${BG_COLOR.hoverMuted}`
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>

            {/* Notification List */}
            <div className="overflow-y-auto max-h-[calc(70vh-60px)]">
              {isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin rounded-full h-6 w-6 border-2 border-gray-300 border-t-blue-500" />
                </div>
              ) : notifications.length === 0 ? (
                <div
                  className={`flex flex-col items-center justify-center py-8 ${TEXT_COLOR.muted}`}
                >
                  <FaBell className="text-3xl mb-2 opacity-30" />
                  <p className="text-sm">알림이 없습니다</p>
                </div>
              ) : (
                <ul className={`divide-y ${DIVIDE_COLOR.lighter}`}>
                  {notifications.map((notification) => (
                    <li key={notification.id}>
                      <button
                        onClick={() => handleNotificationClick(notification)}
                        className={`w-full px-4 py-3 text-left ${BG_COLOR.hoverGrayDeep} transition-colors ${
                          !notification.is_read ? BG_COLOR.infoAlpha : ''
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          {/* Icon */}
                          <div className="flex-shrink-0 mt-0.5">
                            {getNotificationIcon(notification.type)}
                          </div>

                          {/* Content */}
                          <div className="flex-1 min-w-0">
                            <p
                              className={`text-sm ${!notification.is_read ? 'font-semibold' : ''} ${TEXT_COLOR.primary} truncate`}
                            >
                              {notification.title}
                            </p>
                            <p className={`text-xs ${TEXT_COLOR.muted} line-clamp-2 mt-0.5`}>
                              {notification.message}
                            </p>
                            <p className={`text-[10px] ${TEXT_COLOR.dim} mt-1`}>
                              {formatDistanceToNow(new Date(notification.created_at), {
                                addSuffix: true,
                                locale: ko,
                              })}
                            </p>
                          </div>

                          {/* Read indicator */}
                          {!notification.is_read && (
                            <div className="flex-shrink-0">
                              <div className="w-2 h-2 bg-blue-500 rounded-full" />
                            </div>
                          )}
                          {notification.is_read && (
                            <div className={`flex-shrink-0 ${TEXT_COLOR.dimInvert}`}>
                              <FaCheck className="text-xs" />
                            </div>
                          )}
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
