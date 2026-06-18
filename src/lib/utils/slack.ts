/**
 * Slack Webhook 알림 유틸리티
 * 웹하드 파일 업로드 시 슬랙으로 알림 전송
 */

import { logger } from './logger';

const log = logger.createLogger('SlackNotification');

interface SlackAttachment {
  color?: string;
  title?: string;
  text?: string;
  fields?: Array<{
    title: string;
    value: string;
    short?: boolean;
  }>;
  footer?: string;
  ts?: number;
}

interface SlackMessage {
  text?: string;
  attachments?: SlackAttachment[];
  blocks?: unknown[];
}

interface FileUploadNotificationParams {
  fileName: string;
  fileSize: number;
  companyName: string;
  folderName?: string;
  inquiryNumber?: string;
  uploadedAt: Date;
}

/**
 * 파일 크기를 읽기 쉬운 형식으로 변환
 */
function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * 날짜를 한국 시간 형식으로 변환
 */
function formatKoreanDateTime(date: Date): string {
  return date.toLocaleString('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

/**
 * Slack Webhook으로 메시지 전송
 */
async function sendSlackMessage(message: SlackMessage): Promise<boolean> {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;

  if (!webhookUrl) {
    log.warn('SLACK_WEBHOOK_URL 환경변수가 설정되지 않음');
    return false;
  }

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(message),
    });

    if (!response.ok) {
      const errorText = await response.text();
      log.error('Slack 메시지 전송 실패', { status: response.status, error: errorText });
      return false;
    }

    log.info('Slack 메시지 전송 성공');
    return true;
  } catch (error) {
    log.error('Slack 메시지 전송 중 오류', error);
    return false;
  }
}

/**
 * 웹하드 파일 업로드 알림 전송
 */
export async function sendFileUploadNotification(
  params: FileUploadNotificationParams
): Promise<boolean> {
  const { fileName, fileSize, companyName, folderName, inquiryNumber, uploadedAt } = params;

  const message: SlackMessage = {
    text: `📁 새 파일이 업로드되었습니다`,
    attachments: [
      {
        color: '#ED6C00', // 브랜드 오렌지 색상
        title: '웹하드 파일 업로드 알림',
        fields: [
          {
            title: '📄 파일명',
            value: fileName,
            short: false,
          },
          {
            title: '🏢 업체명',
            value: companyName,
            short: true,
          },
          {
            title: '📦 파일 크기',
            value: formatFileSize(fileSize),
            short: true,
          },
          ...(folderName
            ? [
                {
                  title: '📂 폴더',
                  value: folderName,
                  short: true,
                },
              ]
            : []),
          ...(inquiryNumber
            ? [
                {
                  title: '🔖 문의번호',
                  value: inquiryNumber,
                  short: true,
                },
              ]
            : []),
          {
            title: '🕐 업로드 시간',
            value: formatKoreanDateTime(uploadedAt),
            short: true,
          },
        ],
        footer: '유진레이저목형 웹하드',
        ts: Math.floor(uploadedAt.getTime() / 1000),
      },
    ],
  };

  return sendSlackMessage(message);
}

/**
 * 다중 파일 업로드 알림 (요약)
 */
export async function sendBulkUploadNotification(params: {
  fileCount: number;
  totalSize: number;
  companyName: string;
  folderName?: string;
  uploadedAt: Date;
}): Promise<boolean> {
  const { fileCount, totalSize, companyName, folderName, uploadedAt } = params;

  const message: SlackMessage = {
    text: `📁 ${fileCount}개 파일이 업로드되었습니다`,
    attachments: [
      {
        color: '#ED6C00',
        title: '웹하드 다중 파일 업로드 알림',
        fields: [
          {
            title: '🏢 업체명',
            value: companyName,
            short: true,
          },
          {
            title: '📄 파일 수',
            value: `${fileCount}개`,
            short: true,
          },
          {
            title: '📦 총 크기',
            value: formatFileSize(totalSize),
            short: true,
          },
          ...(folderName
            ? [
                {
                  title: '📂 폴더',
                  value: folderName,
                  short: true,
                },
              ]
            : []),
          {
            title: '🕐 업로드 시간',
            value: formatKoreanDateTime(uploadedAt),
            short: true,
          },
        ],
        footer: '유진레이저목형 웹하드',
        ts: Math.floor(uploadedAt.getTime() / 1000),
      },
    ],
  };

  return sendSlackMessage(message);
}

/**
 * 테스트 메시지 전송 (설정 확인용)
 */
export async function sendTestNotification(): Promise<boolean> {
  const message: SlackMessage = {
    text: '✅ 슬랙 알림 테스트',
    attachments: [
      {
        color: '#36a64f',
        title: '테스트 메시지',
        text: '슬랙 Webhook이 정상적으로 연결되었습니다.',
        footer: '유진레이저목형 웹하드',
        ts: Math.floor(Date.now() / 1000),
      },
    ],
  };

  return sendSlackMessage(message);
}
