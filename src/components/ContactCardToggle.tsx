'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  FaChevronDown,
  FaExclamationCircle,
  FaDownload,
  FaUpload,
  FaCalendarAlt,
} from 'react-icons/fa';
import { ProcessStageIndicatorToggle } from '@/components/ProcessStageIndicatorToggle';
import { ContactTimeline } from '@/components/ContactTimeline';
import { useContactTimeline } from '@/lib/hooks/useContactTimeline';
import {
  getProcessStageInfo,
  getProcessProgress,
  isProcessStarted,
} from '@/lib/utils/processStages';
import { addWorkerNote } from '@/app/actions/contacts';
import { RevisionRequestModal } from './RevisionRequestModal';
import { DownloadButton } from './DownloadButton';
import { FileUpload } from './FileUpload';
import { BookingChangeModal } from '@/app/company/dashboard/components/shared/BookingChangeModal';
import { BookingCancelModal } from '@/app/company/dashboard/components/shared/BookingCancelModal';
import { useToast } from '@/hooks/useToast';
import { DASHBOARD_STATUS_BADGE, TEXT_COLOR, BORDER_COLOR, BG_COLOR } from '@/lib/styles';
import { logger } from '@/lib/utils/logger';
import { queryKeys } from '@/lib/react-query/queryKeys';
import { DRAWING_UPLOAD_ACCEPT_ATTR } from '@/lib/utils/file-upload-policy';
import { buildWebhardUrl } from '@/lib/utils/webhard-url';
import { getCompanyInquiryDisplayTitle } from '@/app/company/dashboard/displayTitle';
import DeliveryProofImage from '@/components/DeliveryProofImage';

const log = logger.createLogger('ContactCardToggle');
import {
  WebhardMoveButton,
  MemoButton,
  RevisionButton,
  BookingChangeButton,
  BookingCancelButton,
  ActionButtonGroup,
} from '@/components/ui/DashboardButtons';
import type { ProcessStage } from '@/lib/utils/processStages';
import type { RevisionRequestHistory, RevisionRequestHistoryItem } from '@/types/database.types';
import type { Booking } from '@/app/company/dashboard/types';

interface ContactCardToggleProps {
  contact: {
    id: string;
    company_name: string;
    name: string;
    position?: string | null;
    phone: string;
    email: string;
    status: string;
    process_stage: ProcessStage;
    drawing_type: string | null;
    length: string | null;
    width: string | null;
    height: string | null;
    material?: string | null;
    inquiry_title?: string | null;
    created_at: string;
    revision_request_title?: string | null;
    revision_request_content?: string | null;
    revision_requested_at?: string | null;
    revision_request_file_url?: string | null;
    revision_request_file_name?: string | null;
    revision_request_history?: RevisionRequestHistory | null;
    receipt_method?: string | null;
    visit_date?: string | null;
    visit_time_slot?: string | null;
    delivery_method?: string | null;
    delivery_name?: string | null;
    delivery_phone?: string | null;
    delivery_address?: string | null;
    delivery_proof_image?: string | null;
    delivery_complete_image?: string | null;
    attachment_filename?: string | null;
    attachment_url?: string | null;
    drawing_file_url?: string | null;
    drawing_file_name?: string | null;
    reference_photos_urls?: string | null;
    inquiry_type?: string | null;
    webhard_folder_id?: string | null;
    webhard_file_id?: string | null;
    // 포트폴리오 참고 정보
    portfolio_reference_url?: string | null;
    portfolio_reference_info?: {
      id: string | number;
      title: string;
      field?: string;
      type?: string;
      format?: string;
      size?: string;
      paper?: string;
      printing?: string;
      finishing?: string;
      imageUrl?: string;
    } | null;
  };
  statusInfo: {
    label: string;
    iconName: 'spinner' | 'eye' | 'checkCircle' | 'fileAlt';
    color: string;
    bgColor: string;
  };
  booking?: Booking | null;
  onBookingChange?: () => void;
  variant?: 'mobile' | 'tablet' | 'desktop';
  company?: {
    manager_name?: string;
    manager_phone?: string;
    business_address?: string;
  } | null;
  expanded?: boolean;
  onToggle?: () => void;
}

export function ContactCardToggle({
  contact,
  statusInfo,
  booking,
  onBookingChange,
  variant = 'desktop',
  company,
  expanded,
  onToggle,
}: ContactCardToggleProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [internalExpanded, setInternalExpanded] = useState(false);
  const isExpanded = expanded !== undefined ? expanded : internalExpanded;
  const [isRevisionModalOpen, setIsRevisionModalOpen] = useState(false);
  const [isBookingChangeModalOpen, setIsBookingChangeModalOpen] = useState(false);
  const [isBookingCancelModalOpen, setIsBookingCancelModalOpen] = useState(false);
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isRequestModalOpen, setIsRequestModalOpen] = useState(false);
  const [requestContent, setRequestContent] = useState('');
  const [isSubmittingRequest, setIsSubmittingRequest] = useState(false);
  const { success, error: errorToast } = useToast();
  const webhardUrl = buildWebhardUrl(contact.webhard_folder_id, contact.webhard_file_id);
  const displayInquiryTitle = getCompanyInquiryDisplayTitle({
    inquiryTitle: contact.inquiry_title,
    companyName: contact.company_name,
    fallbackTitle: `문의 #${contact.id}`,
  });

  const handleOpenWebhard = useCallback(() => {
    if (!webhardUrl) return;
    router.push(webhardUrl);
  }, [router, webhardUrl]);

  const renderWebhardMoveButton = () => (
    <WebhardMoveButton
      onClick={handleOpenWebhard}
      disabled={!webhardUrl}
      title={webhardUrl ? '문의 폴더로 이동' : '연결된 문의 폴더가 없습니다'}
    />
  );

  // 통합 타임라인 (서버에서 거래처 필터/마스킹 적용됨, 카드 펼쳐졌을 때 로드)
  const { entries: timelineEntries } = useContactTimeline(contact.id, {
    externalExpanded: isExpanded,
  });

  // 수정요청 가능한 상태인지 확인
  const canRequestRevision =
    contact.status === 'in_progress' ||
    contact.status === 'read' ||
    contact.status === 'completed' ||
    contact.status === 'replied' ||
    contact.status === 'revision_in_progress' ||
    contact.status === 'cutting' ||
    contact.status === 'drawing' ||
    contact.status === 'confirmed' ||
    contact.status === 'production' ||
    contact.status === 'finishing';

  const handleRevisionSuccess = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.contacts.detail(contact.id) });
  };

  const handleSubmitRequest = useCallback(async () => {
    if (!requestContent.trim() || isSubmittingRequest) return;
    setIsSubmittingRequest(true);
    try {
      const result = await addWorkerNote(contact.id, {
        type: 'request',
        content: requestContent.trim(),
        workerName: contact.company_name || '업체',
      });
      if (result.success) {
        success('메모가 등록되었습니다.');
        setRequestContent('');
        setIsRequestModalOpen(false);
      } else {
        errorToast(result.error || '등록에 실패했습니다.');
      }
    } catch {
      errorToast('등록 중 오류가 발생했습니다.');
    } finally {
      setIsSubmittingRequest(false);
    }
  }, [contact.id, contact.company_name, requestContent, isSubmittingRequest, success, errorToast]);

  const handleFileUpload = async (files: File[]) => {
    if (files.length === 0) return;

    setIsUploading(true);
    setUploadError(null);

    try {
      const formData = new FormData();
      const imageFiles: File[] = [];
      const otherFiles: File[] = [];

      files.forEach((file) => {
        if (file.type.startsWith('image/')) {
          imageFiles.push(file);
        } else {
          otherFiles.push(file);
        }
      });

      if (otherFiles.length > 0) {
        formData.append('attachment', otherFiles[0]);
      }
      if (otherFiles.length > 1) {
        formData.append('drawing_file', otherFiles[1]);
      }
      imageFiles.forEach((file) => {
        formData.append('reference_photos', file);
      });
      if (otherFiles.length === 1 && imageFiles.length === 0) {
        formData.append('attachment', otherFiles[0]);
      }

      const response = await fetch(`/api/contacts/${contact.id}/files`, {
        method: 'PUT',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || '파일 업로드에 실패했습니다.');
      }

      success('파일 업로드', '파일이 성공적으로 업로드되었습니다.');
      setUploadFiles([]);

      if (onBookingChange) {
        onBookingChange();
      } else {
        queryClient.invalidateQueries({ queryKey: queryKeys.contacts.detail(contact.id) });
      }
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : '파일 업로드 중 오류가 발생했습니다.';
      setUploadError(errorMessage);
      errorToast('파일 업로드 실패', errorMessage);
    } finally {
      setIsUploading(false);
    }
  };

  // 공정 진행률 계산 (납품완료: processStage=null → 100%)
  const isStarted = isProcessStarted(contact.status);
  const isAllCompleted = contact.status === 'delivered' || contact.status === 'completed';
  const progress = isAllCompleted ? 100 : isStarted ? getProcessProgress(contact.process_stage) : 0;
  const stageInfo = contact.process_stage ? getProcessStageInfo(contact.process_stage) : null;

  // 상태 카테고리: 접수 / 작업중 / 납품
  const getSimplifiedBadge = () => {
    if (contact.status === 'delivered' || contact.status === 'completed') {
      return {
        label: contact.inquiry_type === 'laser_cutting' ? '완료' : '납품',
        style: 'text-white border-green-600 bg-green-600',
        inlineStyle: undefined,
      };
    }
    if (contact.status === 'received') {
      return {
        label: '접수',
        style: 'bg-gray-500 text-white border-gray-500',
        inlineStyle: undefined,
      };
    }
    return {
      label: '작업중',
      style: 'bg-[#ED6C00] text-white border-[#ED6C00]',
      inlineStyle: undefined,
    };
  };
  const simplifiedBadge = getSimplifiedBadge();

  return (
    <div
      className={`${isAllCompleted ? 'border-green-700 transition-all duration-500' : `${BG_COLOR.gradientCard} ${BORDER_COLOR.default}/50`} rounded-2xl overflow-hidden border shadow-xl`}
      style={isAllCompleted ? { background: '#16a34a' } : undefined}
    >
      {/* 헤더 (항상 표시) */}
      <div
        onClick={() => (onToggle ? onToggle() : setInternalExpanded(!internalExpanded))}
        className={`p-4 sm:p-5 cursor-pointer transition-colors ${isAllCompleted ? '' : BG_COLOR.hoverCardHeader}`}
      >
        <div className="flex flex-col gap-3">
          {/* 첫 번째 줄: 상태 배지, 제목, 문의일, 토글 */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
              <span
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] sm:text-xs font-medium border flex-shrink-0 ${simplifiedBadge.style}`}
                style={simplifiedBadge.inlineStyle}
              >
                {simplifiedBadge.label}
              </span>
              <h3
                className={`text-sm sm:text-base font-semibold truncate ${isAllCompleted ? 'text-white' : '${TEXT_COLOR.strong}'}`}
              >
                {displayInquiryTitle}
              </h3>
              <span
                className={`hidden sm:inline-flex items-center gap-1.5 text-xs flex-shrink-0 ${isAllCompleted ? 'text-white/70' : TEXT_COLOR.muted}`}
              >
                <FaCalendarAlt
                  className={`text-[10px] ${isAllCompleted ? 'text-white/50' : '${TEXT_COLOR.dim}'}`}
                />
                {new Date(contact.created_at).toLocaleDateString('ko-KR', {
                  month: 'short',
                  day: 'numeric',
                })}
              </span>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {/* 모바일에서만 표시되는 문의일 */}
              <span
                className={`sm:hidden text-xs ${isAllCompleted ? 'text-white/70' : TEXT_COLOR.muted}`}
              >
                {new Date(contact.created_at).toLocaleDateString('ko-KR', {
                  month: 'numeric',
                  day: 'numeric',
                })}
              </span>
              <motion.div
                animate={{ rotate: isExpanded ? 180 : 0 }}
                transition={{ duration: 0.3 }}
                className={`p-1.5 rounded-lg ${isAllCompleted ? '' : BG_COLOR.hoverCardChevron}`}
              >
                <FaChevronDown
                  className={`text-sm ${isAllCompleted ? 'text-white/70' : TEXT_COLOR.muted}`}
                />
              </motion.div>
            </div>
          </div>

          {/* 두 번째 줄: 현재 상태 요약 (접혀있을 때만) */}
          {!isExpanded && (
            <div className="space-y-2">
              {/* 현재 상태 + 액션 버튼 (같은 줄) */}
              {isAllCompleted ? (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <span className="inline-flex items-center px-3 py-1 rounded-full bg-white/20 text-white text-xs sm:text-sm font-semibold">
                      {contact.inquiry_type === 'laser_cutting' ? '가공완료' : '납품 완료'}
                    </span>
                    <span className="text-xs sm:text-sm text-white/80">되었습니다.</span>
                  </div>
                  <ActionButtonGroup>
                    {renderWebhardMoveButton()}
                    <MemoButton onClick={() => setIsRequestModalOpen(true)} />
                    {canRequestRevision && (
                      <RevisionButton
                        onClick={() => setIsRevisionModalOpen(true)}
                        isAdditional={contact.status === 'revision_in_progress'}
                      />
                    )}
                  </ActionButtonGroup>
                </div>
              ) : isStarted ? (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <span className="text-xs sm:text-sm text-gray-400">현재</span>
                    <span className="inline-flex items-center px-3 py-1 rounded-full bg-[#ED6C00] text-white text-xs sm:text-sm font-semibold">
                      {stageInfo?.label || '공정 진행중'}
                    </span>
                    <span className="text-xs sm:text-sm text-gray-400">진행중입니다</span>
                  </div>
                  <ActionButtonGroup>
                    {renderWebhardMoveButton()}
                    <MemoButton onClick={() => setIsRequestModalOpen(true)} />
                    {canRequestRevision && (
                      <RevisionButton
                        onClick={() => setIsRevisionModalOpen(true)}
                        isAdditional={contact.status === 'revision_in_progress'}
                      />
                    )}
                    {booking && contact.visit_date && (
                      <>
                        <BookingChangeButton onClick={() => setIsBookingChangeModalOpen(true)} />
                        <BookingCancelButton onClick={() => setIsBookingCancelModalOpen(true)} />
                      </>
                    )}
                  </ActionButtonGroup>
                </div>
              ) : (
                <p className="text-gray-400 text-xs sm:text-sm">공정이 아직 시작되지 않았습니다</p>
              )}

              {/* 수정요청 알림 */}
              {contact.revision_request_title && (
                <div
                  className={`flex items-center gap-2 p-2 ${BG_COLOR.errorMedium}/20 rounded-lg border ${BORDER_COLOR.redAlphaMedium}`}
                >
                  <FaExclamationCircle className={`${TEXT_COLOR.errorMid} text-xs flex-shrink-0`} />
                  <span className={`text-[10px] sm:text-xs ${TEXT_COLOR.redLight} truncate`}>
                    수정요청: {contact.revision_request_title}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 상세 정보 (펼쳤을 때) */}
      <motion.div
        initial={false}
        animate={{
          height: isExpanded ? 'auto' : 0,
          opacity: isExpanded ? 1 : 0,
        }}
        transition={{ duration: 0.3 }}
        className="overflow-hidden"
      >
        <div
          className={`px-4 sm:px-5 pb-4 sm:pb-5 space-y-4 ${isAllCompleted ? `mx-3 mb-3 p-4 ${BG_COLOR.whiteAlpha95} rounded-xl` : ''}`}
        >
          {/* 구분선 */}
          {!isAllCompleted && <div className={`border-t ${BORDER_COLOR.default}`} />}

          {/* 기본 정보 (업체 포털에서는 자사 정보이므로 최소화) */}
          <div className="grid grid-cols-2 gap-2 sm:gap-3">
            <InfoCard
              label="문의일"
              value={new Date(contact.created_at).toLocaleDateString('ko-KR', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
              })}
            />
          </div>

          {/* 포트폴리오 참고 제품 */}
          {contact.portfolio_reference_url && contact.portfolio_reference_info && (
            <a
              href={contact.portfolio_reference_url}
              target="_blank"
              rel="noopener noreferrer"
              className="block bg-[#ED6C00]/5 rounded-xl p-3 sm:p-4 border border-[#ED6C00]/20 hover:bg-[#ED6C00]/10 transition-colors cursor-pointer"
            >
              <p className={`${TEXT_COLOR.muted} text-[10px] sm:text-xs mb-2`}>참고 제품</p>
              <div className="flex items-start gap-3">
                {contact.portfolio_reference_info.imageUrl && (
                  <div className="flex-shrink-0">
                    <img
                      src={contact.portfolio_reference_info.imageUrl}
                      alt={contact.portfolio_reference_info.title}
                      className="w-14 h-14 sm:w-16 sm:h-16 object-cover rounded-lg border border-[#ED6C00]/20"
                    />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="inline-flex items-center px-1.5 py-0.5 bg-[#ED6C00] text-white text-[10px] rounded-full">
                      참고 제품
                    </span>
                    {contact.portfolio_reference_info.field && (
                      <span className="inline-flex items-center px-1.5 py-0.5 bg-[#ED6C00]/10 text-[#ED6C00] text-[10px] rounded-full">
                        {contact.portfolio_reference_info.field}
                      </span>
                    )}
                  </div>
                  <p className={`text-xs sm:text-sm ${TEXT_COLOR.strong}`}>
                    {contact.portfolio_reference_info.title}
                  </p>
                  <div className={`mt-1 text-[10px] ${TEXT_COLOR.muted} space-y-0.5`}>
                    {contact.portfolio_reference_info.format && (
                      <p>형태: {contact.portfolio_reference_info.format}</p>
                    )}
                    {contact.portfolio_reference_info.size && (
                      <p>크기: {contact.portfolio_reference_info.size}</p>
                    )}
                    {contact.portfolio_reference_info.paper && (
                      <p>용지: {contact.portfolio_reference_info.paper}</p>
                    )}
                    {contact.portfolio_reference_info.finishing && (
                      <p>후가공: {contact.portfolio_reference_info.finishing}</p>
                    )}
                  </div>
                  <p className="mt-2 text-[10px] text-[#ED6C00]">
                    위 제품을 참고하여 문의를 진행합니다
                  </p>
                </div>
              </div>
            </a>
          )}

          {/* 도면 정보 */}
          {contact.drawing_type && (
            <div
              className={`${BG_COLOR.weakLight} rounded-xl p-3 sm:p-4 border ${BORDER_COLOR.softDark}`}
            >
              <p className={`${TEXT_COLOR.muted} text-[10px] sm:text-xs mb-2`}>도면 정보</p>
              <div className="flex flex-wrap gap-2">
                <span
                  className={`px-2 py-1 ${BG_COLOR.grayTranslucent} ${TEXT_COLOR.softMuted} rounded-lg text-[10px] sm:text-xs border ${BORDER_COLOR.grayAlphaMedium}`}
                >
                  {contact.drawing_type === 'create' ? '도면 제작 필요' : '도면 보유'}
                </span>
                {contact.material && (
                  <span
                    className={`px-2 py-1 ${BG_COLOR.grayTranslucent} ${TEXT_COLOR.softMuted} rounded-lg text-[10px] sm:text-xs border ${BORDER_COLOR.grayAlphaMedium}`}
                  >
                    재질: {contact.material}
                  </span>
                )}
                {contact.length && contact.width && contact.height && (
                  <span
                    className={`px-2 py-1 ${BG_COLOR.grayTranslucent} ${TEXT_COLOR.softMuted} rounded-lg text-[10px] sm:text-xs border ${BORDER_COLOR.grayAlphaMedium}`}
                  >
                    크기: {contact.length} × {contact.width} × {contact.height}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* 수령 방법 */}
          {contact.receipt_method && (
            <div
              className={`${BG_COLOR.weakLight} rounded-xl p-3 sm:p-4 border ${BORDER_COLOR.softDark}`}
            >
              <p className={`${TEXT_COLOR.muted} text-[10px] sm:text-xs mb-2`}>수령 방법</p>
              <p className={`${TEXT_COLOR.strong} text-xs sm:text-sm font-medium mb-2`}>
                {contact.receipt_method === 'visit'
                  ? '방문 수령'
                  : contact.receipt_method === 'delivery'
                    ? '배송 수령'
                    : contact.receipt_method}
              </p>
              {contact.receipt_method === 'visit' &&
                (contact.visit_date || contact.visit_time_slot) && (
                  <div className="grid grid-cols-2 gap-2 mt-2">
                    {contact.visit_date && (
                      <div className={`${BG_COLOR.weakMedium} rounded-lg p-2`}>
                        <p className="text-gray-500 text-[10px] mb-0.5">방문 날짜</p>
                        <p className={`${TEXT_COLOR.bright} text-[10px] sm:text-xs`}>
                          {new Date(contact.visit_date).toLocaleDateString('ko-KR', {
                            month: 'short',
                            day: 'numeric',
                            weekday: 'short',
                          })}
                        </p>
                      </div>
                    )}
                    {contact.visit_time_slot && (
                      <div className={`${BG_COLOR.weakMedium} rounded-lg p-2`}>
                        <p className="text-gray-500 text-[10px] mb-0.5">방문 시간</p>
                        <p className={`${TEXT_COLOR.bright} text-[10px] sm:text-xs`}>
                          {contact.visit_time_slot}
                        </p>
                      </div>
                    )}
                  </div>
                )}
              {contact.receipt_method === 'delivery' && contact.delivery_method && (
                <div className="mt-2 space-y-2">
                  <p className={`${TEXT_COLOR.softMuted} text-[10px] sm:text-xs`}>
                    {contact.delivery_method === 'company_address'
                      ? '회사 주소로 배송'
                      : contact.delivery_method === 'delivery_company'
                        ? '납품업체 배송'
                        : contact.delivery_method}
                  </p>
                  {contact.delivery_method === 'delivery_company' && (
                    <div className="grid grid-cols-2 gap-2">
                      {contact.delivery_name && (
                        <div className={`${BG_COLOR.weakMedium} rounded-lg p-2`}>
                          <p className="text-gray-500 text-[10px] mb-0.5">수령인</p>
                          <p className={`${TEXT_COLOR.bright} text-[10px] sm:text-xs`}>
                            {contact.delivery_name}
                          </p>
                        </div>
                      )}
                      {contact.delivery_phone && (
                        <div className={`${BG_COLOR.weakMedium} rounded-lg p-2`}>
                          <p className="text-gray-500 text-[10px] mb-0.5">연락처</p>
                          <p className={`${TEXT_COLOR.bright} text-[10px] sm:text-xs`}>
                            {contact.delivery_phone}
                          </p>
                        </div>
                      )}
                      {contact.delivery_address && (
                        <div className={`col-span-2 ${BG_COLOR.weakMedium} rounded-lg p-2`}>
                          <p className="text-gray-500 text-[10px] mb-0.5">배송 주소</p>
                          <p className={`${TEXT_COLOR.bright} text-[10px] sm:text-xs`}>
                            {contact.delivery_address}
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* 업로드된 파일 */}
          {(contact.attachment_url ||
            contact.drawing_file_url ||
            contact.reference_photos_urls) && (
            <div
              className={`${BG_COLOR.weakLight} rounded-xl p-3 sm:p-4 border ${BORDER_COLOR.softDark}`}
            >
              <div className="flex items-center gap-2 mb-3">
                <FaDownload className="text-[#ED6C00] text-xs" />
                <p className={`${TEXT_COLOR.muted} text-[10px] sm:text-xs`}>업로드된 파일</p>
              </div>
              <div className="space-y-2">
                {contact.attachment_url && (
                  <FileItem
                    name={contact.attachment_filename || '첨부 파일'}
                    url={contact.attachment_url}
                  />
                )}
                {contact.drawing_file_url && (
                  <FileItem
                    name={contact.drawing_file_name || '도면 파일'}
                    url={contact.drawing_file_url}
                  />
                )}
                {contact.reference_photos_urls && (
                  <>
                    {(() => {
                      try {
                        const urls = JSON.parse(contact.reference_photos_urls) as string[];
                        return urls.map((url, index) => (
                          <FileItem key={index} name={`참고 사진 ${index + 1}`} url={url} />
                        ));
                      } catch {
                        return null;
                      }
                    })()}
                  </>
                )}
              </div>
            </div>
          )}

          {/* 파일 재업로드 */}
          <div
            className={`${BG_COLOR.weakLight} rounded-xl p-3 sm:p-4 border ${BORDER_COLOR.softDark}`}
          >
            <div className="flex items-center gap-2 mb-3">
              <FaUpload className="text-[#ED6C00] text-xs" />
              <p className={`${TEXT_COLOR.muted} text-[10px] sm:text-xs`}>파일 재업로드</p>
            </div>
            {uploadError && (
              <div
                className={`mb-2 p-2 ${BG_COLOR.errorMedium}/20 border ${BORDER_COLOR.redAlphaMedium} rounded-lg`}
              >
                <p className={`text-[10px] sm:text-xs ${TEXT_COLOR.redLight}`}>{uploadError}</p>
              </div>
            )}
            <div onClick={(e) => e.stopPropagation()}>
              <FileUpload
                name="file_upload"
                id="file_upload"
                multiple={true}
                accept={DRAWING_UPLOAD_ACCEPT_ATTR}
                maxSize={10485760}
                files={uploadFiles}
                onChange={handleFileUpload}
                disabled={isUploading}
                label=""
                helpText=""
              />
            </div>
            {isUploading && (
              <p className={`mt-2 text-[10px] sm:text-xs ${TEXT_COLOR.muted}`}>파일 업로드 중...</p>
            )}
          </div>

          {/* 납품 증빙 사진 (납품완료 시) */}
          {isAllCompleted && (contact.delivery_proof_image || contact.delivery_complete_image) && (
            <div
              className={`${BG_COLOR.grayDark} rounded-xl p-3 sm:p-4 border ${BORDER_COLOR.default}`}
            >
              <p className={`${TEXT_COLOR.secondary} text-[10px] sm:text-xs font-medium mb-2`}>
                납품 증빙 사진
              </p>
              <div className="flex gap-2 overflow-x-auto">
                {contact.delivery_proof_image && (
                  <DeliveryProofImage
                    contactId={contact.id}
                    className="w-24 h-24 sm:w-32 sm:h-32 object-cover rounded-lg border border-gray-200"
                  />
                )}
                {contact.delivery_complete_image && (
                  <DeliveryPhoto src={contact.delivery_complete_image} label="완료 사진" />
                )}
              </div>
            </div>
          )}

          {/* 실시간 공정현황 */}
          <ProcessStageIndicatorToggle
            currentStage={contact.process_stage}
            status={contact.status}
            disabled={true}
            inquiryType={contact.inquiry_type}
          />

          {/* 통합 타임라인 (status_change + drawing_revision, 서버 필터 적용) */}
          {timelineEntries.length > 0 && (
            <div
              className={`${BG_COLOR.light} rounded-xl p-3 sm:p-4 border ${BORDER_COLOR.default}`}
            >
              <p className={`${TEXT_COLOR.muted} text-[10px] sm:text-xs mb-2`}>타임라인</p>
              <ContactTimeline entries={timelineEntries} showActor />
            </div>
          )}

          {/* 수정요청서 */}
          {contact.revision_request_title && (
            <div
              className={`${BG_COLOR.errorMedium}/20 rounded-xl p-3 sm:p-4 border ${BORDER_COLOR.redAlphaMedium}`}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <FaExclamationCircle className={`${TEXT_COLOR.errorMid} text-xs`} />
                  <h3 className={`${TEXT_COLOR.strong} text-xs sm:text-sm font-semibold`}>
                    수정요청서
                  </h3>
                </div>
                <span
                  className={`px-2 py-0.5 text-[10px] font-medium rounded-full ${BG_COLOR.revisionBadge} ${TEXT_COLOR.redLight} border ${BORDER_COLOR.revisionBadge}`}
                >
                  수정요청
                </span>
              </div>
              <div className="space-y-3">
                <div>
                  <p className="text-gray-500 text-[10px] mb-1">요청 제목</p>
                  <p className={`${TEXT_COLOR.strong} text-xs sm:text-sm font-medium`}>
                    {contact.revision_request_title}
                  </p>
                </div>
                <div>
                  <p className="text-gray-500 text-[10px] mb-1">요청 내용</p>
                  <div
                    className={`p-2 sm:p-3 ${BG_COLOR.white}/50 rounded-lg border ${BORDER_COLOR.default}/50`}
                  >
                    <p
                      className={`${TEXT_COLOR.bright} text-[10px] sm:text-xs whitespace-pre-wrap`}
                    >
                      {contact.revision_request_content || '-'}
                    </p>
                  </div>
                </div>
                {contact.revision_requested_at && (
                  <div>
                    <p className="text-gray-500 text-[10px] mb-1">요청 일시</p>
                    <p className={`${TEXT_COLOR.bright} text-[10px] sm:text-xs`}>
                      {new Date(contact.revision_requested_at).toLocaleString('ko-KR')}
                    </p>
                  </div>
                )}
                {contact.revision_request_file_url && (
                  <div>
                    <p className="text-gray-500 text-[10px] mb-1">첨부 파일</p>
                    <FileItem
                      name={contact.revision_request_file_name || '파일명 없음'}
                      url={contact.revision_request_file_url}
                    />
                  </div>
                )}

                {/* 이전 수정요청 히스토리 */}
                {contact.revision_request_history &&
                  Array.isArray(contact.revision_request_history) &&
                  contact.revision_request_history.length > 0 && (
                    <div className={`pt-3 border-t ${BORDER_COLOR.redAlphaLight}`}>
                      <h4 className={`${TEXT_COLOR.muted} text-[10px] font-semibold mb-2`}>
                        이전 수정요청 기록 ({contact.revision_request_history.length}건)
                      </h4>
                      <div className="space-y-2">
                        {contact.revision_request_history
                          .slice()
                          .reverse()
                          .map((historyItem: RevisionRequestHistoryItem, index: number) => (
                            <div
                              key={index}
                              className={`p-2 sm:p-3 ${BG_COLOR.white}/30 rounded-lg border ${BORDER_COLOR.default}/30`}
                            >
                              <p
                                className={`${TEXT_COLOR.secondary} text-[10px] sm:text-xs font-medium mb-1`}
                              >
                                {historyItem.title || '-'}
                              </p>
                              <p className={`${TEXT_COLOR.muted} text-[10px] line-clamp-2`}>
                                {historyItem.content || '-'}
                              </p>
                              {historyItem.requested_at && (
                                <p className="text-gray-500 text-[10px] mt-1">
                                  {new Date(historyItem.requested_at).toLocaleString('ko-KR')}
                                </p>
                              )}
                              {historyItem.file_url && (
                                <div className="mt-2" onClick={(e) => e.stopPropagation()}>
                                  <DownloadButton
                                    url={historyItem.file_url}
                                    fileName={historyItem.file_name}
                                  />
                                </div>
                              )}
                            </div>
                          ))}
                      </div>
                    </div>
                  )}
              </div>
            </div>
          )}

          {/* 하단 액션 버튼들 */}
          <ActionButtonGroup>
            {renderWebhardMoveButton()}
            <MemoButton onClick={() => setIsRequestModalOpen(true)} />
            {canRequestRevision && (
              <RevisionButton
                onClick={() => setIsRevisionModalOpen(true)}
                isAdditional={contact.status === 'revision_in_progress'}
              />
            )}
            {booking && contact.visit_date && (
              <>
                <BookingChangeButton onClick={() => setIsBookingChangeModalOpen(true)} />
                <BookingCancelButton onClick={() => setIsBookingCancelModalOpen(true)} />
              </>
            )}
          </ActionButtonGroup>
        </div>
      </motion.div>

      {/* 모달들 */}
      <RevisionRequestModal
        isOpen={isRevisionModalOpen}
        onClose={() => setIsRevisionModalOpen(false)}
        contactId={contact.id}
        contactTitle={displayInquiryTitle}
        onSuccess={handleRevisionSuccess}
      />

      {booking && (
        <BookingChangeModal
          isOpen={isBookingChangeModalOpen}
          onClose={() => setIsBookingChangeModalOpen(false)}
          booking={booking}
          onSuccess={() => {
            setIsBookingChangeModalOpen(false);
            if (onBookingChange) {
              onBookingChange();
            }
          }}
          variant={variant}
        />
      )}

      {booking && (
        <BookingCancelModal
          isOpen={isBookingCancelModalOpen}
          onClose={() => setIsBookingCancelModalOpen(false)}
          booking={booking}
          onSuccess={async (deliveryInfo) => {
            try {
              const response = await fetch(`/api/bookings/${booking.id}`, {
                method: 'DELETE',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  deliveryMethod: deliveryInfo.deliveryMethod,
                  deliveryName: deliveryInfo.name,
                  deliveryPhone: deliveryInfo.phone,
                  deliveryAddress: deliveryInfo.address,
                }),
              });

              if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || '예약 취소에 실패했습니다.');
              }

              setIsBookingCancelModalOpen(false);
              if (onBookingChange) {
                onBookingChange();
              }
            } catch (error) {
              log.error('Error cancelling booking:', error);
              alert(error instanceof Error ? error.message : '예약 취소 중 오류가 발생했습니다.');
            }
          }}
          variant={variant}
          defaultName={company?.manager_name || ''}
          defaultPhone={company?.manager_phone || ''}
          defaultAddress={company?.business_address || ''}
        />
      )}

      {/* 메모 모달 */}
      {isRequestModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={() => setIsRequestModalOpen(false)}
        >
          <div
            className={`${BG_COLOR.card} rounded-2xl p-5 w-full max-w-md mx-4 shadow-2xl`}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className={`text-base font-bold ${TEXT_COLOR.primary} mb-3`}>메모</h3>
            <p className={`text-xs ${TEXT_COLOR.muted} mb-3`}>{displayInquiryTitle}</p>
            <textarea
              value={requestContent}
              onChange={(e) => setRequestContent(e.target.value)}
              placeholder="메모를 입력해주세요 (최대 500자)"
              maxLength={500}
              rows={4}
              className={`w-full p-3 border ${BORDER_COLOR.default} rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[#ED6C00] ${BG_COLOR.muted}`}
            />
            <div className="flex justify-end gap-2 mt-3">
              <button
                onClick={() => {
                  setIsRequestModalOpen(false);
                  setRequestContent('');
                }}
                className={`px-4 py-2 text-sm font-medium ${TEXT_COLOR.muted} border ${BORDER_COLOR.default} rounded-lg hover:bg-gray-50`}
              >
                취소
              </button>
              <button
                onClick={handleSubmitRequest}
                disabled={!requestContent.trim() || isSubmittingRequest}
                className="px-4 py-2 text-sm font-medium text-white bg-[#ED6C00] rounded-lg hover:bg-[#d15f00] disabled:bg-gray-300 disabled:cursor-not-allowed"
              >
                {isSubmittingRequest ? '등록중...' : '등록'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// 정보 카드 컴포넌트
function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div
      className={`${BG_COLOR.weakLight} rounded-lg sm:rounded-xl p-2 sm:p-3 border ${BORDER_COLOR.softDark}`}
    >
      <p className="text-gray-500 text-[10px] mb-0.5 sm:mb-1">{label}</p>
      <p className={`${TEXT_COLOR.primary} text-[10px] sm:text-xs font-medium truncate`}>{value}</p>
    </div>
  );
}

// 납품 사진 (엑박 시 텍스트 fallback)
function DeliveryPhoto({ src, label }: { src: string; label: string }) {
  const [error, setError] = useState(false);
  if (error) {
    return (
      <div
        className={`w-24 h-24 sm:w-32 sm:h-32 flex flex-col items-center justify-center rounded-lg border ${BORDER_COLOR.default} ${BG_COLOR.light} gap-1`}
      >
        <span className="text-[10px] text-gray-400">⚠</span>
        <span className="text-[10px] sm:text-xs text-gray-400 text-center px-2 leading-tight">
          사진을 확인할 수 없습니다
        </span>
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={label}
      className="w-24 h-24 sm:w-32 sm:h-32 object-cover rounded-lg border border-gray-200"
      onError={() => setError(true)}
    />
  );
}

// 파일 아이템 컴포넌트
function FileItem({ name, url }: { name: string; url: string }) {
  return (
    <div
      className={`flex items-center justify-between p-2 ${BG_COLOR.weakMedium} rounded-lg border ${BORDER_COLOR.grayAlphaLight}`}
    >
      <p className={`${TEXT_COLOR.bright} text-[10px] sm:text-xs flex-1 truncate mr-2`}>{name}</p>
      <div onClick={(e) => e.stopPropagation()}>
        <DownloadButton url={url} fileName={name} />
      </div>
    </div>
  );
}
