'use client';

import { useEffect, useRef } from 'react';
import { useToast } from '@/hooks/useToast';
import { useRouter } from 'next/navigation';
import { logger } from '@/lib/utils/logger';
import { socketManager } from '@/lib/socket/socket-manager';
import type { RecentContactIdsResponse } from '@/app/api/admin/notifications/recent/route';

const toastLogger = logger.createLogger('AdminToastProvider');

export function AdminToastProvider() {
  const { info } = useToast();
  const router = useRouter();
  const processedContactIdsRef = useRef<Set<string>>(new Set());
  const processedUpdateKeysRef = useRef<Set<string>>(new Set());
  const initializedRef = useRef(false);

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    // 초기 로드 시 최신 문의사항 ID들을 API Route를 통해 가져오기
    const initializeProcessedIds = async () => {
      try {
        const response = await fetch('/api/admin/notifications/recent');
        if (response.ok) {
          const data: RecentContactIdsResponse = await response.json();
          processedContactIdsRef.current = new Set(data.ids);
        } else {
          toastLogger.error('Failed to fetch recent contact ids', { status: response.status });
        }
      } catch (error) {
        toastLogger.error('Error initializing processed ids', error);
      }
    };

    initializeProcessedIds();

    // Socket.IO를 통한 실시간 구독
    const socket = socketManager.connect('contacts', (status) => {
      if (status === 'connected') {
        toastLogger.info('Connected to contacts Socket.IO namespace');
      } else if (status === 'error') {
        toastLogger.error('Socket.IO connection error for contacts');
      }
    });

    // 신규 문의사항 INSERT 이벤트
    const handleContactCreated = (data: Record<string, unknown>) => {
      const newContact = data as {
        id: number;
        company_name?: string;
        name?: string;
        [key: string]: unknown;
      };

      // 이미 알림을 보낸 문의사항인지 확인
      if (processedContactIdsRef.current.has(String(newContact.id))) {
        return;
      }

      // 처리된 ID에 추가
      processedContactIdsRef.current.add(String(newContact.id));

      // 신규 문의사항 알림 표시
      info(
        '신규 문의사항이 등록되었습니다',
        `${newContact.company_name || newContact.name || '문의 #' + newContact.id}`,
        {
          timeout: 8000,
          hideCloseButton: false,
          shouldShowTimeoutProgress: true,
          onClick: () => {
            router.push(`/admin/work-management?contactId=${newContact.id}`);
          },
          action: {
            label: '확인하기',
            onClick: () => {
              router.push(`/admin/work-management?contactId=${newContact.id}`);
            },
          },
        }
      );
    };

    // 문의사항 UPDATE 이벤트 (배송방법/예약변경 감지)
    const handleContactUpdated = (data: Record<string, unknown>) => {
      const newContact = data as {
        id: number;
        booking_changed_at?: string | null;
        delivery_method_changed_at?: string | null;
        company_name?: string;
        name?: string;
        [key: string]: unknown;
      };

      const bookingChanged =
        newContact.booking_changed_at !== null && newContact.booking_changed_at !== undefined;
      const deliveryMethodChanged =
        newContact.delivery_method_changed_at !== null &&
        newContact.delivery_method_changed_at !== undefined;

      if (bookingChanged || deliveryMethodChanged) {
        const contactName = newContact.company_name || newContact.name || `문의 #${newContact.id}`;

        if (bookingChanged && deliveryMethodChanged) {
          const updateKey = `${newContact.id}-booking-${newContact.booking_changed_at}`;
          if (processedUpdateKeysRef.current.has(updateKey)) return;
          processedUpdateKeysRef.current.add(updateKey);

          info('문의사항 변경 알림', `${contactName} - 배송방법 및 예약이 변경되었습니다`, {
            timeout: 8000,
            hideCloseButton: false,
            shouldShowTimeoutProgress: true,
            onClick: () => router.push(`/admin/work-management?contactId=${newContact.id}`),
            action: {
              label: '확인하기',
              onClick: () => router.push(`/admin/work-management?contactId=${newContact.id}`),
            },
          });
        } else if (deliveryMethodChanged) {
          const updateKey = `${newContact.id}-delivery-${newContact.delivery_method_changed_at}`;
          if (processedUpdateKeysRef.current.has(updateKey)) return;
          processedUpdateKeysRef.current.add(updateKey);

          info('배송방법 변경 알림', `${contactName} - 배송방법이 변경되었습니다`, {
            timeout: 8000,
            hideCloseButton: false,
            shouldShowTimeoutProgress: true,
            onClick: () => router.push(`/admin/work-management?contactId=${newContact.id}`),
            action: {
              label: '확인하기',
              onClick: () => router.push(`/admin/work-management?contactId=${newContact.id}`),
            },
          });
        } else if (bookingChanged) {
          const updateKey = `${newContact.id}-booking-${newContact.booking_changed_at}`;
          if (processedUpdateKeysRef.current.has(updateKey)) return;
          processedUpdateKeysRef.current.add(updateKey);

          info('예약변경 알림', `${contactName} - 예약이 변경되었습니다`, {
            timeout: 8000,
            hideCloseButton: false,
            shouldShowTimeoutProgress: true,
            onClick: () => router.push(`/admin/work-management?contactId=${newContact.id}`),
            action: {
              label: '확인하기',
              onClick: () => router.push(`/admin/work-management?contactId=${newContact.id}`),
            },
          });
        }

        // 오래된 키 정리 (최근 200개만 유지)
        if (processedUpdateKeysRef.current.size > 200) {
          const keysArray = Array.from(processedUpdateKeysRef.current);
          processedUpdateKeysRef.current = new Set(keysArray.slice(-200));
        }
      }
    };

    socket.on('contact:created', handleContactCreated);
    socket.on('contact:updated', handleContactUpdated);
    socket.on('contact:status_changed', handleContactUpdated);

    return () => {
      socket.off('contact:created', handleContactCreated);
      socket.off('contact:updated', handleContactUpdated);
      socket.off('contact:status_changed', handleContactUpdated);
      socketManager.disconnect('contacts');
    };
  }, [info, router]);

  return null;
}
