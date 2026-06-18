/**
 * 문의하기 관리 유틸리티 함수
 */
import type { Contact } from '@/lib/types';
import { BADGE } from '@/lib/styles';
import { PERMANENT_DELETE_DAYS } from './constants';
import { STATUS_LABELS } from '@/lib/utils/statusLabels';

/**
 * 상태에 따른 배지 클래스 반환
 */
export function getStatusBadgeClass(status: string): string {
  const baseClass =
    'inline-flex items-center px-2.5 py-1 text-xs rounded font-medium flex-shrink-0';

  switch (status) {
    case 'received':
      return `${baseClass} ${BADGE.error}`;
    case 'drawing':
      return `${baseClass} ${BADGE.info}`;
    case 'confirmed':
      return `${baseClass} ${BADGE.primary}`;
    case 'production':
      return `${baseClass} ${BADGE.warning}`;
    case 'cutting':
      return `${baseClass} ${BADGE.primary}`;
    case 'finishing':
      return `${baseClass} ${BADGE.warning}`;
    case 'delivered':
      return `${baseClass} ${BADGE.success}`;
    case 'completed':
      return `${baseClass} ${BADGE.success}`;
    case 'on_hold':
      return `${baseClass} ${BADGE.gray}`;
    default:
      return `${baseClass} ${BADGE.gray}`;
  }
}

/**
 * 상태 라벨 반환 (한글)
 */
export function getStatusLabel(status: string): string {
  return STATUS_LABELS[status] || status;
}

/**
 * 영구 삭제까지 남은 일수 계산
 */
export function getDaysUntilPermanentDelete(deletedAt: string): number {
  const deleted = new Date(deletedAt);
  const deleteDate = new Date(deleted);
  deleteDate.setDate(deleteDate.getDate() + PERMANENT_DELETE_DAYS);
  const today = new Date();
  const diff = deleteDate.getTime() - today.getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

/** 실제 유의미한 값인지 확인 (null, 빈 문자열, "-" 등 플레이스홀더 제외) */
export function hasValue(val: string | null | undefined): boolean {
  if (!val) return false;
  const trimmed = val.trim();
  return trimmed !== '' && trimmed !== '-';
}

/**
 * 첨부파일 유무 확인
 */
export function hasAttachments(contact: Contact): boolean {
  return !!(
    contact.attachment_url ||
    contact.attachment_filename ||
    contact.drawing_file_url ||
    contact.drawing_file_name ||
    contact.reference_photos_urls
  );
}

/**
 * 참고 사진 URL 파싱
 */
export function parseReferencePhotos(urlsJson: string | null): string[] {
  if (!urlsJson) return [];
  try {
    const parsed = JSON.parse(urlsJson);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * 섹션으로 스크롤 및 하이라이트
 */
export function scrollToSection(
  sectionId: string,
  isExpanded: boolean,
  highlightColor: 'red' | 'blue' | 'green' = 'blue'
): void {
  const delay = isExpanded ? 0 : 300;

  setTimeout(() => {
    const section = document.getElementById(sectionId);
    if (section) {
      section.scrollIntoView({ behavior: 'smooth', block: 'center' });

      const colorClasses: Record<string, string[]> = {
        red: ['ring-error'],
        blue: ['ring-info'],
        green: ['ring-success'],
      };

      const classes = colorClasses[highlightColor];
      section.classList.add('ring-4', ...classes);

      setTimeout(() => {
        section.classList.remove('ring-4', ...classes);
      }, 2000);
    }
  }, delay);
}

/**
 * 등록일시를 한국어 형식으로 포맷 (예: 3/23 오전 9시 3분)
 * - hours === 0 → "오전 12시"
 * - hours === 12 → "오후 12시"
 * - minutes === 0 → "~시"만 출력 (분 생략)
 */
export function formatCreatedAt(dateStr: string): string {
  const date = new Date(dateStr);
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const period = hours < 12 ? '오전' : '오후';
  const displayHour = hours === 0 ? 12 : hours > 12 ? hours - 12 : hours;
  const timeStr =
    minutes === 0 ? `${period} ${displayHour}시` : `${period} ${displayHour}시 ${minutes}분`;
  return `${month}/${day} ${timeStr}`;
}

/**
 * 날짜 포맷팅 (YYYY-MM-DD)
 */
export function formatDate(dateString: string | null): string {
  if (!dateString) return '-';
  const date = new Date(dateString);
  return date.toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

/**
 * 날짜/시간 포맷팅
 */
export function formatDateTime(dateString: string | null): string {
  if (!dateString) return '-';
  const date = new Date(dateString);
  return date.toLocaleString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * 크기 문자열 생성
 */
export function formatDimensions(
  length: string | null,
  width: string | null,
  height: string | null
): string | null {
  if (!length || !width || !height) return null;
  return `${length}x${width}x${height}mm`;
}

/**
 * 수령 방법 라벨 반환
 */
export function getReceiptMethodLabel(method: string | null): string {
  if (!method) return '-';
  return method === 'visit' ? '방문' : method === 'delivery' ? '배송' : method;
}

/**
 * 배송 타입 라벨 반환
 */
export function getDeliveryTypeLabel(type: string | null): string {
  if (!type) return '-';
  return type === 'parcel' ? '택배' : type === 'quick' ? '퀵' : type;
}

/**
 * 도면 타입 라벨 반환
 */
export function getDrawingTypeLabel(type: string | null): string {
  if (!type) return '-';
  return type === 'create' ? '제작 필요' : type === 'have' ? '보유' : type;
}

/**
 * 문의 유형 라벨 반환
 */
export function getContactTypeLabel(type: string | null): string {
  if (!type) return '-';
  return type === 'individual' ? '개인' : type === 'company' ? '업체' : type;
}

/**
 * 방문 시간대 라벨 반환
 */
export function getVisitTimeSlotLabel(slot: string | null): string {
  if (!slot) return '-';
  const slots: Record<string, string> = {
    morning: '오전 (09:00-12:00)',
    afternoon: '오후 (13:00-18:00)',
  };
  return slots[slot] || slot;
}

/**
 * 2순위 정보 표시 여부 확인
 * - 신규 상태가 아닐 때만 표시
 */
export function shouldShowSecondaryInfo(status: string): boolean {
  return status !== 'received';
}

/**
 * 상세보기 가능 상태 확인
 */
export function canShowProcessStage(status: string): boolean {
  return [
    'drawing',
    'confirmed',
    'production',
    'cutting',
    'finishing',
    'delivered',
    'completed',
  ].includes(status);
}

/**
 * 클라이언트 사이드 날짜 필터링 함수
 * 주어진 contact가 날짜 필터에 맞는지 확인
 * @param contact - Contact 객체
 * @param dateFilter - 'today' | 'week' | 'month' | 'all'
 * @returns boolean
 */
export function matchesDateFilter(createdAt: string | Date, dateFilter: string): boolean {
  if (dateFilter === 'all') return true;

  const dateRange = getDateRange(dateFilter);
  if (!dateRange) return true;

  const contactDate = new Date(createdAt).getTime();
  const startDate = new Date(dateRange.start).getTime();
  const endDate = new Date(dateRange.end).getTime();

  return contactDate >= startDate && contactDate <= endDate;
}

/**
 * 날짜 필터에 따른 시작/종료 날짜 범위 계산
 * 한국 시간(KST) 기준으로 계산
 * @param filter - 'today' | 'week' | 'month' | 'all'
 * @returns { start: ISO string, end: ISO string } | null
 */
export function getDateRange(filter: string): { start: string; end: string } | null {
  // 한국 시간 기준 현재 날짜
  const now = new Date();
  const kstOffset = 9 * 60; // KST = UTC+9
  const localOffset = now.getTimezoneOffset();
  const kstNow = new Date(now.getTime() + (kstOffset + localOffset) * 60 * 1000);

  // KST 기준 오늘 00:00:00
  const kstToday = new Date(kstNow.getFullYear(), kstNow.getMonth(), kstNow.getDate());

  switch (filter) {
    case 'today': {
      // 오늘 00:00:00 ~ 23:59:59 (KST)
      const start = new Date(kstToday.getTime() - (kstOffset + localOffset) * 60 * 1000);
      const end = new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1);
      return { start: start.toISOString(), end: end.toISOString() };
    }
    case 'week': {
      // 현재 주의 월요일 구하기 (KST 기준)
      const dayOfWeek = kstToday.getDay();
      // 일요일(0)인 경우 6일 전, 그 외는 (dayOfWeek - 1)일 전
      const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
      const monday = new Date(kstToday);
      monday.setDate(kstToday.getDate() - daysToMonday);

      // 금요일 23:59:59
      const friday = new Date(monday);
      friday.setDate(monday.getDate() + 4);

      // UTC로 변환
      const start = new Date(monday.getTime() - (kstOffset + localOffset) * 60 * 1000);
      const end = new Date(
        friday.getTime() - (kstOffset + localOffset) * 60 * 1000 + 24 * 60 * 60 * 1000 - 1
      );

      return { start: start.toISOString(), end: end.toISOString() };
    }
    case 'month': {
      // 이번 달 1일 00:00:00 (KST)
      const firstDay = new Date(kstNow.getFullYear(), kstNow.getMonth(), 1);
      // 이번 달 마지막 날 23:59:59 (KST)
      const lastDay = new Date(kstNow.getFullYear(), kstNow.getMonth() + 1, 0);

      // UTC로 변환
      const start = new Date(firstDay.getTime() - (kstOffset + localOffset) * 60 * 1000);
      const end = new Date(
        lastDay.getTime() - (kstOffset + localOffset) * 60 * 1000 + 24 * 60 * 60 * 1000 - 1
      );

      return { start: start.toISOString(), end: end.toISOString() };
    }
    default:
      return null;
  }
}
