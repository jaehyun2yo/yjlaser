export interface ContactNotificationData {
  contactId: string;
  companyName: string;
  name: string;
  email: string;
  phone?: string;
  position?: string;
  inquiryTitle?: string;
  drawingType?: string;
  drawingFileUrl?: string;
  drawingFileName?: string;
  drawingModification?: string;
  drawingNotes?: string;
  referencePhotosUrls?: string;
  attachmentFilename?: string;
  attachmentUrl?: string;
  boxShape?: string;
  length?: string;
  width?: string;
  height?: string;
  material?: string;
  hasPhysicalSample?: boolean;
  hasReferencePhotos?: boolean;
  sampleNotes?: string;
  receiptMethod?: string;
  visitDate?: string;
  visitTimeSlot?: string;
  deliveryType?: string;
  deliveryAddress?: string;
  deliveryName?: string;
  deliveryPhone?: string;
  deliveryMethod?: string;
  deliveryCompanyName?: string;
  deliveryCompanyPhone?: string;
  deliveryCompanyAddress?: string;
  referralSource?: string;
}

export function buildContactSubject(data: ContactNotificationData): string {
  const title = data.inquiryTitle || data.name;
  return `[문의] ${data.companyName || '업체명 없음'} - ${title}`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function nl2br(text: string): string {
  return escapeHtml(text).replace(/\n/g, '<br>');
}

function parseReferencePhotos(urls?: string): string[] {
  if (!urls) return [];
  try {
    const parsed = JSON.parse(urls);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return urls.split(',').filter(Boolean);
  }
}

export function buildContactNotificationHtml(
  data: ContactNotificationData,
  siteUrl: string
): string {
  const adminLink = `${siteUrl}/admin/contacts/${data.contactId}`;
  const photoUrls = parseReferencePhotos(data.referencePhotosUrls);

  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; background-color: #f4f4f5; font-family: Arial, sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f5;">
    <tr>
      <td align="center" style="padding: 24px 16px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width: 600px; width: 100%; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.08);">
          <!-- Header -->
          <tr>
            <td style="background-color: #ED6C00; padding: 24px 32px; text-align: center;">
              <img src="${siteUrl}/mainLogo.svg" alt="유진레이저목형" height="36" style="height: 36px; margin-bottom: 12px; filter: brightness(0) invert(1);">
              <h1 style="margin: 0; color: #ffffff; font-size: 20px; font-weight: 600;">새로운 문의가 접수되었습니다</h1>
            </td>
          </tr>

          <!-- Contact Info -->
          <tr>
            <td style="padding: 24px 32px 0;">
              <h2 style="color: #374151; font-size: 16px; margin: 0 0 12px; border-bottom: 2px solid #ED6C00; padding-bottom: 8px;">연락처 정보</h2>
              <table role="presentation" width="100%" cellpadding="4" cellspacing="0">
                <tr><td style="color: #6b7280; width: 120px;">업체명</td><td style="color: #111827; font-weight: 600;">${escapeHtml(data.companyName || '')}</td></tr>
                <tr><td style="color: #6b7280;">담당자명</td><td style="color: #111827;">${escapeHtml(data.name)}</td></tr>
                ${data.position ? `<tr><td style="color: #6b7280;">직책</td><td style="color: #111827;">${escapeHtml(data.position)}</td></tr>` : ''}
                <tr><td style="color: #6b7280;">연락처</td><td style="color: #111827;"><a href="tel:${escapeHtml(data.phone || '')}" style="color: #ED6C00;">${escapeHtml(data.phone || '-')}</a></td></tr>
                <tr><td style="color: #6b7280;">이메일</td><td style="color: #111827;"><a href="mailto:${escapeHtml(data.email)}" style="color: #ED6C00;">${escapeHtml(data.email)}</a></td></tr>
                ${data.referralSource ? `<tr><td style="color: #6b7280;">유입경로</td><td style="color: #111827;">${escapeHtml(data.referralSource)}</td></tr>` : ''}
              </table>
            </td>
          </tr>

          ${
            data.drawingType
              ? `
          <!-- Drawing Info -->
          <tr>
            <td style="padding: 20px 32px 0;">
              <h2 style="color: #374151; font-size: 16px; margin: 0 0 12px; border-bottom: 2px solid #3b82f6; padding-bottom: 8px;">도면 및 샘플 정보</h2>
              <table role="presentation" width="100%" cellpadding="4" cellspacing="0">
                <tr><td style="color: #6b7280; width: 120px;">도면 상태</td><td style="color: #111827;">${data.drawingType === 'create' ? '도면 제작이 필요합니다' : '도면을 가지고 있습니다'}</td></tr>
                ${
                  data.drawingType === 'create'
                    ? `
                <tr><td style="color: #6b7280;">실물 샘플</td><td style="color: #111827;">${data.hasPhysicalSample ? '있음' : '없음'}</td></tr>
                <tr><td style="color: #6b7280;">제작 자료</td><td style="color: #111827;">${data.hasReferencePhotos ? '있음' : '없음'}</td></tr>
                ${data.sampleNotes ? `<tr><td style="color: #6b7280;">샘플 특이사항</td><td style="color: #111827;">${nl2br(data.sampleNotes)}</td></tr>` : ''}
                `
                    : ''
                }
                ${
                  data.drawingType === 'have' && data.drawingModification
                    ? `
                <tr><td style="color: #6b7280;">도면 수정</td><td style="color: #111827;">${data.drawingModification === 'needed' ? '수정 필요' : '수정 불필요'}</td></tr>
                `
                    : ''
                }
                ${data.boxShape ? `<tr><td style="color: #6b7280;">박스 형태</td><td style="color: #111827;">${escapeHtml(data.boxShape)}</td></tr>` : ''}
                ${data.length || data.width || data.height ? `<tr><td style="color: #6b7280;">크기</td><td style="color: #111827;">${data.length || '-'} × ${data.width || '-'} × ${data.height || '-'} mm</td></tr>` : ''}
                ${data.material ? `<tr><td style="color: #6b7280;">재질</td><td style="color: #111827;">${escapeHtml(data.material)}</td></tr>` : ''}
                ${data.drawingNotes ? `<tr><td style="color: #6b7280;">유의사항</td><td style="color: #111827;">${nl2br(data.drawingNotes)}</td></tr>` : ''}
              </table>
            </td>
          </tr>
          `
              : ''
          }

          ${
            data.receiptMethod
              ? `
          <!-- Schedule Info -->
          <tr>
            <td style="padding: 20px 32px 0;">
              <h2 style="color: #374151; font-size: 16px; margin: 0 0 12px; border-bottom: 2px solid #22c55e; padding-bottom: 8px;">일정 조율 정보</h2>
              <table role="presentation" width="100%" cellpadding="4" cellspacing="0">
                <tr><td style="color: #6b7280; width: 120px;">수령 방법</td><td style="color: #111827;">${data.receiptMethod === 'visit' ? '방문 수령' : '택배/퀵'}</td></tr>
                ${
                  data.receiptMethod === 'visit'
                    ? `
                ${data.visitDate ? `<tr><td style="color: #6b7280;">방문 날짜</td><td style="color: #111827;">${escapeHtml(data.visitDate)}</td></tr>` : ''}
                ${data.visitTimeSlot ? `<tr><td style="color: #6b7280;">방문 시간</td><td style="color: #111827;">${escapeHtml(data.visitTimeSlot)}</td></tr>` : ''}
                `
                    : `
                ${data.deliveryType ? `<tr><td style="color: #6b7280;">배송 방법</td><td style="color: #111827;">${data.deliveryType === 'parcel' ? '택배' : '퀵'}</td></tr>` : ''}
                ${data.deliveryAddress ? `<tr><td style="color: #6b7280;">배송 주소</td><td style="color: #111827;">${escapeHtml(data.deliveryAddress)}</td></tr>` : ''}
                ${data.deliveryName ? `<tr><td style="color: #6b7280;">수령인</td><td style="color: #111827;">${escapeHtml(data.deliveryName)}</td></tr>` : ''}
                ${data.deliveryPhone ? `<tr><td style="color: #6b7280;">수령인 연락처</td><td style="color: #111827;">${escapeHtml(data.deliveryPhone)}</td></tr>` : ''}
                `
                }
              </table>
            </td>
          </tr>
          `
              : ''
          }

          ${
            data.deliveryMethod
              ? `
          <!-- Delivery Company Info -->
          <tr>
            <td style="padding: 20px 32px 0;">
              <h2 style="color: #374151; font-size: 16px; margin: 0 0 12px; border-bottom: 2px solid #8b5cf6; padding-bottom: 8px;">납품업체 정보</h2>
              <table role="presentation" width="100%" cellpadding="4" cellspacing="0">
                <tr><td style="color: #6b7280; width: 120px;">납품 방법</td><td style="color: #111827;">${escapeHtml(data.deliveryMethod)}</td></tr>
                ${data.deliveryCompanyName ? `<tr><td style="color: #6b7280;">납품업체명</td><td style="color: #111827;">${escapeHtml(data.deliveryCompanyName)}</td></tr>` : ''}
                ${data.deliveryCompanyPhone ? `<tr><td style="color: #6b7280;">납품업체 연락처</td><td style="color: #111827;">${escapeHtml(data.deliveryCompanyPhone)}</td></tr>` : ''}
                ${data.deliveryCompanyAddress ? `<tr><td style="color: #6b7280;">납품업체 주소</td><td style="color: #111827;">${escapeHtml(data.deliveryCompanyAddress)}</td></tr>` : ''}
              </table>
            </td>
          </tr>
          `
              : ''
          }

          <!-- Attachments -->
          ${
            data.attachmentFilename ||
            (data.drawingFileUrl && data.drawingFileName) ||
            photoUrls.length > 0
              ? `
          <tr>
            <td style="padding: 20px 32px 0;">
              <h2 style="color: #374151; font-size: 16px; margin: 0 0 12px; border-bottom: 2px solid #f59e0b; padding-bottom: 8px;">첨부 파일</h2>
              ${
                data.attachmentFilename
                  ? `
              <div style="background-color: #fef3c7; padding: 12px 16px; border-radius: 8px; margin-bottom: 8px;">
                <span style="color: #92400e;">📎 ${escapeHtml(data.attachmentFilename)}</span>
                ${data.attachmentUrl ? ` <a href="${data.attachmentUrl}" style="color: #ED6C00; margin-left: 8px;">다운로드</a>` : ''}
              </div>`
                  : ''
              }
              ${
                data.drawingFileUrl && data.drawingFileName
                  ? `
              <div style="background-color: #dbeafe; padding: 12px 16px; border-radius: 8px; margin-bottom: 8px;">
                <span style="color: #1e40af;">📐 ${escapeHtml(data.drawingFileName)}</span>
                <a href="${data.drawingFileUrl}" style="color: #ED6C00; margin-left: 8px;">다운로드</a>
              </div>`
                  : ''
              }
              ${
                photoUrls.length > 0
                  ? `
              <div style="background-color: #f0fdf4; padding: 12px 16px; border-radius: 8px;">
                <span style="color: #166534;">📷 참고 사진 (${photoUrls.length}개)</span>
                <ul style="margin: 4px 0 0; padding-left: 20px;">
                  ${photoUrls.map((url, i) => `<li><a href="${url}" style="color: #ED6C00;">사진 ${i + 1}</a></li>`).join('')}
                </ul>
              </div>`
                  : ''
              }
            </td>
          </tr>
          `
              : ''
          }

          <!-- Admin Link -->
          <tr>
            <td style="padding: 24px 32px; text-align: center;">
              <a href="${adminLink}" style="display: inline-block; background-color: #ED6C00; color: #ffffff; padding: 12px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px;">관리자 페이지에서 확인</a>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 16px 32px 24px; border-top: 1px solid #e5e7eb; text-align: center;">
              <p style="color: #9ca3af; font-size: 12px; margin: 0;">유진레이저목형 웹사이트 자동 알림입니다.</p>
              <p style="color: #9ca3af; font-size: 12px; margin: 4px 0 0;">답장 시 담당자 이메일(<a href="mailto:${escapeHtml(data.email)}" style="color: #ED6C00;">${escapeHtml(data.email)}</a>)로 보내주세요.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function buildContactNotificationText(
  data: ContactNotificationData,
  siteUrl: string
): string {
  const photoUrls = parseReferencePhotos(data.referencePhotosUrls);
  const adminLink = `${siteUrl}/admin/contacts/${data.contactId}`;

  return `새로운 문의가 접수되었습니다

[연락처 정보]
업체명: ${data.companyName || '-'}
담당자명: ${data.name}
${data.position ? `직책: ${data.position}\n` : ''}연락처: ${data.phone || '-'}
이메일: ${data.email}
${data.referralSource ? `유입경로: ${data.referralSource}\n` : ''}
${
  data.drawingType
    ? `[도면 및 샘플 정보]
도면 상태: ${data.drawingType === 'create' ? '도면 제작 필요' : '도면 보유'}
${
  data.drawingType === 'create'
    ? `실물 샘플: ${data.hasPhysicalSample ? '있음' : '없음'}
제작 자료: ${data.hasReferencePhotos ? '있음' : '없음'}
${data.sampleNotes ? `샘플 특이사항: ${data.sampleNotes}\n` : ''}`
    : ''
}${data.drawingType === 'have' && data.drawingModification ? `도면 수정: ${data.drawingModification === 'needed' ? '필요' : '불필요'}\n` : ''}${data.boxShape ? `박스 형태: ${data.boxShape}\n` : ''}${data.length || data.width || data.height ? `크기: ${data.length || '-'} × ${data.width || '-'} × ${data.height || '-'} mm\n` : ''}${data.material ? `재질: ${data.material}\n` : ''}${data.drawingNotes ? `유의사항: ${data.drawingNotes}\n` : ''}
`
    : ''
}${
    data.receiptMethod
      ? `[일정 조율]
수령 방법: ${data.receiptMethod === 'visit' ? '방문 수령' : '택배/퀵'}
${
  data.receiptMethod === 'visit'
    ? `방문 날짜: ${data.visitDate || '-'}
방문 시간: ${data.visitTimeSlot || '-'}`
    : `${data.deliveryType ? `배송 방법: ${data.deliveryType === 'parcel' ? '택배' : '퀵'}\n` : ''}${data.deliveryAddress ? `배송 주소: ${data.deliveryAddress}\n` : ''}${data.deliveryName ? `수령인: ${data.deliveryName}\n` : ''}${data.deliveryPhone ? `수령인 연락처: ${data.deliveryPhone}` : ''}`
}
`
      : ''
  }${data.attachmentFilename ? `[첨부 파일] ${data.attachmentFilename}${data.attachmentUrl ? ` - ${data.attachmentUrl}` : ''}\n` : ''}${data.drawingFileUrl && data.drawingFileName ? `[도면 파일] ${data.drawingFileName} - ${data.drawingFileUrl}\n` : ''}${photoUrls.length > 0 ? `[참고 사진 ${photoUrls.length}개]\n${photoUrls.map((u, i) => `사진 ${i + 1}: ${u}`).join('\n')}\n` : ''}
관리자 페이지: ${adminLink}

---
유진레이저목형 웹사이트 자동 알림입니다.
답장 시 담당자 이메일(${data.email})로 보내주세요.`.trim();
}
