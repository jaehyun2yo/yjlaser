export interface FeedbackNotificationData {
  feedbackId: number;
  companyName: string;
  companyEmail?: string;
  category: string;
  categoryOther?: string;
  content: string;
}

const CATEGORY_LABELS: Record<string, string> = {
  notice: '공지사항',
  portfolio: '포트폴리오',
  contact: '문의하기',
  process: '공정관리페이지',
  other: '기타',
};

function getCategoryLabel(category: string, categoryOther?: string): string {
  if (category === 'other' && categoryOther) {
    return `기타: ${categoryOther}`;
  }
  return CATEGORY_LABELS[category] || category;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function buildFeedbackSubject(data: FeedbackNotificationData): string {
  const label = getCategoryLabel(data.category, data.categoryOther);
  return `[불편사항] ${data.companyName} - ${label}`;
}

export function buildFeedbackNotificationHtml(
  data: FeedbackNotificationData,
  siteUrl: string
): string {
  const categoryLabel = getCategoryLabel(data.category, data.categoryOther);
  const adminLink = `${siteUrl}/admin/feedback`;
  const now = new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });

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
              <h1 style="margin: 0; color: #ffffff; font-size: 20px; font-weight: 600;">불편사항이 접수되었습니다</h1>
            </td>
          </tr>

          <!-- Info -->
          <tr>
            <td style="padding: 24px 32px 0;">
              <table role="presentation" width="100%" cellpadding="4" cellspacing="0">
                <tr><td style="color: #6b7280; width: 100px;">업체명</td><td style="color: #111827; font-weight: 600;">${escapeHtml(data.companyName)}</td></tr>
                ${data.companyEmail ? `<tr><td style="color: #6b7280;">이메일</td><td style="color: #111827;"><a href="mailto:${escapeHtml(data.companyEmail)}" style="color: #ED6C00;">${escapeHtml(data.companyEmail)}</a></td></tr>` : ''}
                <tr><td style="color: #6b7280;">카테고리</td><td style="color: #111827;">${escapeHtml(categoryLabel)}</td></tr>
                <tr><td style="color: #6b7280;">접수 일시</td><td style="color: #111827;">${now}</td></tr>
              </table>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding: 20px 32px 0;">
              <h2 style="color: #374151; font-size: 16px; margin: 0 0 12px; border-bottom: 2px solid #ED6C00; padding-bottom: 8px;">불편사항 내용</h2>
              <div style="background-color: #f9fafb; padding: 16px; border-radius: 8px; border-left: 4px solid #ED6C00; white-space: pre-wrap; word-wrap: break-word; color: #374151; line-height: 1.6;">
${escapeHtml(data.content)}
              </div>
            </td>
          </tr>

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
              ${data.companyEmail ? `<p style="color: #9ca3af; font-size: 12px; margin: 4px 0 0;">답장 시 업체 이메일(<a href="mailto:${escapeHtml(data.companyEmail)}" style="color: #ED6C00;">${escapeHtml(data.companyEmail)}</a>)로 보내주세요.</p>` : ''}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function buildFeedbackNotificationText(
  data: FeedbackNotificationData,
  siteUrl: string
): string {
  const categoryLabel = getCategoryLabel(data.category, data.categoryOther);
  const now = new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
  const adminLink = `${siteUrl}/admin/feedback`;

  return `불편사항이 접수되었습니다

[업체 정보]
업체명: ${data.companyName}
${data.companyEmail ? `이메일: ${data.companyEmail}\n` : ''}카테고리: ${categoryLabel}
접수 일시: ${now}

[불편사항 내용]
${data.content}

관리자 페이지: ${adminLink}

---
유진레이저목형 웹사이트 자동 알림입니다.
${data.companyEmail ? `답장 시 업체 이메일(${data.companyEmail})로 보내주세요.` : ''}`.trim();
}
