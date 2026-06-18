import { logger } from '@/lib/utils/logger';
import { buildContactDownloadFilename } from '@/lib/utils/contactDownloadFilename';

const downloadLogger = logger.createLogger('WorkerDownload');

interface FileItem {
  id: string;
  name: string;
}

interface DownloadOptions {
  inquiryNumber?: string | null;
  workNumber?: string | null;
  companyName?: string | null;
  processStage?: string | null;
}

/**
 * 파일명 앞의 날짜 패턴을 제거합니다.
 * 대상: YYYYMMDD (20260306), YYMMDD (260306), MMDD (0306)
 * 날짜 뒤 구분자(공백, _, -)도 함께 제거합니다.
 */
function stripDatePrefix(name: string): string {
  // YYYYMMDD (8자리) → YYMMDD (6자리) → MMDD (4자리) 순서로 매칭
  return name.replace(/^(?:20\d{2}[01]\d[0-3]\d|\d{2}[01]\d[0-3]\d|[01]\d[0-3]\d)[\s_-]*/, '');
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function stripKnownNumberPrefix(name: string, numbers: Array<string | null | undefined>): string {
  const knownNumbers = numbers.filter((number): number is string => Boolean(number));
  let result = name.trimStart();
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
 * 문의 다운로드 파일명을 `{문의번호} - {업체명} - {파일명}` 형식으로 만듭니다.
 * - 파일명 앞 날짜 패턴(YYYYMMDD, YYMMDD, MMDD)을 제거 후 번호를 prefix
 * - inquiryNumber(O)를 우선하고 없을 때 workNumber(F)를 fallback으로 사용
 * - 기존 O/F prefix가 있으면 제거한 뒤 새 다운로드명으로 재구성
 */
export function prefixFilename(originalName: string, opts: DownloadOptions): string {
  const withoutNumberPrefix = stripKnownNumberPrefix(originalName, [
    opts.workNumber,
    opts.inquiryNumber,
  ]);
  const cleaned = stripDatePrefix(withoutNumberPrefix);
  return buildContactDownloadFilename({
    inquiryNumber: opts.inquiryNumber,
    workNumber: opts.workNumber,
    companyName: opts.companyName,
    fileName: cleaned,
  });
}

/**
 * 해당 문의의 파일만 다운로드합니다.
 * - targetFileName으로 폴더 내 파일 매칭 → 1건만 다운로드
 * - presigned URL을 fetch → blob으로 변환 → 다운로드
 * - NoSuchKey XML 에러 페이지 방지
 * - options로 문의번호/작업번호 전달 시 파일명에 prefix 적용
 */
export async function downloadContactFile(
  folderId: string,
  targetFileName?: string | null,
  options?: DownloadOptions
): Promise<void> {
  // 1. 폴더 파일 목록 조회
  const listRes = await fetch(`/api/worker/files?folderId=${encodeURIComponent(folderId)}`);
  const listData = await listRes.json();
  if (!listData.success || !listData.files?.length) {
    downloadLogger.warn('No files found in folder', folderId);
    return;
  }

  const files = listData.files as FileItem[];

  // 2. 대상 파일 매칭 (drawing_file_name으로 1건 특정)
  let targetFile: FileItem | undefined;
  if (targetFileName) {
    targetFile = files.find((f) => f.name === targetFileName);
  }
  if (!targetFile) {
    targetFile = files[0]; // fallback: 첫 번째 파일
  }

  // 3. 매칭된 파일 1건만 blob 다운로드
  const dlRes = await fetch(`/api/worker/files/${targetFile.id}/download`);
  const dlData = await dlRes.json();
  if (!dlData.success || !dlData.url) {
    downloadLogger.warn('Download URL not available', targetFile.id);
    return;
  }

  const rawFileName = dlData.filename || targetFile.name;
  const downloadName = options ? prefixFilename(rawFileName, options) : rawFileName;

  try {
    const fileRes = await fetch(dlData.url);
    if (!fileRes.ok) {
      downloadLogger.warn('File fetch failed', { fileId: targetFile.id, status: fileRes.status });
      return;
    }

    const blob = await fileRes.blob();
    const blobUrl = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = downloadName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
  } catch (err) {
    downloadLogger.warn('Blob download failed, falling back to direct link', err);
    const link = document.createElement('a');
    link.href = dlData.url;
    link.download = downloadName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
}

/**
 * 문의의 최신 도면을 다운로드합니다.
 * - 서버가 리비전 우선, 없으면 contact.drawingFileUrl fallback으로 presigned URL을 발급
 * - options로 문의번호/작업번호 전달 시 파일명에 prefix 적용
 */
export async function downloadLatestDrawing(
  contactId: string,
  options?: DownloadOptions
): Promise<void> {
  const res = await fetch(`/api/contacts/${contactId}/latest-drawing/download`);
  if (!res.ok) {
    downloadLogger.warn('Latest drawing fetch failed', { contactId, status: res.status });
    return;
  }
  const data = (await res.json()) as { url: string; fileName: string };
  const downloadName = options ? prefixFilename(data.fileName, options) : data.fileName;

  try {
    const fileRes = await fetch(data.url);
    if (!fileRes.ok) return;
    const blob = await fileRes.blob();
    const blobUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = downloadName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
  } catch (err) {
    downloadLogger.warn('Blob download failed, fallback to direct link', err);
    const link = document.createElement('a');
    link.href = data.url;
    link.download = downloadName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
}
