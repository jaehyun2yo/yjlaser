import { BG_COLOR, BORDER_COLOR, TEXT_COLOR } from '@/lib/styles';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { UpdateStatusButton } from '@/app/(admin)/admin/contacts/[id]/update-status-button';
import { DeleteButton } from '@/app/(admin)/admin/contacts/[id]/delete-button';
import { ConfirmButton } from '@/app/(admin)/admin/contacts/[id]/confirm-button';
import { UpdateProcessStageButton } from '@/app/(admin)/admin/contacts/[id]/update-process-stage-button';
import { ProcessStageIndicator } from '@/components/ProcessStageIndicator';
import { DownloadButton } from '@/components/DownloadButton';
import type { Contact } from '@/lib/types';
import type { RevisionRequestHistoryItem } from '@/types/database.types';
import { serverGetContact, serverGetContactTimeline } from '@/lib/api/nestjs-server-client';
import { ContactTimelineRealtime } from '@/app/(admin)/admin/contacts/_components/ContactTimelineRealtime';
import DeliveryProofImage from '@/components/DeliveryProofImage';

export default async function WorkManagementDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [contact, timelineData] = await Promise.all([
    serverGetContact(id),
    serverGetContactTimeline(id),
  ]);

  if (!contact) {
    notFound();
  }

  const contactData = contact as unknown as Contact;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <Link
            href="/admin/work-management"
            className={`${TEXT_COLOR.brand} ${TEXT_COLOR.hoverOrangeMid} mb-2 inline-block`}
          >
            ← 목록으로
          </Link>
          <h1 className={`text-3xl font-bold ${TEXT_COLOR.primary}`}>문의 상세보기</h1>
        </div>
        <div className="flex gap-3 items-center">
          <UpdateStatusButton contactId={contactData.id} currentStatus={contactData.status} />
          <DeleteButton
            contactId={contactData.id}
            contactName={contactData.company_name || contactData.name || `문의 #${contactData.id}`}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 메인 내용 */}
        <div className="lg:col-span-2 space-y-6">
          {/* 연락처 정보 */}
          <div className={`${BG_COLOR.card} rounded-lg shadow-md p-6`}>
            <h2
              className={`text-xl font-semibold ${TEXT_COLOR.primary} mb-4 border-b ${BORDER_COLOR.default} pb-2`}
            >
              연락처 정보
            </h2>
            <div className="space-y-4">
              <div>
                <label className={`text-sm font-medium ${TEXT_COLOR.secondary}`}>문의 유형</label>
                <p className={`mt-1 ${TEXT_COLOR.primary}`}>
                  {contactData.contact_type === 'individual' ? '개인' : '업체'}
                </p>
              </div>
              {contactData.contact_type === 'individual' && (
                <div>
                  <label className={`text-sm font-medium ${TEXT_COLOR.secondary}`}>
                    서비스 유형
                  </label>
                  <div className="mt-1 space-y-1">
                    {contactData.service_mold_request && (
                      <span
                        className={`inline-block px-2 py-1 text-xs ${BG_COLOR.infoMedium} ${TEXT_COLOR.infoDeep} rounded mr-2`}
                      >
                        목형 제작 의뢰
                      </span>
                    )}
                    {contactData.service_delivery_brokerage && (
                      <span
                        className={`inline-block px-2 py-1 text-xs ${BG_COLOR.successMedium} ${TEXT_COLOR.successDeep} rounded`}
                      >
                        납품까지 중개
                      </span>
                    )}
                    {!contactData.service_mold_request &&
                      !contactData.service_delivery_brokerage && (
                        <span className="text-gray-400">-</span>
                      )}
                  </div>
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={`text-sm font-medium ${TEXT_COLOR.secondary}`}>
                    {contactData.contact_type === 'individual' ? '이름' : '업체명'}
                  </label>
                  <p className={`mt-1 ${TEXT_COLOR.primary}`}>{contactData.company_name}</p>
                </div>
                {contactData.contact_type === 'company' && (
                  <>
                    <div>
                      <label className={`text-sm font-medium ${TEXT_COLOR.secondary}`}>
                        담당자명
                      </label>
                      <p className={`mt-1 ${TEXT_COLOR.primary}`}>{contactData.name}</p>
                    </div>
                    <div>
                      <label className={`text-sm font-medium ${TEXT_COLOR.secondary}`}>직책</label>
                      <p className={`mt-1 ${TEXT_COLOR.primary}`}>{contactData.position}</p>
                    </div>
                  </>
                )}
                <div>
                  <label className={`text-sm font-medium ${TEXT_COLOR.secondary}`}>연락처</label>
                  <p className={`mt-1 ${TEXT_COLOR.primary}`}>
                    <a
                      href={`tel:${contactData.phone}`}
                      className="text-orange-600 hover:underline"
                    >
                      {contactData.phone}
                    </a>
                  </p>
                </div>
                <div className="col-span-2">
                  <label className={`text-sm font-medium ${TEXT_COLOR.secondary}`}>이메일</label>
                  <p className={`mt-1 ${TEXT_COLOR.primary}`}>
                    <a
                      href={`mailto:${contactData.email}`}
                      className="text-orange-600 hover:underline"
                    >
                      {contactData.email}
                    </a>
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* 도면 및 샘플 정보 */}
          <div className={`${BG_COLOR.card} rounded-lg shadow-md p-6`}>
            <h2
              className={`text-xl font-semibold ${TEXT_COLOR.primary} mb-4 border-b ${BORDER_COLOR.default} pb-2`}
            >
              도면 및 샘플 정보
            </h2>
            <div className="space-y-4">
              <div>
                <label className={`text-sm font-medium ${TEXT_COLOR.secondary}`}>도면 상태</label>
                <p className={`mt-1 ${TEXT_COLOR.primary}`}>
                  {contactData.drawing_type === 'create'
                    ? '도면 제작이 필요합니다'
                    : contactData.drawing_type === 'have'
                      ? '도면을 가지고 있습니다'
                      : '-'}
                </p>
              </div>

              {contactData.drawing_type === 'create' && (
                <>
                  <div>
                    <label className={`text-sm font-medium ${TEXT_COLOR.secondary}`}>
                      실물 샘플
                    </label>
                    <p className={`mt-1 ${TEXT_COLOR.primary}`}>
                      {contactData.has_physical_sample ? '있음' : '없음'}
                    </p>
                  </div>
                  {contactData.has_physical_sample && contactData.sample_notes && (
                    <div>
                      <label className={`text-sm font-medium ${TEXT_COLOR.secondary}`}>
                        샘플 특이사항
                      </label>
                      <p
                        className={`mt-1 ${TEXT_COLOR.primary} whitespace-pre-wrap ${BG_COLOR.grayLighter} p-3 rounded`}
                      >
                        {contactData.sample_notes}
                      </p>
                    </div>
                  )}
                  <div>
                    <label className={`text-sm font-medium ${TEXT_COLOR.secondary}`}>
                      제작 자료
                    </label>
                    <p className={`mt-1 ${TEXT_COLOR.primary}`}>
                      {contactData.has_reference_photos ? '있음' : '없음'}
                    </p>
                  </div>
                </>
              )}

              {contactData.drawing_type === 'have' && (
                <div>
                  <label className={`text-sm font-medium ${TEXT_COLOR.secondary}`}>도면 수정</label>
                  <p className={`mt-1 ${TEXT_COLOR.primary}`}>
                    {contactData.drawing_modification === 'needed'
                      ? '도면의 수정이 필요합니다'
                      : contactData.drawing_modification === 'not_needed'
                        ? '도면의 수정이 필요없습니다'
                        : '-'}
                  </p>
                </div>
              )}

              <div>
                <label className={`text-sm font-medium ${TEXT_COLOR.secondary}`}>박스 형태</label>
                <p className={`mt-1 ${TEXT_COLOR.primary}`}>{contactData.box_shape || '-'}</p>
              </div>

              <div>
                <label className={`text-sm font-medium ${TEXT_COLOR.secondary}`}>
                  크기 (장x폭x고)
                </label>
                <p className={`mt-1 ${TEXT_COLOR.primary}`}>
                  {contactData.length || '-'} mm x {contactData.width || '-'} mm x{' '}
                  {contactData.height || '-'} mm
                </p>
              </div>

              <div>
                <label className={`text-sm font-medium ${TEXT_COLOR.secondary}`}>재질</label>
                <p className={`mt-1 ${TEXT_COLOR.primary}`}>{contactData.material || '-'}</p>
              </div>

              {contactData.drawing_notes && (
                <div>
                  <label className={`text-sm font-medium ${TEXT_COLOR.secondary}`}>
                    도면 및 샘플 제작 시 유의사항
                  </label>
                  <p
                    className={`mt-1 ${TEXT_COLOR.primary} whitespace-pre-wrap ${BG_COLOR.grayLighter} p-3 rounded`}
                  >
                    {contactData.drawing_notes}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* 납품업체 정보 */}
          {contactData.delivery_method && (
            <div className={`${BG_COLOR.card} rounded-lg shadow-md p-6`}>
              <h2
                className={`text-xl font-semibold ${TEXT_COLOR.primary} mb-4 border-b ${BORDER_COLOR.default} pb-2`}
              >
                납품업체 정보
              </h2>
              <div className="space-y-4">
                <div>
                  <label className={`text-sm font-medium ${TEXT_COLOR.secondary}`}>납품 방법</label>
                  <p className={`mt-1 ${TEXT_COLOR.primary}`}>
                    {contactData.delivery_method === 'company_address'
                      ? '회사주소로 납품'
                      : contactData.delivery_method === 'delivery_company'
                        ? '납품받을 업체가 있습니다'
                        : contactData.delivery_method || '-'}
                  </p>
                </div>

                {contactData.delivery_method === 'delivery_company' && (
                  <>
                    <div>
                      <label className={`text-sm font-medium ${TEXT_COLOR.secondary}`}>
                        납품업체명
                      </label>
                      <p className={`mt-1 ${TEXT_COLOR.primary}`}>
                        {contactData.delivery_company_name || '-'}
                      </p>
                    </div>
                    <div>
                      <label className={`text-sm font-medium ${TEXT_COLOR.secondary}`}>
                        연락처
                      </label>
                      <p className={`mt-1 ${TEXT_COLOR.primary}`}>
                        {contactData.delivery_company_phone ? (
                          <a
                            href={`tel:${contactData.delivery_company_phone}`}
                            className="text-orange-600 hover:underline"
                          >
                            {contactData.delivery_company_phone}
                          </a>
                        ) : (
                          '-'
                        )}
                      </p>
                    </div>
                    <div>
                      <label className={`text-sm font-medium ${TEXT_COLOR.secondary}`}>주소</label>
                      <p className={`mt-1 ${TEXT_COLOR.primary}`}>
                        {contactData.delivery_company_address || '-'}
                      </p>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {/* 일정 조율 정보 */}
          {contactData.receipt_method && (
            <div className={`${BG_COLOR.card} rounded-lg shadow-md p-6`}>
              <h2
                className={`text-xl font-semibold ${TEXT_COLOR.primary} mb-4 border-b ${BORDER_COLOR.default} pb-2`}
              >
                일정 조율 정보
              </h2>
              <div className="space-y-4">
                <div>
                  <label className={`text-sm font-medium ${TEXT_COLOR.secondary}`}>수령 방법</label>
                  <p className={`mt-1 ${TEXT_COLOR.primary}`}>
                    {contactData.receipt_method === 'visit'
                      ? '방문 수령'
                      : contactData.receipt_method === 'delivery'
                        ? '택배 및 퀵으로 수령'
                        : contactData.receipt_method || '-'}
                  </p>
                </div>

                {contactData.receipt_method === 'visit' && (
                  <>
                    <div>
                      <label className={`text-sm font-medium ${TEXT_COLOR.secondary}`}>
                        방문 날짜
                      </label>
                      <p className={`mt-1 ${TEXT_COLOR.primary}`}>
                        {contactData.visit_date || '-'}
                      </p>
                    </div>
                    <div>
                      <label className={`text-sm font-medium ${TEXT_COLOR.secondary}`}>
                        방문 시간
                      </label>
                      <p className={`mt-1 ${TEXT_COLOR.primary}`}>
                        {contactData.visit_time_slot || '-'}
                      </p>
                    </div>
                    <div className={`${BG_COLOR.info} p-3 rounded`}>
                      <p className={`text-sm ${TEXT_COLOR.secondary}`}>
                        <strong>회사위치:</strong> 서울 중구 퇴계로39길 20, 2층 유진레이져목형
                        사무실
                      </p>
                      <p className={`text-xs ${TEXT_COLOR.secondary} mt-1`}>
                        (평일 9:00 ~ 19:00 주말 및 공휴일 휴무)
                      </p>
                    </div>
                  </>
                )}

                {contactData.receipt_method === 'delivery' && (
                  <>
                    <div>
                      <label className={`text-sm font-medium ${TEXT_COLOR.secondary}`}>
                        배송 방법
                      </label>
                      <p className={`mt-1 ${TEXT_COLOR.primary}`}>
                        {contactData.delivery_type === 'parcel'
                          ? '택배'
                          : contactData.delivery_type === 'quick'
                            ? '퀵'
                            : '-'}
                      </p>
                    </div>
                    <div>
                      <label className={`text-sm font-medium ${TEXT_COLOR.secondary}`}>
                        배송 주소
                      </label>
                      <p className={`mt-1 ${TEXT_COLOR.primary}`}>
                        {contactData.delivery_address || '-'}
                      </p>
                    </div>
                    <div>
                      <label className={`text-sm font-medium ${TEXT_COLOR.secondary}`}>
                        수령인
                      </label>
                      <p className={`mt-1 ${TEXT_COLOR.primary}`}>
                        {contactData.delivery_name || '-'}
                      </p>
                    </div>
                    <div>
                      <label className={`text-sm font-medium ${TEXT_COLOR.secondary}`}>
                        수령인 연락처
                      </label>
                      <p className={`mt-1 ${TEXT_COLOR.primary}`}>
                        {contactData.delivery_phone ? (
                          <a
                            href={`tel:${contactData.delivery_phone}`}
                            className="text-orange-600 hover:underline"
                          >
                            {contactData.delivery_phone}
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
          {contactData.revision_request_title && (
            <div className={`${BG_COLOR.card} rounded-lg shadow-md p-6 border-l-4 border-red-500`}>
              <div className="flex items-center gap-2 mb-4">
                <h2
                  className={`text-xl font-semibold ${TEXT_COLOR.primary} border-b ${BORDER_COLOR.default} pb-2 flex-1`}
                >
                  수정요청서
                </h2>
                <span
                  className={`px-3 py-1 text-xs font-medium rounded-full ${BG_COLOR.error} ${TEXT_COLOR.error}`}
                >
                  수정요청
                </span>
              </div>
              <div className="space-y-4">
                <div>
                  <h3 className={`text-lg font-semibold ${TEXT_COLOR.primary} mb-4`}>
                    최신 수정요청
                  </h3>
                  <div
                    className={`p-4 ${BG_COLOR.grayLighter}/30 rounded-lg border ${BORDER_COLOR.default}`}
                  >
                    <div className="space-y-3">
                      <div>
                        <label className={`text-xs font-medium ${TEXT_COLOR.secondary}`}>
                          요청 제목
                        </label>
                        <p className={`mt-1 text-sm ${TEXT_COLOR.primary} font-medium`}>
                          {contactData.revision_request_title || '-'}
                        </p>
                      </div>
                      <div>
                        <label className={`text-xs font-medium ${TEXT_COLOR.secondary}`}>
                          요청 내용
                        </label>
                        <div
                          className={`mt-1 p-3 ${BG_COLOR.card} rounded border ${BORDER_COLOR.default}`}
                        >
                          <p className={`text-sm ${TEXT_COLOR.primary} whitespace-pre-wrap`}>
                            {contactData.revision_request_content || '-'}
                          </p>
                        </div>
                      </div>
                      {contactData.revision_requested_at && (
                        <div>
                          <label className={`text-xs font-medium ${TEXT_COLOR.secondary}`}>
                            요청 일시
                          </label>
                          <p className={`mt-1 text-sm ${TEXT_COLOR.primary}`}>
                            {new Date(contactData.revision_requested_at).toLocaleString('ko-KR')}
                          </p>
                        </div>
                      )}
                      {contactData.revision_request_file_url && (
                        <div>
                          <label className={`text-xs font-medium ${TEXT_COLOR.secondary}`}>
                            첨부 파일
                          </label>
                          <div
                            className={`mt-1 flex items-center justify-between p-2 ${BG_COLOR.card} rounded border ${BORDER_COLOR.default}`}
                          >
                            <p className={`text-xs ${TEXT_COLOR.primary} flex-1 truncate mr-2`}>
                              {contactData.revision_request_file_name || '파일명 없음'}
                            </p>
                            <DownloadButton
                              apiUrl={`/api/contacts/${id}/file-download?type=revision_request`}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {contactData.revision_request_history &&
                  Array.isArray(contactData.revision_request_history) &&
                  contactData.revision_request_history.length > 0 && (
                    <div className={`mt-6 pt-6 border-t ${BORDER_COLOR.default}`}>
                      <h3 className={`text-lg font-semibold ${TEXT_COLOR.primary} mb-4`}>
                        이전 수정요청 기록 ({contactData.revision_request_history.length}건)
                      </h3>
                      <div className="space-y-4">
                        {contactData.revision_request_history
                          .slice()
                          .reverse()
                          .map((historyItem: RevisionRequestHistoryItem, index: number) => {
                            const originalIndex =
                              contactData.revision_request_history!.length - 1 - index;
                            return (
                              <div
                                key={index}
                                className={`p-4 ${BG_COLOR.grayLighter}/30 rounded-lg border ${BORDER_COLOR.default}`}
                              >
                                <div className="space-y-3">
                                  <div>
                                    <label
                                      className={`text-xs font-medium ${TEXT_COLOR.secondary}`}
                                    >
                                      요청 제목
                                    </label>
                                    <p className={`mt-1 text-sm ${TEXT_COLOR.primary} font-medium`}>
                                      {historyItem.title || '-'}
                                    </p>
                                  </div>
                                  <div>
                                    <label
                                      className={`text-xs font-medium ${TEXT_COLOR.secondary}`}
                                    >
                                      요청 내용
                                    </label>
                                    <div
                                      className={`mt-1 p-3 ${BG_COLOR.card} rounded border ${BORDER_COLOR.default}`}
                                    >
                                      <p
                                        className={`text-sm ${TEXT_COLOR.primary} whitespace-pre-wrap`}
                                      >
                                        {historyItem.content || '-'}
                                      </p>
                                    </div>
                                  </div>
                                  {historyItem.requested_at && (
                                    <div>
                                      <label
                                        className={`text-xs font-medium ${TEXT_COLOR.secondary}`}
                                      >
                                        요청 일시
                                      </label>
                                      <p className={`mt-1 text-sm ${TEXT_COLOR.primary}`}>
                                        {new Date(historyItem.requested_at).toLocaleString('ko-KR')}
                                      </p>
                                    </div>
                                  )}
                                  {historyItem.file_url && (
                                    <div>
                                      <label
                                        className={`text-xs font-medium ${TEXT_COLOR.secondary}`}
                                      >
                                        첨부 파일
                                      </label>
                                      <div
                                        className={`mt-1 flex items-center justify-between p-2 ${BG_COLOR.card} rounded border ${BORDER_COLOR.default}`}
                                      >
                                        <p
                                          className={`text-xs ${TEXT_COLOR.primary} flex-1 truncate mr-2`}
                                        >
                                          {historyItem.file_name || '파일명 없음'}
                                        </p>
                                        <DownloadButton
                                          apiUrl={`/api/contacts/${id}/file-download?type=revision_request_history&index=${originalIndex}`}
                                        />
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                      </div>
                    </div>
                  )}
              </div>
            </div>
          )}

          {/* 첨부 파일 */}
          {(contactData.attachment_url ||
            contactData.attachment_filename ||
            contactData.drawing_file_url ||
            contactData.drawing_file_name ||
            contactData.reference_photos_urls) && (
            <div className={`${BG_COLOR.card} rounded-lg shadow-md p-6`}>
              <h2
                className={`text-xl font-semibold ${TEXT_COLOR.primary} mb-4 border-b ${BORDER_COLOR.default} pb-2`}
              >
                첨부 파일
              </h2>
              <div className="space-y-4">
                {(contactData.attachment_filename || contactData.attachment_url) && (
                  <div
                    className={`border ${BORDER_COLOR.default} rounded-lg p-4 ${BG_COLOR.muted}`}
                  >
                    <label className={`text-sm font-medium ${TEXT_COLOR.secondary} block mb-2`}>
                      첨부 파일
                    </label>
                    <div className="flex items-center justify-between">
                      <p className={`${TEXT_COLOR.primary} text-sm flex-1 truncate mr-2`}>
                        {contactData.attachment_filename || '파일명 없음'}
                      </p>
                      {contactData.attachment_url && (
                        <DownloadButton
                          apiUrl={`/api/contacts/${id}/file-download?type=attachment`}
                        />
                      )}
                    </div>
                  </div>
                )}

                {(contactData.drawing_file_name || contactData.drawing_file_url) && (
                  <div
                    className={`border ${BORDER_COLOR.default} rounded-lg p-4 ${BG_COLOR.muted}`}
                  >
                    <label className={`text-sm font-medium ${TEXT_COLOR.secondary} block mb-2`}>
                      도면 파일
                    </label>
                    <div className="flex items-center justify-between">
                      <p className={`${TEXT_COLOR.primary} text-sm flex-1 truncate mr-2`}>
                        {contactData.drawing_file_name || '파일명 없음'}
                      </p>
                      {contactData.drawing_file_url && (
                        <DownloadButton apiUrl={`/api/contacts/${id}/file-download?type=drawing`} />
                      )}
                    </div>
                  </div>
                )}

                {contactData.reference_photos_urls && (
                  <div
                    className={`border ${BORDER_COLOR.default} rounded-lg p-4 ${BG_COLOR.muted}`}
                  >
                    <label className={`text-sm font-medium ${TEXT_COLOR.secondary} block mb-3`}>
                      참고 사진
                    </label>
                    <div className="space-y-2">
                      {(() => {
                        try {
                          const urls = JSON.parse(contactData.reference_photos_urls) as string[];
                          if (urls.length === 0) return null;
                          return urls.map((_url, idx) => (
                            <div
                              key={idx}
                              className={`flex items-center justify-between ${BG_COLOR.card} p-3 rounded border ${BORDER_COLOR.default}`}
                            >
                              <span className={`${TEXT_COLOR.primary} text-sm`}>
                                사진 {idx + 1}
                              </span>
                              <DownloadButton
                                apiUrl={`/api/contacts/${id}/file-download?type=reference_photo&index=${idx}`}
                              />
                            </div>
                          ));
                        } catch {
                          return (
                            <p className={`${TEXT_COLOR.secondary} text-sm`}>
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
        </div>

        {/* 사이드바 정보 */}
        <div className="space-y-6">
          {/* 작업 타임라인 */}
          <div className={`${BG_COLOR.card} rounded-lg shadow-md p-6`}>
            <h3 className={`text-lg font-semibold ${TEXT_COLOR.primary} mb-4`}>작업 타임라인</h3>
            <ContactTimelineRealtime
              contactId={String(contactData.id)}
              initialEntries={timelineData}
              showActor
            />
          </div>

          {/* 납품 증빙 사진 */}
          {contactData.delivery_proof_image && (
            <div className={`${BG_COLOR.card} rounded-lg shadow-md p-6`}>
              <h3 className={`text-lg font-semibold ${TEXT_COLOR.primary} mb-4`}>납품 증빙 사진</h3>
              <DeliveryProofImage
                contactId={String(contactData.id)}
                className="w-full rounded-lg object-cover"
              />
            </div>
          )}

          <div className={`${BG_COLOR.card} rounded-lg shadow-md p-6`}>
            <h3 className={`text-lg font-semibold ${TEXT_COLOR.primary} mb-4`}>상태 정보</h3>
            <div className="space-y-3">
              <div>
                <label className={`text-sm font-medium ${TEXT_COLOR.secondary}`}>상태</label>
                <p className="mt-1">
                  <span
                    className={`px-3 py-1 text-sm rounded ${
                      contactData.status === 'received'
                        ? `${BG_COLOR.errorMedium} ${TEXT_COLOR.errorDeep}`
                        : contactData.status === 'drawing'
                          ? `${BG_COLOR.infoMedium} ${TEXT_COLOR.infoDeep}`
                          : contactData.status === 'confirmed'
                            ? 'bg-brand text-white'
                            : contactData.status === 'production'
                              ? `${BG_COLOR.orangeMedium} ${TEXT_COLOR.orangeDeep}`
                              : contactData.status === 'cutting'
                                ? `${BG_COLOR.warningMediumDeep} ${TEXT_COLOR.warningDeep}`
                                : contactData.status === 'finishing'
                                  ? `${BG_COLOR.purpleMediumDeep} ${TEXT_COLOR.purpleDeep}`
                                  : contactData.status === 'delivered'
                                    ? `${BG_COLOR.successMedium} ${TEXT_COLOR.successDeep}`
                                    : contactData.status === 'completed'
                                      ? `${BG_COLOR.successMedium} ${TEXT_COLOR.successDeep}`
                                      : contactData.status === 'on_hold'
                                        ? `${BG_COLOR.muted} ${TEXT_COLOR.primary}`
                                        : `${BG_COLOR.muted} ${TEXT_COLOR.primary}`
                    }`}
                  >
                    {contactData.status === 'received'
                      ? '접수'
                      : contactData.status === 'drawing'
                        ? '도면작업'
                        : contactData.status === 'confirmed'
                          ? '컨펌'
                          : contactData.status === 'production'
                            ? '목형제작'
                            : contactData.status === 'cutting'
                              ? '레이저가공'
                              : contactData.status === 'finishing'
                                ? '칼/오시'
                                : contactData.status === 'delivered'
                                  ? '납품'
                                  : contactData.status === 'completed'
                                    ? '작업완료'
                                    : contactData.status === 'on_hold'
                                      ? '보류'
                                      : contactData.status}
                  </span>
                </p>
              </div>
              <div>
                <label className={`text-sm font-medium ${TEXT_COLOR.secondary}`}>등록일</label>
                <p className={`mt-1 ${TEXT_COLOR.primary}`}>
                  {new Date(contactData.created_at).toLocaleString('ko-KR')}
                </p>
              </div>
              <div>
                <label className={`text-sm font-medium ${TEXT_COLOR.secondary}`}>수정일</label>
                <p className={`mt-1 ${TEXT_COLOR.primary}`}>
                  {new Date(contactData.updated_at).toLocaleString('ko-KR')}
                </p>
              </div>
            </div>
          </div>

          {/* 확인완료 버튼 */}
          <div className={`${BG_COLOR.card} rounded-lg shadow-md p-6`}>
            <h3 className={`text-lg font-semibold ${TEXT_COLOR.primary} mb-4`}>확인 상태</h3>
            <ConfirmButton contactId={contactData.id} currentStatus={contactData.status} />
          </div>

          {/* 공정 단계 관리 */}
          <div className={`${BG_COLOR.card} rounded-lg shadow-md p-6`}>
            <h3 className={`text-lg font-semibold ${TEXT_COLOR.primary} mb-4`}>공정 단계 관리</h3>
            <UpdateProcessStageButton
              contactId={contactData.id}
              currentStage={contactData.process_stage}
              status={contactData.status}
            />
            <div className="mt-4">
              <ProcessStageIndicator
                currentStage={contactData.process_stage}
                status={contactData.status}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
