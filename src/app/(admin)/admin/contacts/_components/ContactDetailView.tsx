/**
 * 문의 상세 뷰 컴포넌트 (펼친 상태)
 */
'use client';

import { memo, useState, useMemo, useCallback } from 'react';
import { TEXT_COLOR, BG_COLOR, BORDER_COLOR, BADGE } from '@/lib/styles';
import type { Contact } from '@/lib/types';
import { useContactTimeline } from '@/lib/hooks/useContactTimeline';
import { useMinLoadingState } from '@/lib/hooks/useMinLoadingState';
import { DownloadButton } from '@/components/DownloadButton';
import { ProcessStageIndicatorToggle } from '@/components/ProcessStageIndicatorToggle';
import { ContactTimeline, ContactTimelineSkeleton } from '@/components/ContactTimeline';
import { DrawingRevisionModal } from '@/components/modals/DrawingRevisionModal';
import { MergeContactModal } from './MergeContactModal';
import { WebhardFileInfo } from './WebhardFileInfo';
import {
  getDaysUntilPermanentDelete,
  parseReferencePhotos,
  getContactTypeLabel,
  getVisitTimeSlotLabel,
  hasValue,
} from '@/app/(admin)/admin/contacts/_lib/utils';

interface ContactDetailViewProps {
  contact: Contact;
  isExpanded?: boolean;
  /** true 면 admin 액션 버튼(도면 수정 등록 / 기존 문의 연결) 및 관련 모달을 렌더하지 않는다.
   *  Worker 의 `ContactInfoModal` 등 read-only 컨텍스트에서 사용. default: false (admin 동작 유지). */
  readOnly?: boolean;
}

/**
 * 섹션 컴포넌트
 */
const Section = memo(function Section({
  id,
  title,
  children,
  variant = 'default',
  headerAction,
}: {
  id?: string;
  title: string;
  children: React.ReactNode;
  variant?: 'default' | 'warning';
  headerAction?: React.ReactNode;
}) {
  const bgClass =
    variant === 'warning' ? `${BG_COLOR.error} border-l-4 border-red-500` : `${BG_COLOR.muted}`;

  return (
    <div id={id} className={`${bgClass} rounded-lg p-3 mb-3 scroll-mt-4`}>
      <div
        className={`flex items-center justify-between mb-2 border-b ${BORDER_COLOR.default} pb-1.5`}
      >
        <h3 className={`text-xs font-semibold ${TEXT_COLOR.primary}`}>{title}</h3>
        {headerAction}
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  );
});

/**
 * 필드 컴포넌트
 */
const Field = memo(function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-start gap-0.5 sm:gap-2">
      <label className={`text-xs font-medium ${TEXT_COLOR.muted} sm:min-w-[80px] flex-shrink-0`}>
        {label}
      </label>
      <div className={`text-xs ${TEXT_COLOR.primary}`}>{children}</div>
    </div>
  );
});

/**
 * 파일 항목 컴포넌트
 * contactId + fileType이 있으면 presigned URL 방식으로 다운로드
 */
const FileItem = memo(function FileItem({
  label,
  fileName,
  url,
  contactId,
  fileType,
  index,
  onStopPropagation,
}: {
  label: string;
  fileName: string | null;
  url: string | null;
  contactId?: string;
  fileType?: string;
  index?: number;
  onStopPropagation: (e: React.MouseEvent) => void;
}) {
  if (!fileName && !url) return null;

  const usePresigned = !!contactId && !!fileType;
  const apiUrl = usePresigned
    ? fileType === 'drawing'
      ? `/api/contacts/${contactId}/latest-drawing/download`
      : `/api/contacts/${contactId}/file-download?type=${fileType}${index !== undefined ? `&index=${index}` : ''}`
    : undefined;

  return (
    <div className={`border ${BORDER_COLOR.default} rounded p-2 ${BG_COLOR.card}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <label className={`text-xs font-medium ${TEXT_COLOR.muted} flex-shrink-0`}>{label}</label>
          <p className={`text-xs ${TEXT_COLOR.primary} truncate`}>{fileName || '파일명 없음'}</p>
        </div>
        {(url || usePresigned) && (
          <div onClick={onStopPropagation} className="flex-shrink-0">
            <DownloadButton apiUrl={apiUrl} url={url || undefined} fileName={fileName} />
          </div>
        )}
      </div>
    </div>
  );
});

function ContactDetailViewComponent({
  contact,
  isExpanded = true,
  readOnly = false,
}: ContactDetailViewProps) {
  // 이벤트 전파 방지
  const handleStopPropagation = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
  }, []);

  // 타임라인 데이터 (공유 훅 사용, 부모의 isExpanded에 연동)
  const { entries: timelineEntries, isLoading: rawTimelineLoading } = useContactTimeline(
    contact.id,
    { externalExpanded: isExpanded }
  );
  // 스켈레톤이 순간적으로 깜빡이지 않도록 최소 1초 유지
  const isTimelineLoading = useMinLoadingState(rawTimelineLoading, 1000);

  // 도면 수정 등록 모달
  const [showRevisionModal, setShowRevisionModal] = useState(false);

  // 기존 문의 연결 모달 (webhard source만)
  const [showMergeModal, setShowMergeModal] = useState(false);

  // 참고 사진 URL 파싱
  const referencePhotos = useMemo(
    () => parseReferencePhotos(contact.reference_photos_urls),
    [contact.reference_photos_urls]
  );

  // 첨부파일 유무
  const hasFiles = useMemo(
    () =>
      !!(
        contact.attachment_url ||
        contact.attachment_filename ||
        contact.drawing_file_url ||
        contact.drawing_file_name ||
        contact.reference_photos_urls
      ),
    [
      contact.attachment_url,
      contact.attachment_filename,
      contact.drawing_file_url,
      contact.drawing_file_name,
      contact.reference_photos_urls,
    ]
  );

  // 영구 삭제까지 남은 일수
  const daysUntilDelete = useMemo(() => {
    if (contact.status === 'deleting' && contact.deleted_at) {
      return getDaysUntilPermanentDelete(contact.deleted_at);
    }
    return null;
  }, [contact.status, contact.deleted_at]);

  return (
    <div
      className={`overflow-hidden transition-all duration-500 ease-in-out ${
        isExpanded ? 'max-h-[5000px] opacity-100' : 'max-h-0 opacity-0'
      }`}
    >
      <div
        className={`px-4 pb-4 pt-3 border-t ${BORDER_COLOR.default} transition-all duration-500 ease-in-out ${
          isExpanded ? 'translate-y-0 opacity-100' : '-translate-y-4 opacity-0'
        }`}
      >
        {/* 포트폴리오 참고 제품 */}
        {contact.portfolio_reference_url && contact.portfolio_reference_info && (
          <Section title="참고 제품">
            <a
              href={contact.portfolio_reference_url}
              target="_blank"
              rel="noopener noreferrer"
              className={`flex items-start gap-3 p-2 ${BG_COLOR.card} rounded-lg border ${BORDER_COLOR.default} hover:bg-[#ED6C00]/5 transition-colors cursor-pointer`}
              onClick={handleStopPropagation}
            >
              {contact.portfolio_reference_info.imageUrl && (
                <div className="flex-shrink-0">
                  <img
                    src={contact.portfolio_reference_info.imageUrl}
                    alt={contact.portfolio_reference_info.title}
                    className="w-16 h-16 object-cover rounded border border-[#ED6C00]/20"
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
                <p className={`text-sm ${TEXT_COLOR.primary}`}>
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
            </a>
          </Section>
        )}

        {/* 연락처 정보 */}
        <Section title="연락처 정보">
          {contact.contact_type && (
            <Field label="문의 유형">{getContactTypeLabel(contact.contact_type)}</Field>
          )}
          {contact.contact_type === 'individual' && (
            <Field label="서비스 유형">
              <div className="flex flex-wrap gap-1">
                {contact.service_mold_request && (
                  <span className={`px-1.5 py-0.5 text-xs ${BADGE.info} rounded`}>
                    목형 제작 의뢰
                  </span>
                )}
                {contact.service_delivery_brokerage && (
                  <span className={`px-1.5 py-0.5 text-xs ${BADGE.success} rounded`}>
                    납품까지 중개
                  </span>
                )}
                {!contact.service_mold_request && !contact.service_delivery_brokerage && (
                  <span className={TEXT_COLOR.muted}>-</span>
                )}
              </div>
            </Field>
          )}
          <div className="grid grid-cols-2 gap-2">
            <Field label={contact.contact_type === 'individual' ? '이름' : '업체명'}>
              {contact.company_name}
            </Field>
            {contact.contact_type === 'company' && (
              <>
                {hasValue(contact.name) && <Field label="담당자명">{contact.name}</Field>}
                {hasValue(contact.position) && <Field label="직책">{contact.position}</Field>}
              </>
            )}
            {hasValue(contact.phone) && (
              <Field label="연락처">
                <a href={`tel:${contact.phone}`} className="hover:underline">
                  {contact.phone}
                </a>
              </Field>
            )}
            {hasValue(contact.email) && (
              <Field label="이메일">
                <a href={`mailto:${contact.email}`} className="hover:underline truncate block">
                  {contact.email}
                </a>
              </Field>
            )}
          </div>
        </Section>

        {/* 도면 및 샘플 정보 */}
        <Section title="도면 및 샘플 정보">
          <div className="grid grid-cols-2 gap-2">
            <Field label="도면 상태">
              {contact.drawing_type === 'create'
                ? '제작 필요'
                : contact.drawing_type === 'have'
                  ? '보유'
                  : '-'}
            </Field>

            {contact.drawing_type === 'create' && (
              <>
                <Field label="실물 샘플">{contact.has_physical_sample ? '있음' : '없음'}</Field>
                <Field label="제작 자료">{contact.has_reference_photos ? '있음' : '없음'}</Field>
              </>
            )}

            {contact.drawing_type === 'have' && (
              <Field label="도면 수정">
                {contact.drawing_modification === 'needed'
                  ? '필요'
                  : contact.drawing_modification === 'not_needed'
                    ? '불필요'
                    : '-'}
              </Field>
            )}

            <Field label="박스 형태">{contact.box_shape || '-'}</Field>
            <Field label="재질">{contact.material || '-'}</Field>
          </div>
          <Field label="크기">
            {contact.length || '-'} × {contact.width || '-'} × {contact.height || '-'} mm
          </Field>

          {contact.has_physical_sample && contact.sample_notes && (
            <Field label="샘플 특이사항">
              <p className={`whitespace-pre-wrap ${BG_COLOR.card} p-2 rounded text-xs`}>
                {contact.sample_notes}
              </p>
            </Field>
          )}

          {contact.drawing_notes && (
            <Field label="유의사항">
              <p className={`whitespace-pre-wrap ${BG_COLOR.card} p-2 rounded text-xs`}>
                {contact.drawing_notes}
              </p>
            </Field>
          )}
        </Section>

        {/* 납품업체 정보 */}
        {contact.delivery_method && (
          <Section id={`delivery-method-section-${contact.id}`} title="납품업체 정보">
            <div className="grid grid-cols-2 gap-2">
              <Field label="납품 방법">
                {contact.delivery_method === 'company_address'
                  ? '회사주소'
                  : contact.delivery_method === 'delivery_company'
                    ? '지정 업체'
                    : contact.delivery_method || '-'}
              </Field>

              {contact.delivery_method === 'delivery_company' && (
                <>
                  <Field label="납품업체">{contact.delivery_company_name || '-'}</Field>
                  <Field label="연락처">
                    {contact.delivery_company_phone ? (
                      <a href={`tel:${contact.delivery_company_phone}`} className="hover:underline">
                        {contact.delivery_company_phone}
                      </a>
                    ) : (
                      '-'
                    )}
                  </Field>
                  <Field label="주소">{contact.delivery_company_address || '-'}</Field>
                </>
              )}
            </div>
          </Section>
        )}

        {/* 일정 조율 정보 */}
        {contact.receipt_method && (
          <Section id={`visit-schedule-section-${contact.id}`} title="일정 조율 정보">
            <div className="grid grid-cols-2 gap-2">
              <Field label="수령 방법">
                {contact.receipt_method === 'visit'
                  ? '방문'
                  : contact.receipt_method === 'delivery'
                    ? '배송'
                    : contact.receipt_method || '-'}
              </Field>

              {contact.receipt_method === 'visit' && (
                <>
                  <Field label="방문 날짜">{contact.visit_date || '-'}</Field>
                  <Field label="방문 시간">{getVisitTimeSlotLabel(contact.visit_time_slot)}</Field>
                </>
              )}

              {contact.receipt_method === 'delivery' && (
                <>
                  <Field label="배송 방법">
                    {contact.delivery_type === 'parcel'
                      ? '택배'
                      : contact.delivery_type === 'quick'
                        ? '퀵'
                        : '-'}
                  </Field>
                  <Field label="수령인">{contact.delivery_name || '-'}</Field>
                  <Field label="연락처">
                    {contact.delivery_phone ? (
                      <a href={`tel:${contact.delivery_phone}`} className="hover:underline">
                        {contact.delivery_phone}
                      </a>
                    ) : (
                      '-'
                    )}
                  </Field>
                  <div className="col-span-2">
                    <Field label="배송 주소">{contact.delivery_address || '-'}</Field>
                  </div>
                </>
              )}
            </div>
          </Section>
        )}

        {/* 수정요청서 */}
        {contact.revision_request_title && (
          <Section
            id={`revision-request-section-${contact.id}`}
            title="수정요청서"
            variant="warning"
          >
            <div className="flex items-center gap-2 mb-2">
              <span
                className={`px-1.5 py-0.5 text-[10px] font-medium rounded-full ${BADGE.error} flex-shrink-0`}
              >
                수정요청
              </span>
              {contact.revision_requested_at && (
                <span className={`text-[10px] ${TEXT_COLOR.muted}`}>
                  {new Date(contact.revision_requested_at).toLocaleString('ko-KR')}
                </span>
              )}
            </div>
            <Field label="제목">
              <span className="font-medium">{contact.revision_request_title}</span>
            </Field>
            <Field label="내용">
              <div className={`p-2 ${BG_COLOR.card} rounded border ${BORDER_COLOR.default}`}>
                <p className="whitespace-pre-wrap text-xs">
                  {contact.revision_request_content || '-'}
                </p>
              </div>
            </Field>
            {contact.revision_request_file_url && (
              <div
                className={`flex items-center justify-between p-2 ${BG_COLOR.card} rounded border ${BORDER_COLOR.default}`}
              >
                <p className={`text-xs ${TEXT_COLOR.primary} flex-1 truncate mr-2`}>
                  📎 {contact.revision_request_file_name || '파일명 없음'}
                </p>
                <div onClick={handleStopPropagation}>
                  <DownloadButton
                    apiUrl={`/api/contacts/${contact.id}/file-download?type=revision_request`}
                    fileName={contact.revision_request_file_name}
                  />
                </div>
              </div>
            )}
          </Section>
        )}

        {/* 웹하드 정보 (webhard source일 때만) */}
        {contact.source === 'webhard' && (
          <>
            <WebhardFileInfo
              contact={contact}
              folderPath={contact.webhard_folder_path}
              onStopPropagation={handleStopPropagation}
            />
            {/* 기존 문의 연결 버튼 — admin 전용 액션 (readOnly 시 숨김) */}
            {!readOnly && (
              <div className="mb-3" onClick={handleStopPropagation}>
                <button
                  type="button"
                  onClick={() => setShowMergeModal(true)}
                  className={`text-xs ${TEXT_COLOR.brand} hover:underline`}
                >
                  기존 문의와 연결
                </button>
              </div>
            )}
          </>
        )}

        {/* 첨부 파일 */}
        {hasFiles && (
          <Section title="첨부 파일">
            <div className="space-y-1.5">
              <FileItem
                label="첨부"
                fileName={contact.attachment_filename}
                url={contact.attachment_url}
                contactId={String(contact.id)}
                fileType="attachment"
                onStopPropagation={handleStopPropagation}
              />
              <FileItem
                label="도면"
                fileName={contact.drawing_file_name}
                url={contact.drawing_file_url}
                contactId={String(contact.id)}
                fileType="drawing"
                onStopPropagation={handleStopPropagation}
              />

              {referencePhotos.length > 0 && (
                <div className={`border ${BORDER_COLOR.default} rounded p-2 ${BG_COLOR.card}`}>
                  <div className="flex items-center gap-2 mb-1.5">
                    <label className={`text-xs font-medium ${TEXT_COLOR.muted}`}>참고 사진</label>
                    <span className={`text-[10px] ${TEXT_COLOR.muted}`}>
                      {referencePhotos.length}개
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {referencePhotos.map((url, idx) => (
                      <div
                        key={idx}
                        className={`flex items-center gap-1.5 ${BG_COLOR.muted} px-2 py-1 rounded border ${BORDER_COLOR.default}`}
                        onClick={handleStopPropagation}
                      >
                        <span className={`text-xs ${TEXT_COLOR.primary}`}>#{idx + 1}</span>
                        <DownloadButton
                          apiUrl={`/api/contacts/${contact.id}/file-download?type=reference_photo&index=${idx}`}
                          fileName={`reference-photo-${idx + 1}.jpg`}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </Section>
        )}

        {/* 공정 단계 + 날짜 정보 */}
        <Section title="작업현황">
          {/* 공정 단계 표시 */}
          <ProcessStageIndicatorToggle
            currentStage={contact.process_stage}
            status={contact.status}
            defaultExpanded={isExpanded}
            contactId={contact.id}
          />
          <div className={`grid grid-cols-2 gap-2 mt-2 pt-2 border-t ${BORDER_COLOR.default}`}>
            <Field label="등록일">{new Date(contact.created_at).toLocaleDateString('ko-KR')}</Field>
            {contact.updated_at && (
              <Field label="수정일">
                {new Date(contact.updated_at).toLocaleDateString('ko-KR')}
              </Field>
            )}
            {contact.status === 'deleting' && contact.deleted_at && (
              <Field label="삭제일">
                <div>
                  <span>{new Date(contact.deleted_at).toLocaleDateString('ko-KR')}</span>
                  <span className={`ml-2 text-[10px] ${TEXT_COLOR.error}`}>
                    {daysUntilDelete !== null && daysUntilDelete > 0
                      ? `D-${daysUntilDelete}`
                      : '오늘 삭제'}
                  </span>
                </div>
              </Field>
            )}
          </div>
        </Section>

        {/* 통합 타임라인 (status_change + drawing_revision) */}
        <Section
          title="타임라인"
          headerAction={
            readOnly ? undefined : (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowRevisionModal(true);
                }}
                className={`text-xs ${TEXT_COLOR.brand} hover:underline`}
              >
                + 도면 수정 등록
              </button>
            )
          }
        >
          {isTimelineLoading ? (
            <ContactTimelineSkeleton compact />
          ) : (
            <ContactTimeline entries={timelineEntries} compact showActor />
          )}
        </Section>
      </div>

      {/* 도면 수정 등록 모달 — admin 전용 (readOnly 시 렌더 skip) */}
      {!readOnly && (
        <DrawingRevisionModal
          isOpen={showRevisionModal}
          onClose={() => setShowRevisionModal(false)}
          contactId={contact.id}
          processStage={contact.process_stage}
          source="manual"
          onComplete={() => setShowRevisionModal(false)}
        />
      )}

      {/* 기존 문의 연결 모달 — admin 전용 (readOnly 시 렌더 skip) */}
      {!readOnly && contact.source === 'webhard' && (
        <MergeContactModal
          isOpen={showMergeModal}
          onClose={() => setShowMergeModal(false)}
          contact={contact}
        />
      )}
    </div>
  );
}

export const ContactDetailView = memo(ContactDetailViewComponent);
