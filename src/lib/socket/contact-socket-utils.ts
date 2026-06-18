/**
 * Contact 소켓 이벤트 공유 유틸리티
 *
 * 소켓 이벤트 페이로드(snake_case)를 Contact 타입(snake_case)으로 매핑하고,
 * updatedAt 타임스탬프 비교로 경쟁 조건을 방지합니다.
 */
import type { Contact } from '@/lib/types/contact';

/** NestJS Gateway가 emit하는 소켓 이벤트 페이로드 */
export interface ContactSocketPayload {
  id: number | string;
  process_stage?: string;
  previous_stage?: string;
  status?: string;
  work_number?: string;
  inquiry_type?: string;
  updated_at?: string;
}

/**
 * 소켓 페이로드를 Contact의 부분 필드로 매핑합니다.
 * undefined 값은 건너뛰어 기존 캐시 값을 보존합니다.
 */
export function mapSocketPayload(data: ContactSocketPayload): Partial<Contact> {
  const mapped: Partial<Contact> = {};

  if (data.process_stage !== undefined)
    mapped.process_stage = data.process_stage as Contact['process_stage'];
  if (data.status !== undefined) mapped.status = data.status;
  if (data.work_number !== undefined) mapped.work_number = data.work_number;
  if (data.inquiry_type !== undefined)
    mapped.inquiry_type = data.inquiry_type as Contact['inquiry_type'];
  if (data.updated_at !== undefined) mapped.updated_at = data.updated_at;

  return mapped;
}

/**
 * updatedAt 타임스탬프 비교로 더 오래된 데이터의 캐시 덮어씌기를 방지합니다.
 * @returns true이면 새 데이터가 더 최신이므로 업데이트 허용
 */
export function isNewerThan(
  newUpdatedAt: string | undefined,
  existingUpdatedAt: string | undefined
): boolean {
  if (!newUpdatedAt) return true; // 타임스탬프 없으면 항상 허용
  if (!existingUpdatedAt) return true; // 기존 값 없으면 항상 허용

  try {
    return new Date(newUpdatedAt).getTime() >= new Date(existingUpdatedAt).getTime();
  } catch {
    return true; // 파싱 실패 시 안전하게 허용
  }
}

/**
 * Contact 배열에서 특정 contact를 surgical update합니다.
 * 새 객체 참조를 생성하여 React.memo가 re-render를 감지합니다.
 *
 * @returns 업데이트된 새 배열 (변경 없으면 원래 배열 반환)
 */
export function surgicalUpdateContacts(contacts: Contact[], data: ContactSocketPayload): Contact[] {
  const id = data.id;
  if (id == null) return contacts;

  const idx = contacts.findIndex((c) => String(c.id) === String(id));
  if (idx === -1) return contacts;

  const existing = contacts[idx];
  const patch = mapSocketPayload(data);

  // updatedAt 비교: 더 오래된 데이터는 무시
  if (!isNewerThan(patch.updated_at, existing.updated_at)) {
    return contacts;
  }

  // 새 객체 참조 생성 → React.memo가 변경 감지
  const updated = { ...existing, ...patch };
  const result = [...contacts];
  result[idx] = updated;
  return result;
}

/** Contact 소켓 이벤트 이름 목록 */
export const CONTACT_SOCKET_EVENTS = [
  'contact:created',
  'contact:updated',
  'contact:status_changed',
  'contact:process_stage_changed',
  'contact:deleted',
] as const;

export type ContactSocketEvent = (typeof CONTACT_SOCKET_EVENTS)[number];
