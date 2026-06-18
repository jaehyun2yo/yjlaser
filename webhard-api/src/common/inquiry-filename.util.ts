/**
 * 문의(Contact) 파일명/폴더명 규칙의 단일 소스.
 *
 * 호출 지점: drawing-revision.service (webhard sync), contacts.service
 * (drawing-download / file-download), auto-contact.service
 * (updateFileNamePrefix), ensureInquiryFolder (phase 5), 백필 스크립트 (phase 7).
 *
 * 순수 함수만 제공 — Prisma/Nest 의존성 없음.
 */

/** null 포함: revision 이 초기 생성되어 stage 가 아직 비어 있는 경우도 office 로 간주. */
export const OFFICE_PROCESS_STAGES = new Set<string | null>([null, 'drawing', 'sample']);

export const FIELD_PROCESS_STAGES = new Set<string>([
  'drawing_confirmed',
  'laser',
  'cutting',
  'creasing',
  'delivery',
]);

export type InquiryFileContact = {
  inquiryNumber?: string | null;
  workNumber?: string | null;
  processStage?: string | null;
  inquiryType?: string | null;
};

export type InquiryFileRevision = {
  processStage?: string | null;
};

/**
 * O/F 중 어느 번호를 파일명 prefix 로 쓸지 결정.
 *
 * 우선순위:
 *   1. workNumber(F)가 있으면 공정/리비전 단계와 무관하게 workNumber
 *   2. workNumber가 없으면 inquiryNumber(O)
 *
 * 반환값 null 이면 둘 다 없음.
 */
export function pickInquiryNumberForDownload(
  contact: InquiryFileContact,
  _revision?: InquiryFileRevision
): string | null {
  return contact.workNumber || contact.inquiryNumber || null;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function stripKnownInquiryFilePrefix(originalName: string, contact: InquiryFileContact): string {
  const knownNumbers = [contact.workNumber, contact.inquiryNumber].filter(
    (number): number is string => Boolean(number)
  );
  let result = originalName.trimStart();
  let changed = true;

  while (changed) {
    changed = false;
    for (const number of knownNumbers) {
      const pattern = new RegExp(`^\\[${escapeRegExp(number)}\\]\\s*`);
      const next = result.replace(pattern, '');
      if (next !== result) {
        result = next;
        changed = true;
      }
    }
  }

  return result;
}

/**
 * "[260420-F-004] 원본명.DXF" 포맷으로 파일명을 조립.
 * 번호가 없으면 원본명을 그대로 반환.
 */
export function buildInquiryFileName(params: {
  contact: InquiryFileContact;
  revision?: InquiryFileRevision;
  originalName: string;
}): string {
  const picked = pickInquiryNumberForDownload(params.contact, params.revision);
  if (!picked) return params.originalName;
  const originalName = stripKnownInquiryFilePrefix(params.originalName, params.contact);
  return `[${picked}] ${originalName}`;
}

/**
 * 패키지명/파일명을 폴더명에 안전하게 사용 가능한 slug 로 정규화.
 *   - NFKC 정규화
 *   - 파일시스템 금지 문자(`/\:*?"<>|`) 제거
 *   - 연속 공백 → 단일 `_` 치환
 *   - trim 후 최대 50 자 truncate
 *   - 결과가 빈 문자열이면 null 반환
 */
export function slugifyPackageLabel(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const normalized = raw.normalize('NFKC');
  const cleaned = normalized.replace(/[/\\:*?"<>|]/g, '');
  const collapsed = cleaned.replace(/\s+/g, '_');
  const trimmed = collapsed.replace(/^_+|_+$/g, '').trim();
  if (!trimmed) return null;
  return trimmed.length > 50 ? trimmed.slice(0, 50) : trimmed;
}

/** `buildInquiryFolderName` 입력 인터페이스. */
export interface BuildInquiryFolderNameInput {
  inquiryNumber?: string | null;
  workNumber?: string | null;
  /** @deprecated 문의 폴더명에는 더 이상 라벨을 사용하지 않는다. */
  packageLabel?: string | null;
  /** @deprecated 문의 폴더명에는 더 이상 파일명을 사용하지 않는다. */
  filenameFallback?: string | null;
}

/**
 * 문의 폴더명 계산.
 *   O 만: "260417-O-002"
 *   O + F: "260417-O-002_260420-F-004"
 *   F 만: "260420-F-004"
 *   둘 다 없음: null.
 *
 * UI 에서는 "사무실번호 / 현장번호" 로 표시하지만 실제 폴더명에는 `/` 를 쓸 수 없어
 * O/F 공존 시 `_` 를 사용한다. 패키지명/파일명은 문의 폴더명에 포함하지 않는다.
 * 분할 문의 suffix(-N) 는 번호 자체에 포함되어 있으므로 그대로 사용.
 */
export function buildInquiryFolderName(input: BuildInquiryFolderNameInput): string | null {
  const { inquiryNumber, workNumber } = input;
  if (inquiryNumber && workNumber) return `${inquiryNumber}_${workNumber}`;
  return inquiryNumber || workNumber || null;
}

/**
 * inquiryType → 템플릿 폴더명 매핑.
 *   `cutting_request` → `칼선의뢰`
 *   `mold_request`, `laser_cutting` → `목형의뢰`
 *   그 외(null 포함) → null (미분류)
 *
 * `FoldersService.ensureInquiryFolder` 와 migrate-webhard-inquiry-folders
 * 스크립트의 dry-run 계산에서 동일한 규칙을 공유하기 위해 util 로 분리.
 */
export function getInquiryTemplateName(inquiryType: string | null | undefined): string | null {
  if (inquiryType === 'cutting_request') return '칼선의뢰';
  if (inquiryType === 'mold_request' || inquiryType === 'laser_cutting') return '목형의뢰';
  return null;
}
