'use client';

import { useEffect, useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { socketManager } from '@/lib/socket/socket-manager';
import { ConfirmButton } from './[id]/confirm-button';
import { DeleteButton } from './delete-button';
import { UpdateStatusButton } from './[id]/update-status-button';
import { DownloadButton } from '@/components/DownloadButton';
import { QuickProcessStageSelect } from './quick-process-stage-select';
import { ProcessStageIndicatorToggle } from '@/components/ProcessStageIndicatorToggle';
import { FaUndo, FaTrash, FaExclamationCircle } from 'react-icons/fa';
import { queryKeys } from '@/lib/react-query/queryKeys';
import { SplitContactModal } from './_components/SplitContactModal';
import type { Contact } from '@/lib/types';
import { BADGE, BG_COLOR, BORDER_COLOR, TEXT_COLOR, TRANSITION_STYLES } from '@/lib/styles';
import { Button } from '@/components/ui/button';
import { logger } from '@/lib/utils/logger';

const log = logger.createLogger('ContactDetailModal');

interface ContactDetailModalProps {
  contactId: string | null;
  isOpen: boolean;
  onClose: () => void;
  onUpdate?: () => void;
  hideInquiryNumber?: boolean; // 업체 대시보드에서 문의 번호 숨기기
  isCompanyView?: boolean; // 업체 대시보드에서 보는 경우 (상태변경, 삭제 버튼 숨김)
}

export function ContactDetailModal({
  contactId,
  isOpen,
  onClose,
  hideInquiryNumber = false,
  isCompanyView = false,
}: ContactDetailModalProps) {
  const queryClient = useQueryClient();
  const [contact, setContact] = useState<Contact | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [permanentlyDeletingId, setPermanentlyDeletingId] = useState<string | null>(null);
  const [isSplitModalOpen, setIsSplitModalOpen] = useState(false);
  // localStorage에서 클릭한 뱃지들 동기적으로 불러오기 (초기 렌더링 시 깜빡임 방지)
  const loadDismissedFromStorage = (key: string): Set<string> => {
    if (typeof window === 'undefined') return new Set();
    try {
      const stored = localStorage.getItem(key);
      if (stored) {
        const parsed = JSON.parse(stored);
        return new Set(parsed);
      }
    } catch (error) {
      log.error(`Error reading ${key} from localStorage`, error);
    }
    return new Set();
  };

  const [dismissedRevisionRequests, setDismissedRevisionRequests] = useState<Set<string>>(() =>
    loadDismissedFromStorage('admin-dismissed-revision-requests')
  );
  const [dismissedDeliveryMethods, setDismissedDeliveryMethods] = useState<Set<string>>(() =>
    loadDismissedFromStorage('admin-dismissed-delivery-methods')
  );
  const [dismissedVisitSchedules, setDismissedVisitSchedules] = useState<Set<string>>(() =>
    loadDismissedFromStorage('admin-dismissed-visit-schedules')
  );

  // 클라이언트 마운트 상태 (hydration 깜빡임 방지)
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  // 수정요청 뱃지가 클릭되었는지 확인하는 함수
  const isRevisionRequestDismissed = (
    contactId: string,
    revisionRequestedAt: string | null | undefined
  ) => {
    if (!revisionRequestedAt) return true; // 수정요청이 없으면 표시 안 함
    const key = `${contactId}-${revisionRequestedAt}`;
    return dismissedRevisionRequests.has(key);
  };

  // 수정요청 뱃지 클릭 처리 함수
  const handleDismissRevisionRequest = (
    contactId: string,
    revisionRequestedAt: string | null | undefined
  ) => {
    if (!revisionRequestedAt) return;
    const key = `${contactId}-${revisionRequestedAt}`;
    const newSet = new Set(dismissedRevisionRequests);
    newSet.add(key);
    setDismissedRevisionRequests(newSet);

    // localStorage에 저장
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(
          'admin-dismissed-revision-requests',
          JSON.stringify(Array.from(newSet))
        );
      } catch (error) {
        log.error('Error saving dismissed revision requests', error);
      }
    }
  };

  // 수령방법 뱃지가 클릭되었는지 확인하는 함수
  const isDeliveryMethodDismissed = (contactId: string) => {
    const key = `${contactId}-delivery-method`;
    return dismissedDeliveryMethods.has(key);
  };

  // 수령방법 뱃지 클릭 처리 함수
  const handleDismissDeliveryMethod = async (contactId: string) => {
    const key = `${contactId}-delivery-method`;
    const newSet = new Set(dismissedDeliveryMethods);
    newSet.add(key);
    setDismissedDeliveryMethods(newSet);

    // localStorage에 저장
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(
          'admin-dismissed-delivery-methods',
          JSON.stringify(Array.from(newSet))
        );
      } catch (error) {
        log.error('Error saving dismissed delivery methods', error);
      }
    }

    // 서버에 확인 상태 저장 (delivery_method_changed_at을 null로 설정)
    try {
      const response = await fetch(`/api/contacts/${contactId}/delivery-method-acknowledged`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        // React Query 캐시 무효화하여 데이터 새로고침
        queryClient.invalidateQueries({ queryKey: queryKeys.contacts.all });
        queryClient.invalidateQueries({ queryKey: queryKeys.processBoard.all });
        fetchContactDetail(); // 상세 정보도 새로고침
      } else {
        log.error('Error acknowledging delivery method change', await response.json());
      }
    } catch (error) {
      log.error('Error acknowledging delivery method change', error);
    }
  };

  // 예약변경 뱃지가 클릭되었는지 확인하는 함수 (booking_changed_at 타임스탬프 비교)
  const isVisitScheduleDismissed = (
    contactId: string,
    bookingChangedAt: string | null | undefined
  ) => {
    if (!bookingChangedAt) return true; // 예약변경이 없으면 표시 안 함
    const key = `${contactId}-${bookingChangedAt}`;
    return dismissedVisitSchedules.has(key);
  };

  // 예약변경 뱃지 클릭 처리 함수
  const handleDismissVisitSchedule = async (
    contactId: string,
    bookingChangedAt: string | null | undefined
  ) => {
    if (!bookingChangedAt) return;
    const key = `${contactId}-${bookingChangedAt}`;
    const newSet = new Set(dismissedVisitSchedules);
    newSet.add(key);
    setDismissedVisitSchedules(newSet);

    // localStorage에 저장
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('admin-dismissed-visit-schedules', JSON.stringify(Array.from(newSet)));
      } catch (error) {
        log.error('Error saving dismissed visit schedules', error);
      }
    }

    // 서버에 확인 상태 저장 (booking_changed_at을 null로 설정)
    try {
      const response = await fetch(`/api/contacts/${contactId}/booking-change-acknowledged`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        // React Query 캐시 무효화하여 데이터 새로고침
        queryClient.invalidateQueries({ queryKey: queryKeys.contacts.all });
        queryClient.invalidateQueries({ queryKey: queryKeys.processBoard.all });
        fetchContactDetail(); // 상세 정보도 새로고침
      } else {
        log.error('Error acknowledging booking change', await response.json());
      }
    } catch (error) {
      log.error('Error acknowledging booking change', error);
    }
  };

  // 삭제까지 남은 일수 계산
  const getDaysUntilPermanentDelete = (deletedAt: string | null | undefined) => {
    if (!deletedAt) return 10;
    const deletedDate = new Date(deletedAt);
    const now = new Date();
    const diffTime = now.getTime() - deletedDate.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    return Math.max(0, 10 - diffDays);
  };

  // 복구 핸들러
  const handleRestore = async (contactId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setRestoringId(contactId);
    try {
      const response = await fetch(`/api/contacts/${contactId}/restore`, {
        method: 'POST',
      });

      if (response.ok) {
        queryClient.invalidateQueries({ queryKey: queryKeys.contacts.all });
        queryClient.invalidateQueries({ queryKey: queryKeys.processBoard.all });
        fetchContactDetail();
      } else {
        const error = await response.json();
        alert(`복구 실패: ${error.error || '알 수 없는 오류가 발생했습니다.'}`);
      }
    } catch (error) {
      log.error('Error restoring contact', error);
      alert('복구 중 오류가 발생했습니다.');
    } finally {
      setRestoringId(null);
    }
  };

  // 영구 삭제 핸들러
  const handlePermanentDelete = async (
    contactId: string,
    contactName: string,
    e: React.MouseEvent
  ) => {
    e.stopPropagation();

    if (
      !confirm(
        `정말로 "${contactName}" 문의를 영구 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.`
      )
    ) {
      return;
    }

    setPermanentlyDeletingId(contactId);
    try {
      const response = await fetch(`/api/contacts/${contactId}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ permanent: true }),
      });

      if (response.ok) {
        alert('문의가 영구 삭제되었습니다.');
        queryClient.invalidateQueries({ queryKey: queryKeys.contacts.all });
        queryClient.invalidateQueries({ queryKey: queryKeys.processBoard.all });
        onClose();
      } else {
        const error = await response.json();
        alert(`영구 삭제 실패: ${error.error || '알 수 없는 오류'}`);
      }
    } catch (error) {
      log.error('Error permanently deleting contact', error);
      alert('영구 삭제 중 오류가 발생했습니다.');
    } finally {
      setPermanentlyDeletingId(null);
    }
  };

  // 작업시작 핸들러
  const handleStartWork = async (contactId: string, e: React.MouseEvent) => {
    e.stopPropagation();

    try {
      const response = await fetch(`/api/contacts/${contactId}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: 'drawing' }),
      });

      if (response.ok) {
        queryClient.invalidateQueries({ queryKey: queryKeys.contacts.all });
        queryClient.invalidateQueries({ queryKey: queryKeys.processBoard.all });
        fetchContactDetail();
      } else {
        alert('작업 시작에 실패했습니다.');
      }
    } catch (error) {
      log.error('Error starting work', error);
      alert('작업 시작 중 오류가 발생했습니다.');
    }
  };

  const fetchContactDetail = useCallback(async () => {
    if (!contactId) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/contacts/${contactId}`);
      if (!response.ok) {
        if (response.status === 404) {
          setError(
            '해당 문의 정보를 찾을 수 없습니다. 문의가 삭제되었거나 존재하지 않을 수 있습니다.'
          );
        } else {
          setError('문의 정보를 불러올 수 없습니다.');
        }
        return;
      }
      const data = await response.json();
      setContact(data);

      // React Query 캐시에도 업데이트하여 다른 컴포넌트와 동기화
      queryClient.setQueryData(queryKeys.contacts.detail(contactId), data);
    } catch (err) {
      setError(err instanceof Error ? err.message : '문의 정보를 불러오는 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  }, [contactId, queryClient]);

  useEffect(() => {
    if (isOpen && contactId) {
      fetchContactDetail();
    } else {
      setContact(null);
      setError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, contactId]);

  // Socket.IO 실시간 구독 - 특정 contact의 변경사항 감지 (업체 대시보드에서는 비활성화)
  useEffect(() => {
    if (!isOpen || !contactId || isCompanyView) return; // 업체 대시보드에서는 실시간 구독 비활성화

    // Socket.IO를 통한 실시간 구독
    const socket = socketManager.connect('contacts');

    const handleContactUpdate = async (data: Record<string, unknown>) => {
      // 이 모달의 contactId와 일치하는 이벤트만 처리
      const eventContactId = data.id as string;
      if (String(eventContactId) !== String(contactId)) return;

      log.info('Contact updated via Socket.IO', { id: eventContactId });

      try {
        await fetchContactDetail();
        log.info('Contact detail refetched successfully');
      } catch (error) {
        log.error('Error refetching contact detail', error);
      }
    };

    socket.on('contact:updated', handleContactUpdate);
    socket.on('contact:status_changed', handleContactUpdate);
    socket.on('contact:process_stage_changed', handleContactUpdate);

    // React Query 캐시 변경 감지하여 모달 데이터 동기화
    const unsubscribeCache = queryClient.getQueryCache().subscribe((event) => {
      if (event?.type === 'updated' && event.query.queryKey[0] === 'contacts') {
        // contacts 관련 쿼리가 업데이트되면 모달 데이터도 확인
        const cachedData = queryClient.getQueryData<Contact>(queryKeys.contacts.detail(contactId));
        if (cachedData) {
          // 수정요청 필드나 다른 필드가 변경된 경우 업데이트
          const hasChanges =
            !contact ||
            cachedData.process_stage !== contact.process_stage ||
            cachedData.status !== contact.status ||
            cachedData.revision_request_title !== contact.revision_request_title ||
            cachedData.revision_request_content !== contact.revision_request_content ||
            cachedData.revision_requested_at !== contact.revision_requested_at ||
            cachedData.revision_request_file_url !== contact.revision_request_file_url ||
            cachedData.revision_request_file_name !== contact.revision_request_file_name;

          if (hasChanges) {
            setContact(cachedData);
          }
        }
      }
    });

    return () => {
      socket.off('contact:updated', handleContactUpdate);
      socket.off('contact:status_changed', handleContactUpdate);
      socket.off('contact:process_stage_changed', handleContactUpdate);
      socketManager.disconnect('contacts');
      unsubscribeCache();
    };
  }, [isOpen, contactId, isCompanyView, queryClient, contact, fetchContactDetail]);

  useEffect(() => {
    if (isOpen) {
      // 스크롤바 너비 계산
      const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;

      // body에 padding-right를 추가하여 스크롤바 공간 확보
      document.body.style.paddingRight = `${scrollbarWidth}px`;
      document.body.style.overflow = 'hidden';
    } else {
      // 원래대로 복원
      document.body.style.overflow = 'unset';
      document.body.style.paddingRight = '0px';
    }
    return () => {
      document.body.style.overflow = 'unset';
      document.body.style.paddingRight = '0px';
    };
  }, [isOpen]);

  // ESC 키로 모달 닫기
  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  // handleUpdate는 필요시 사용
  // const handleUpdate = () => {
  //   fetchContactDetail();
  //   onUpdate?.();
  // };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 backdrop-blur-sm flex items-center justify-center z-50 animate-fadeIn p-4 overflow-y-auto modal-scrollbar-hide"
      onClick={onClose}
    >
      <div
        className={`${BG_COLOR.card} rounded-lg shadow-2xl border ${BORDER_COLOR.default} max-w-4xl w-full max-h-[90vh] overflow-y-auto modal-scrollbar-hide animate-scaleIn my-8`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div
          className={`sticky top-0 ${BG_COLOR.card} border-b ${BORDER_COLOR.default} p-4 flex justify-between items-center z-10`}
        >
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <h2 className={`text-xl font-bold ${TEXT_COLOR.primary}`}>문의 상세보기</h2>
            {!hideInquiryNumber && contact && contact.inquiry_number && (
              <div className={`text-sm font-medium ${TEXT_COLOR.brand} flex-shrink-0`}>
                {contact.inquiry_number}
              </div>
            )}
            {!isCompanyView &&
              contact &&
              contact.revision_request_title &&
              !isRevisionRequestDismissed(contact.id, contact.revision_requested_at) &&
              mounted && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();

                    // 뱃지 클릭 처리 (사라지게 함)
                    handleDismissRevisionRequest(contact.id, contact.revision_requested_at);

                    const revisionSection = document.getElementById('revision-request-section');
                    if (revisionSection) {
                      revisionSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
                      // 스크롤 후 잠시 하이라이트 효과
                      revisionSection.classList.add('ring-4', 'ring-error');
                      setTimeout(() => {
                        revisionSection.classList.remove('ring-4', 'ring-error');
                      }, 2000);
                    }
                  }}
                  className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full ${BADGE.error} flex-shrink-0 animate-pulse ${BG_COLOR.hoverErrorDark} ${TRANSITION_STYLES.colors} cursor-pointer`}
                >
                  <FaExclamationCircle className="text-xs" />
                  수정요청
                </button>
              )}
            {!isCompanyView &&
              contact &&
              (contact.visit_date || contact.visit_time_slot) &&
              contact.booking_changed_at && // 예약변경이 있었는지 확인
              !contact.delivery_method && // 배송방법이 없을 때만 예약변경 뱃지 표시
              !isVisitScheduleDismissed(contact.id, contact.booking_changed_at) &&
              mounted && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDismissVisitSchedule(contact.id, contact.booking_changed_at);
                    const visitSection = document.getElementById('visit-schedule-section');
                    if (visitSection) {
                      visitSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
                      visitSection.classList.add('ring-4', 'ring-success');
                      setTimeout(() => {
                        visitSection.classList.remove('ring-4', 'ring-success');
                      }, 2000);
                    }
                  }}
                  className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full ${BADGE.success} flex-shrink-0 animate-pulse ${BG_COLOR.hoverSuccessDark} ${TRANSITION_STYLES.colors} cursor-pointer`}
                >
                  <FaExclamationCircle className="text-xs" />
                  예약변경
                </button>
              )}
            {!isCompanyView &&
              contact &&
              contact.delivery_method &&
              contact.delivery_method_changed_at && // 배송변경이 있었는지 확인
              !isDeliveryMethodDismissed(contact.id) &&
              mounted && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDismissDeliveryMethod(contact.id);
                    const deliverySection = document.getElementById('delivery-method-section');
                    if (deliverySection) {
                      deliverySection.scrollIntoView({ behavior: 'smooth', block: 'center' });
                      deliverySection.classList.add('ring-4', 'ring-info');
                      setTimeout(() => {
                        deliverySection.classList.remove('ring-4', 'ring-info');
                      }, 2000);
                    }
                  }}
                  className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full ${BADGE.info} flex-shrink-0 animate-pulse ${BG_COLOR.hoverInfoDark} ${TRANSITION_STYLES.colors} cursor-pointer`}
                >
                  <FaExclamationCircle className="text-xs" />
                  배송방법
                </button>
              )}
          </div>
          <div className="flex gap-2 items-center">
            {!isCompanyView && contact && (
              <>
                <UpdateStatusButton contactId={contact.id} currentStatus={contact.status} />
                <DeleteButton
                  contactId={contact.id}
                  contactName={contact.company_name || contact.name || `문의 #${contact.id}`}
                />
              </>
            )}
            {isCompanyView ? (
              <Button onClick={onClose}>확인</Button>
            ) : (
              <button
                onClick={onClose}
                className={`p-2 rounded-lg ${BG_COLOR.hoverMuted} ${TRANSITION_STYLES.colors}`}
              >
                <svg
                  className={`w-6 h-6 ${TEXT_COLOR.muted}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* 내용 */}
        <div className="p-6">
          {loading && (
            <div className="text-center py-12">
              <div className={TEXT_COLOR.muted}>로딩 중...</div>
            </div>
          )}

          {error && (
            <div className="text-center py-12">
              <div className={TEXT_COLOR.error}>{error}</div>
              <Button onClick={fetchContactDetail} className="mt-4">
                다시 시도
              </Button>
            </div>
          )}

          {contact && !loading && (
            <div className="space-y-6">
              {/* 공정 단계 선택 (상단) */}
              {(contact.status === 'drawing' ||
                contact.status === 'confirmed' ||
                contact.status === 'production' ||
                contact.status === 'cutting' ||
                contact.status === 'finishing' ||
                contact.status === 'delivered') && (
                <div className={`${BG_COLOR.card} rounded-lg p-4`}>
                  <label className={`text-sm font-semibold ${TEXT_COLOR.primary} mb-3 block`}>
                    작업현황
                  </label>
                  <QuickProcessStageSelect
                    contactId={contact.id}
                    currentStage={contact.process_stage}
                    status={contact.status}
                    disabled={isCompanyView} // 업체 대시보드에서는 읽기 전용
                  />
                </div>
              )}

              {/* 연락처 정보 */}
              <div className={`${BG_COLOR.card} rounded-lg p-4`}>
                <h3
                  className={`text-sm font-semibold ${TEXT_COLOR.primary} mb-3 border-b ${BORDER_COLOR.default} pb-2`}
                >
                  연락처 정보
                </h3>
                <div className="space-y-3">
                  {contact.contact_type && (
                    <div>
                      <label className={`text-sm font-medium ${TEXT_COLOR.muted}`}>문의 유형</label>
                      <p className={`mt-1 text-sm ${TEXT_COLOR.primary}`}>
                        {contact.contact_type === 'individual' ? '개인' : '업체'}
                      </p>
                    </div>
                  )}
                  {contact.contact_type === 'individual' && (
                    <div>
                      <label className={`text-sm font-medium ${TEXT_COLOR.muted}`}>
                        서비스 유형
                      </label>
                      <div className="mt-1 flex flex-wrap gap-2">
                        {contact.service_mold_request && (
                          <span
                            className={`px-2 py-1 text-sm ${BG_COLOR.infoMedium} ${TEXT_COLOR.infoDeep} rounded`}
                          >
                            목형 제작 의뢰
                          </span>
                        )}
                        {contact.service_delivery_brokerage && (
                          <span
                            className={`px-2 py-1 text-sm ${BG_COLOR.successMedium} ${TEXT_COLOR.successDeep} rounded`}
                          >
                            납품까지 중개
                          </span>
                        )}
                        {!contact.service_mold_request && !contact.service_delivery_brokerage && (
                          <span className="text-sm text-gray-400">-</span>
                        )}
                      </div>
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={`text-sm font-medium ${TEXT_COLOR.muted}`}>
                        {contact.contact_type === 'individual' ? '이름' : '업체명'}
                      </label>
                      <p className={`mt-1 text-sm ${TEXT_COLOR.primary}`}>{contact.company_name}</p>
                    </div>
                    {contact.contact_type === 'company' && (
                      <>
                        <div>
                          <label className={`text-sm font-medium ${TEXT_COLOR.muted}`}>
                            담당자명
                          </label>
                          <p className={`mt-1 text-sm ${TEXT_COLOR.primary}`}>{contact.name}</p>
                        </div>
                        <div>
                          <label className={`text-sm font-medium ${TEXT_COLOR.muted}`}>직책</label>
                          <p className={`mt-1 text-sm ${TEXT_COLOR.primary}`}>{contact.position}</p>
                        </div>
                      </>
                    )}
                    <div>
                      <label className={`text-sm font-medium ${TEXT_COLOR.muted}`}>연락처</label>
                      <p className={`mt-1 text-sm ${TEXT_COLOR.primary}`}>
                        <a
                          href={`tel:${contact.phone}`}
                          className="text-orange-600 hover:underline"
                        >
                          {contact.phone}
                        </a>
                      </p>
                    </div>
                    <div className="col-span-2">
                      <label className={`text-sm font-medium ${TEXT_COLOR.muted}`}>이메일</label>
                      <p className={`mt-1 text-sm ${TEXT_COLOR.primary}`}>
                        <a
                          href={`mailto:${contact.email}`}
                          className="text-orange-600 hover:underline"
                        >
                          {contact.email}
                        </a>
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* 도면 및 샘플 정보 */}
              <div className={`${BG_COLOR.card} rounded-lg p-4`}>
                <h3
                  className={`text-sm font-semibold ${TEXT_COLOR.primary} mb-3 border-b ${BORDER_COLOR.default} pb-2`}
                >
                  도면 및 샘플 정보
                </h3>
                <div className="space-y-3">
                  <div>
                    <label className={`text-sm font-medium ${TEXT_COLOR.muted}`}>도면 상태</label>
                    <p className={`mt-1 text-sm ${TEXT_COLOR.primary}`}>
                      {contact.drawing_type === 'create'
                        ? '도면 제작이 필요합니다'
                        : contact.drawing_type === 'have'
                          ? '도면을 가지고 있습니다'
                          : '-'}
                    </p>
                  </div>

                  {contact.drawing_type === 'create' && (
                    <>
                      <div>
                        <label className={`text-sm font-medium ${TEXT_COLOR.muted}`}>
                          실물 샘플
                        </label>
                        <p className={`mt-1 text-sm ${TEXT_COLOR.primary}`}>
                          {contact.has_physical_sample ? '있음' : '없음'}
                        </p>
                      </div>
                      {contact.has_physical_sample && contact.sample_notes && (
                        <div>
                          <label className={`text-sm font-medium ${TEXT_COLOR.muted}`}>
                            샘플 특이사항
                          </label>
                          <p
                            className={`mt-1 text-sm ${TEXT_COLOR.primary} whitespace-pre-wrap ${BG_COLOR.card} p-3 rounded`}
                          >
                            {contact.sample_notes}
                          </p>
                        </div>
                      )}
                      <div>
                        <label className={`text-sm font-medium ${TEXT_COLOR.muted}`}>
                          제작 자료
                        </label>
                        <p className={`mt-1 text-sm ${TEXT_COLOR.primary}`}>
                          {contact.has_reference_photos ? '있음' : '없음'}
                        </p>
                      </div>
                    </>
                  )}

                  {contact.drawing_type === 'have' && (
                    <div>
                      <label className={`text-sm font-medium ${TEXT_COLOR.muted}`}>도면 수정</label>
                      <p className={`mt-1 text-sm ${TEXT_COLOR.primary}`}>
                        {contact.drawing_modification === 'needed'
                          ? '도면의 수정이 필요합니다'
                          : contact.drawing_modification === 'not_needed'
                            ? '도면의 수정이 필요없습니다'
                            : '-'}
                      </p>
                    </div>
                  )}

                  <div>
                    <label className={`text-sm font-medium ${TEXT_COLOR.muted}`}>박스 형태</label>
                    <p className={`mt-1 text-sm ${TEXT_COLOR.primary}`}>
                      {contact.box_shape || '-'}
                    </p>
                  </div>

                  <div>
                    <label className={`text-sm font-medium ${TEXT_COLOR.muted}`}>
                      크기 (장×폭×고)
                    </label>
                    <p className={`mt-1 text-sm ${TEXT_COLOR.primary}`}>
                      {contact.length || '-'} mm × {contact.width || '-'} mm ×{' '}
                      {contact.height || '-'} mm
                    </p>
                  </div>

                  <div>
                    <label className={`text-sm font-medium ${TEXT_COLOR.muted}`}>재질</label>
                    <p className={`mt-1 text-sm ${TEXT_COLOR.primary}`}>
                      {contact.material || '-'}
                    </p>
                  </div>

                  {contact.drawing_notes && (
                    <div>
                      <label className={`text-sm font-medium ${TEXT_COLOR.muted}`}>
                        도면 및 샘플 제작 시 유의사항
                      </label>
                      <p
                        className={`mt-1 text-sm ${TEXT_COLOR.primary} whitespace-pre-wrap ${BG_COLOR.card} p-3 rounded`}
                      >
                        {contact.drawing_notes}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* 납품업체 정보 */}
              {contact.delivery_method && (
                <div
                  id="delivery-method-section"
                  className={`${BG_COLOR.card} rounded-lg p-4 scroll-mt-4`}
                >
                  <h3
                    className={`text-sm font-semibold ${TEXT_COLOR.primary} mb-3 border-b ${BORDER_COLOR.default} pb-2`}
                  >
                    납품업체 정보
                  </h3>
                  <div className="space-y-3">
                    <div>
                      <label className={`text-sm font-medium ${TEXT_COLOR.muted}`}>납품 방법</label>
                      <p className={`mt-1 text-sm ${TEXT_COLOR.primary}`}>
                        {contact.delivery_method === 'company_address'
                          ? '회사주소로 납품'
                          : contact.delivery_method === 'delivery_company'
                            ? '납품받을 업체가 있습니다'
                            : contact.delivery_method || '-'}
                      </p>
                    </div>

                    {contact.delivery_method === 'delivery_company' && (
                      <>
                        <div>
                          <label className={`text-sm font-medium ${TEXT_COLOR.muted}`}>
                            납품업체명
                          </label>
                          <p className={`mt-1 text-sm ${TEXT_COLOR.primary}`}>
                            {contact.delivery_company_name || '-'}
                          </p>
                        </div>
                        <div>
                          <label className={`text-sm font-medium ${TEXT_COLOR.muted}`}>
                            연락처
                          </label>
                          <p className={`mt-1 text-sm ${TEXT_COLOR.primary}`}>
                            {contact.delivery_company_phone ? (
                              <a
                                href={`tel:${contact.delivery_company_phone}`}
                                className="text-orange-600 hover:underline"
                              >
                                {contact.delivery_company_phone}
                              </a>
                            ) : (
                              '-'
                            )}
                          </p>
                        </div>
                        <div>
                          <label className={`text-sm font-medium ${TEXT_COLOR.muted}`}>주소</label>
                          <p className={`mt-1 text-sm ${TEXT_COLOR.primary}`}>
                            {contact.delivery_company_address || '-'}
                          </p>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )}

              {/* 일정 조율 정보 */}
              {contact.receipt_method && (
                <div
                  id="visit-schedule-section"
                  className={`${BG_COLOR.card} rounded-lg p-4 scroll-mt-4`}
                >
                  <h3
                    className={`text-sm font-semibold ${TEXT_COLOR.primary} mb-3 border-b ${BORDER_COLOR.default} pb-2`}
                  >
                    일정 조율 정보
                  </h3>
                  <div className="space-y-3">
                    <div>
                      <label className={`text-sm font-medium ${TEXT_COLOR.muted}`}>수령 방법</label>
                      <p className={`mt-1 text-sm ${TEXT_COLOR.primary}`}>
                        {contact.receipt_method === 'visit'
                          ? '방문 수령'
                          : contact.receipt_method === 'delivery'
                            ? '택배 및 퀵으로 수령'
                            : contact.receipt_method || '-'}
                      </p>
                    </div>

                    {contact.receipt_method === 'visit' && (
                      <>
                        <div>
                          <label className={`text-sm font-medium ${TEXT_COLOR.muted}`}>
                            방문 날짜
                          </label>
                          <p className={`mt-1 text-sm ${TEXT_COLOR.primary}`}>
                            {contact.visit_date || '-'}
                          </p>
                        </div>
                        <div>
                          <label className={`text-sm font-medium ${TEXT_COLOR.muted}`}>
                            방문 시간
                          </label>
                          <p className={`mt-1 text-sm ${TEXT_COLOR.primary}`}>
                            {contact.visit_time_slot || '-'}
                          </p>
                        </div>
                        <div className={`${BG_COLOR.info} p-3 rounded`}>
                          <p className={`text-sm ${TEXT_COLOR.secondary}`}>
                            <strong>회사위치:</strong> 서울 중구 퇴계로39길 20, 2층 유진레이져목형
                            사무실
                          </p>
                          <p className={`text-sm ${TEXT_COLOR.muted} mt-1`}>
                            (평일 9:00 ~ 19:00 주말 및 공휴일 휴무)
                          </p>
                        </div>
                      </>
                    )}

                    {contact.receipt_method === 'delivery' && (
                      <>
                        <div>
                          <label className={`text-sm font-medium ${TEXT_COLOR.muted}`}>
                            배송 방법
                          </label>
                          <p className={`mt-1 text-sm ${TEXT_COLOR.primary}`}>
                            {contact.delivery_type === 'parcel'
                              ? '택배'
                              : contact.delivery_type === 'quick'
                                ? '퀵'
                                : '-'}
                          </p>
                        </div>
                        <div>
                          <label className={`text-sm font-medium ${TEXT_COLOR.muted}`}>
                            배송 주소
                          </label>
                          <p className={`mt-1 text-sm ${TEXT_COLOR.primary}`}>
                            {contact.delivery_address || '-'}
                          </p>
                        </div>
                        <div>
                          <label className={`text-sm font-medium ${TEXT_COLOR.muted}`}>
                            수령인
                          </label>
                          <p className={`mt-1 text-sm ${TEXT_COLOR.primary}`}>
                            {contact.delivery_name || '-'}
                          </p>
                        </div>
                        <div>
                          <label className={`text-sm font-medium ${TEXT_COLOR.muted}`}>
                            수령인 연락처
                          </label>
                          <p className={`mt-1 text-sm ${TEXT_COLOR.primary}`}>
                            {contact.delivery_phone ? (
                              <a
                                href={`tel:${contact.delivery_phone}`}
                                className="text-orange-600 hover:underline"
                              >
                                {contact.delivery_phone}
                              </a>
                            ) : (
                              '-'
                            )}
                          </p>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )}

              {/* 수정요청서 */}
              {contact.revision_request_title && (
                <div
                  id="revision-request-section"
                  className={`${BG_COLOR.error} rounded-lg p-4 border-l-4 border-red-500 scroll-mt-4`}
                >
                  <div className="flex items-center gap-2 mb-3">
                    <h3
                      className={`text-sm font-semibold ${TEXT_COLOR.primary} border-b ${BORDER_COLOR.default} pb-2 flex-1`}
                    >
                      수정요청서
                    </h3>
                    <span
                      className={`px-2 py-1 text-xs font-medium rounded-full ${BG_COLOR.errorLight} ${TEXT_COLOR.errorStrong} flex-shrink-0`}
                    >
                      수정요청
                    </span>
                  </div>
                  <div className="space-y-3">
                    <div>
                      <label className={`text-xs font-medium ${TEXT_COLOR.muted}`}>요청 제목</label>
                      <p className={`mt-1 text-sm ${TEXT_COLOR.primary} font-medium`}>
                        {contact.revision_request_title}
                      </p>
                    </div>
                    <div>
                      <label className={`text-xs font-medium ${TEXT_COLOR.muted}`}>요청 내용</label>
                      <div
                        className={`mt-1 p-3 ${BG_COLOR.card} rounded-lg border ${BORDER_COLOR.default}`}
                      >
                        <p className={`text-sm ${TEXT_COLOR.primary} whitespace-pre-wrap`}>
                          {contact.revision_request_content || '-'}
                        </p>
                      </div>
                    </div>
                    {contact.revision_requested_at && (
                      <div>
                        <label className={`text-xs font-medium ${TEXT_COLOR.muted}`}>
                          요청 일시
                        </label>
                        <p className={`mt-1 text-sm ${TEXT_COLOR.primary}`}>
                          {new Date(contact.revision_requested_at).toLocaleString('ko-KR')}
                        </p>
                      </div>
                    )}
                    {contact.revision_request_file_url && (
                      <div>
                        <label className={`text-xs font-medium ${TEXT_COLOR.muted}`}>
                          첨부 파일
                        </label>
                        <div
                          className={`mt-1 flex items-center justify-between p-2 ${BG_COLOR.card} rounded-lg border ${BORDER_COLOR.default}`}
                        >
                          <p className={`text-xs ${TEXT_COLOR.primary} flex-1 truncate mr-2`}>
                            {contact.revision_request_file_name || '파일명 없음'}
                          </p>
                          <DownloadButton
                            apiUrl={`/api/contacts/${contact.id}/file-download?type=revision_request`}
                            fileName={contact.revision_request_file_name}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* 첨부 파일 */}
              {(contact.attachment_url ||
                contact.attachment_filename ||
                contact.drawing_file_url ||
                contact.drawing_file_name ||
                contact.reference_photos_urls) && (
                <div className={`${BG_COLOR.card} rounded-lg p-4`}>
                  <h3
                    className={`text-sm font-semibold ${TEXT_COLOR.primary} mb-3 border-b ${BORDER_COLOR.default} pb-2`}
                  >
                    첨부 파일
                  </h3>
                  <div className="space-y-3">
                    {(contact.attachment_filename || contact.attachment_url) && (
                      <div
                        className={`border ${BORDER_COLOR.default} rounded-lg p-3 ${BG_COLOR.card}`}
                      >
                        <label className={`text-sm font-medium ${TEXT_COLOR.muted} block mb-2`}>
                          첨부 파일
                        </label>
                        <div className="flex items-center justify-between">
                          <p className={`text-sm ${TEXT_COLOR.primary} flex-1 truncate mr-2`}>
                            {contact.attachment_filename || '파일명 없음'}
                          </p>
                          {contact.attachment_url && (
                            <DownloadButton
                              apiUrl={`/api/contacts/${contact.id}/file-download?type=attachment`}
                              fileName={contact.attachment_filename}
                            />
                          )}
                        </div>
                      </div>
                    )}

                    {(contact.drawing_file_name || contact.drawing_file_url) && (
                      <div
                        className={`border ${BORDER_COLOR.default} rounded-lg p-3 ${BG_COLOR.card}`}
                      >
                        <label className={`text-sm font-medium ${TEXT_COLOR.muted} block mb-2`}>
                          도면 파일
                        </label>
                        <div className="flex items-center justify-between">
                          <p className={`text-sm ${TEXT_COLOR.primary} flex-1 truncate mr-2`}>
                            {contact.drawing_file_name || '파일명 없음'}
                          </p>
                          {contact.drawing_file_url && (
                            <DownloadButton
                              apiUrl={`/api/contacts/${contact.id}/file-download?type=drawing`}
                              fileName={contact.drawing_file_name}
                            />
                          )}
                        </div>
                      </div>
                    )}

                    {contact.reference_photos_urls && (
                      <div
                        className={`border ${BORDER_COLOR.default} rounded-lg p-3 ${BG_COLOR.card}`}
                      >
                        <label className={`text-sm font-medium ${TEXT_COLOR.muted} block mb-3`}>
                          참고 사진
                        </label>
                        <div className="space-y-2">
                          {(() => {
                            try {
                              const urls = JSON.parse(contact.reference_photos_urls) as string[];
                              if (urls.length === 0) return null;
                              return urls.map((url, idx) => (
                                <div
                                  key={idx}
                                  className={`flex items-center justify-between ${BG_COLOR.page} p-2 rounded border ${BORDER_COLOR.default}`}
                                >
                                  <span className={`text-sm ${TEXT_COLOR.primary}`}>
                                    사진 {idx + 1}
                                  </span>
                                  <DownloadButton
                                    apiUrl={`/api/contacts/${contact.id}/file-download?type=reference_photo&index=${idx}`}
                                    fileName={`reference-photo-${idx + 1}.jpg`}
                                  />
                                </div>
                              ));
                            } catch {
                              return (
                                <p className={`text-sm ${TEXT_COLOR.muted}`}>
                                  파일 정보를 불러올 수 없습니다.
                                </p>
                              );
                            }
                          })()}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* 상태 정보 - 업체 대시보드에서는 숨김 */}
              {!isCompanyView && (
                <div className={`${BG_COLOR.card} rounded-lg p-4`}>
                  <h3
                    className={`text-sm font-semibold ${TEXT_COLOR.primary} mb-3 border-b ${BORDER_COLOR.default} pb-2`}
                  >
                    상태 정보
                  </h3>
                  <div className="space-y-3">
                    {contact.status !== 'deleting' && (
                      <div>
                        <label className={`text-sm font-medium ${TEXT_COLOR.muted}`}>상태</label>
                        <div className="mt-1">
                          <UpdateStatusButton
                            contactId={contact.id}
                            currentStatus={contact.status}
                          />
                        </div>
                      </div>
                    )}
                    <div>
                      <label className={`text-sm font-medium ${TEXT_COLOR.muted}`}>등록일</label>
                      <p className={`mt-1 text-sm ${TEXT_COLOR.primary}`}>
                        {new Date(contact.created_at).toLocaleString('ko-KR')}
                      </p>
                    </div>
                    {contact.updated_at && (
                      <div>
                        <label className={`text-sm font-medium ${TEXT_COLOR.muted}`}>수정일</label>
                        <p className={`mt-1 text-sm ${TEXT_COLOR.primary}`}>
                          {new Date(contact.updated_at).toLocaleString('ko-KR')}
                        </p>
                      </div>
                    )}
                    {contact.status === 'deleting' && contact.deleted_at && (
                      <div>
                        <label className={`text-sm font-medium ${TEXT_COLOR.muted}`}>삭제일</label>
                        <p className={`mt-1 text-sm ${TEXT_COLOR.primary}`}>
                          {new Date(contact.deleted_at).toLocaleString('ko-KR')}
                        </p>
                        <p className={`mt-1 text-xs ${TEXT_COLOR.error}`}>
                          {getDaysUntilPermanentDelete(contact.deleted_at) > 0
                            ? `${getDaysUntilPermanentDelete(contact.deleted_at)}일 후 영구 삭제`
                            : '오늘 영구 삭제 예정'}
                        </p>
                      </div>
                    )}
                    {contact.status !== 'deleting' && (
                      <ConfirmButton contactId={contact.id} currentStatus={contact.status} />
                    )}
                    {contact.status === 'deleting' && (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={(e) => handleRestore(contact.id, e)}
                          disabled={restoringId === contact.id}
                          className={`w-full px-4 py-2.5 text-sm border ${BORDER_COLOR.default} rounded-lg ${BG_COLOR.infoMedium} ${TEXT_COLOR.infoDeep} ${BG_COLOR.hoverInfoStrong} transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2`}
                        >
                          <FaUndo className="text-sm" />
                          {restoringId === contact.id ? '복구 중...' : '복구'}
                        </button>
                        <button
                          onClick={(e) =>
                            handlePermanentDelete(
                              contact.id,
                              contact.company_name || contact.name || `문의 #${contact.id}`,
                              e
                            )
                          }
                          disabled={
                            restoringId === contact.id || permanentlyDeletingId === contact.id
                          }
                          className={`w-full px-4 py-2.5 text-sm border ${BORDER_COLOR.errorBorderMedium} rounded-lg ${BG_COLOR.errorMedium} ${TEXT_COLOR.errorDeep} ${BG_COLOR.hoverErrorStrong} transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2`}
                        >
                          <FaTrash className="text-sm" />
                          {permanentlyDeletingId === contact.id ? '삭제 중...' : '지금삭제'}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* 공정 단계 표시 */}
              <div className="mb-4">
                <ProcessStageIndicatorToggle
                  currentStage={contact.process_stage}
                  status={contact.status}
                  defaultExpanded={true}
                  disabled={isCompanyView} // 업체 대시보드에서는 읽기 전용
                  contactId={isCompanyView ? undefined : contact.id}
                />
              </div>

              {/* 도면 분할 버튼 - 분할 가능한 조건에서만 표시 */}
              {!isCompanyView &&
                contact.parent_contact_id == null &&
                (contact.split_count == null || contact.split_count === 0) &&
                (contact.process_stage == null ||
                  contact.process_stage === 'drawing' ||
                  contact.process_stage === 'drawing_confirmed') && (
                  <div className={`mb-4 pt-4 border-t ${BORDER_COLOR.default}`}>
                    <button
                      onClick={() => setIsSplitModalOpen(true)}
                      className={`w-full px-4 py-2.5 border ${BORDER_COLOR.default} ${BG_COLOR.muted} ${BG_COLOR.hoverDark} ${TEXT_COLOR.secondary} rounded-lg transition-colors font-medium text-sm`}
                    >
                      도면 분할
                    </button>
                  </div>
                )}

              {/* 작업시작 버튼 - 업체 대시보드에서는 숨김 */}
              {!isCompanyView && contact.status === 'received' && (
                <div className={`mb-4 pt-4 border-t ${BORDER_COLOR.default}`}>
                  <button
                    onClick={(e) => handleStartWork(contact.id, e)}
                    className="w-full px-4 py-2.5 bg-[#ED6C00] hover:bg-[#d15f00] text-white rounded-lg transition-colors font-medium text-sm"
                  >
                    작업시작
                  </button>
                </div>
              )}

              {/* 하단: 상태 변경 버튼 및 삭제 버튼 - 업체 대시보드에서는 숨김 */}
              {!isCompanyView && contact.status !== 'deleting' && (
                <div
                  className={`flex flex-row items-center justify-between gap-2 pt-4 border-t ${BORDER_COLOR.default}`}
                >
                  {/* 상태 변경 버튼들 */}
                  <div className="flex flex-wrap gap-2">
                    {/* 신규 상태가 아닐 때만 상태 변경 버튼 표시 */}
                    {contact.status !== 'received' && (
                      <>
                        {/* 보류 상태일 때는 도면작업으로 변경 버튼 표시 */}
                        {contact.status === 'on_hold' ? (
                          <button
                            onClick={async (e) => {
                              e.stopPropagation();
                              try {
                                const response = await fetch(`/api/contacts/${contact.id}/status`, {
                                  method: 'PATCH',
                                  headers: {
                                    'Content-Type': 'application/json',
                                  },
                                  body: JSON.stringify({ status: 'drawing' }),
                                });
                                if (response.ok) {
                                  queryClient.invalidateQueries({
                                    queryKey: queryKeys.contacts.all,
                                  });
                                  fetchContactDetail();
                                } else {
                                  alert('상태 변경에 실패했습니다.');
                                }
                              } catch (error) {
                                log.error('Error updating status', error);
                                alert('상태 변경 중 오류가 발생했습니다.');
                              }
                            }}
                            className="px-3 py-1.5 text-xs bg-[#ED6C00] hover:bg-[#d15f00] text-white rounded-lg transition-colors"
                          >
                            도면작업으로 변경
                          </button>
                        ) : (
                          <button
                            onClick={async (e) => {
                              e.stopPropagation();
                              try {
                                const response = await fetch(`/api/contacts/${contact.id}/status`, {
                                  method: 'PATCH',
                                  headers: {
                                    'Content-Type': 'application/json',
                                  },
                                  body: JSON.stringify({ status: 'on_hold' }),
                                });
                                if (response.ok) {
                                  queryClient.invalidateQueries({
                                    queryKey: queryKeys.contacts.all,
                                  });
                                  fetchContactDetail();
                                } else {
                                  alert('상태 변경에 실패했습니다.');
                                }
                              } catch (error) {
                                log.error('Error updating status', error);
                                alert('상태 변경 중 오류가 발생했습니다.');
                              }
                            }}
                            className={`px-3 py-1.5 text-xs ${BG_COLOR.muted} ${BG_COLOR.hoverDark} ${TEXT_COLOR.secondary} rounded-lg transition-colors`}
                          >
                            보류 중으로 변경
                          </button>
                        )}
                        {/* 수정작업중 → 삭제 (새 상태 체계에서는 불필요하지만 보류/작업 토글만 유지) */}
                        {false ? (
                          <button
                            onClick={async (e) => {
                              e.stopPropagation();
                            }}
                            className="px-3 py-1.5 text-xs bg-[#ED6C00] hover:bg-[#d15f00] text-white rounded-lg transition-colors"
                          >
                            placeholder
                          </button>
                        ) : (
                          <button
                            onClick={async (e) => {
                              e.stopPropagation();
                              try {
                                const response = await fetch(`/api/contacts/${contact.id}/status`, {
                                  method: 'PATCH',
                                  headers: {
                                    'Content-Type': 'application/json',
                                  },
                                  body: JSON.stringify({ status: 'drawing' }),
                                });
                                if (response.ok) {
                                  queryClient.invalidateQueries({
                                    queryKey: queryKeys.contacts.all,
                                  });
                                  fetchContactDetail();
                                } else {
                                  alert('상태 변경에 실패했습니다.');
                                }
                              } catch (error) {
                                log.error('Error updating status', error);
                                alert('상태 변경 중 오류가 발생했습니다.');
                              }
                            }}
                            className={`px-3 py-1.5 text-xs ${BG_COLOR.orangeMedium} ${BG_COLOR.hoverGrayToOrange} ${TEXT_COLOR.orangeMid} rounded-lg transition-colors`}
                          >
                            수정작업중으로 변경
                          </button>
                        )}
                      </>
                    )}
                  </div>
                  {/* 삭제 버튼 - 업체 대시보드에서는 숨김 */}
                  {!isCompanyView && (
                    <DeleteButton
                      contactId={contact.id}
                      contactName={contact.company_name || contact.name || `문의 #${contact.id}`}
                    />
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      {/* 분할 모달 */}
      {contact && (
        <SplitContactModal
          contact={contact}
          isOpen={isSplitModalOpen}
          onClose={() => setIsSplitModalOpen(false)}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: queryKeys.contacts.all });
            fetchContactDetail();
          }}
        />
      )}
    </div>
  );
}
