'use client';

import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Circle, Download, FileText } from 'lucide-react';
import type {
  DrawingRevisionPayload,
  StatusChangePayload,
  TimelineItem,
} from '@/lib/types/contact';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { DownloadButton } from '@/components/DownloadButton';
import { getStageLabel, getStatusLabel } from '@/lib/utils/statusLabels';

interface ContactTimelineProps {
  entries: TimelineItem[];
  compact?: boolean;
  showActor?: boolean;
}

const REASON_LABELS: Record<string, string> = {
  domuson_fit: '도무송 가공용',
  sample_revision: '칼선 수정',
  field_correction: '현장 가공용',
  laser_processing: '레이저 가공',
  initial: '초기 도면',
  revision_request: '수정요청',
  other: '기타',
};

const REV_STAGE_LABELS: Record<string, string> = {
  drawing: '도면작업',
  sample: '샘플제작',
  drawing_confirmed: '도면확정/목형의뢰',
  laser: '레이저가공',
  cutting: '칼작업',
  creasing: '오시작업',
  delivery: '납품',
};

const TIMELINE_SKELETON_SHIMMER_CLASS = 'timeline-skeleton-shimmer';

function isDrawingRevision(payload: TimelineItem['payload']): payload is DrawingRevisionPayload {
  return typeof (payload as DrawingRevisionPayload).revisionId === 'string';
}

function formatTimelineDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return '-';
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hours = d.getHours();
  const ampm = hours < 12 ? '오전' : '오후';
  const displayHours = String(hours % 12 || 12).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${month}/${day} ${ampm} ${displayHours}:${minutes}`;
}

function getStatusChangeColor(payload: StatusChangePayload): string {
  const { changeType, toValue } = payload;
  if (changeType === 'created') return 'text-blue-500';
  if (changeType === 'deleted') return 'text-red-500';
  if (changeType === 'restored') return 'text-green-500';
  if (changeType === 'type') return 'text-indigo-500';
  if (changeType === 'process_stage') return 'text-purple-500';
  if (changeType === 'urgent_toggle') {
    return toValue === 'urgent' ? 'text-red-500' : 'text-gray-500';
  }
  switch (toValue) {
    case 'received':
      return 'text-blue-500';
    case 'drawing':
      return 'text-sky-500';
    case 'confirmed':
      return 'text-indigo-500';
    case 'production':
      return 'text-yellow-600';
    case 'cutting':
      return 'text-orange-500';
    case 'finishing':
      return 'text-purple-500';
    case 'delivered':
      return 'text-green-600';
    case 'on_hold':
      return 'text-gray-500';
    default:
      return 'text-gray-400';
  }
}

function getStatusChangeLabel(payload: StatusChangePayload): string {
  const { changeType, toValue, metadata } = payload;
  switch (changeType) {
    case 'created': {
      const source = typeof metadata?.source === 'string' ? metadata.source : undefined;
      const sourceLabel =
        source === 'webhard_auto'
          ? '웹하드'
          : source === 'order_auto'
            ? 'DXF 관리프로그램'
            : source === 'integration'
              ? '외부 연동'
              : '웹사이트';
      return `문의 접수 (${sourceLabel})`;
    }
    case 'status':
      return toValue ? getStatusLabel(toValue) : '상태 변경';
    case 'process_stage':
      return toValue ? `공정: ${getStageLabel(toValue)}` : '공정 단계 변경';
    case 'type':
      return toValue === 'confirmed'
        ? '유형 변경 → 목형의뢰'
        : toValue === 'cutting_request'
          ? '유형 변경 → 칼선의뢰'
          : `유형 변경${toValue ? ` → ${toValue}` : ''}`;
    case 'deleted':
      return '삭제';
    case 'restored':
      return '복원';
    case 'completed':
      return '완료';
    case 'split':
      return '문의 분할';
    case 'stage_completed_toggle':
      return '단계 완료 체크';
    case 'urgent_toggle':
      return toValue === 'urgent' ? '긴급 처리' : '긴급 해제';
    default:
      return changeType;
  }
}

function StatusChangeRow({
  item,
  compact,
  showActor,
  isLast,
}: {
  item: TimelineItem;
  compact?: boolean;
  showActor?: boolean;
  isLast?: boolean;
}) {
  const payload = item.payload as StatusChangePayload;
  const color = getStatusChangeColor(payload);
  const label = getStatusChangeLabel(payload);
  const actorName = item.actorName;

  return (
    <div className="flex items-start gap-3 relative">
      <Circle
        className={`w-3 h-3 flex-shrink-0 -ml-[5.5px] mt-0.5 fill-current ${color} ${
          isLast ? 'stroke-2' : ''
        }`}
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span
            className={`text-xs text-foreground ${compact ? 'truncate' : ''}`}
            data-testid="timeline-label"
          >
            {label}
            {showActor && actorName && (
              <span className="text-muted-foreground font-normal"> — {actorName}</span>
            )}
          </span>
          <span className="text-[11px] text-muted-foreground whitespace-nowrap flex-shrink-0">
            {formatTimelineDate(item.createdAt)}
          </span>
        </div>
      </div>
    </div>
  );
}

function DrawingRevisionRow({
  item,
  compact,
  showActor,
  isLast,
  hideVisibilityBadge,
}: {
  item: TimelineItem;
  compact?: boolean;
  showActor?: boolean;
  isLast?: boolean;
  hideVisibilityBadge?: boolean;
}) {
  const payload = item.payload as DrawingRevisionPayload;
  const [filesExpanded, setFilesExpanded] = useState(false);
  const files = payload.files ?? [];
  const actorName = item.actorName;
  const reasonLabel = REASON_LABELS[payload.reason] ?? payload.reason;
  const stageLabel = payload.processStage
    ? (REV_STAGE_LABELS[payload.processStage] ?? payload.processStage)
    : null;

  return (
    <div className="flex items-start gap-3 relative">
      <Circle
        className={`w-3 h-3 flex-shrink-0 -ml-[5.5px] mt-0.5 fill-current text-teal-500 ${
          isLast ? 'stroke-2' : ''
        }`}
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2 mb-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <Badge variant="primary" size="sm" className="rounded">
              도면 수정 v{payload.version}
            </Badge>
            <Badge variant="info" size="sm" className="rounded" data-testid="timeline-reason">
              {reasonLabel}
            </Badge>
            {stageLabel && (
              <Badge variant="gray" size="sm" className="rounded">
                {stageLabel}
              </Badge>
            )}
            {!hideVisibilityBadge &&
              (payload.isPublic ? (
                <Badge variant="success" size="sm" className="rounded">
                  공개
                </Badge>
              ) : (
                <Badge
                  variant="gray"
                  size="sm"
                  className="rounded"
                  data-testid="timeline-private-badge"
                >
                  비공개
                </Badge>
              ))}
            {showActor && actorName && (
              <span className="text-[11px] text-muted-foreground">{actorName}</span>
            )}
          </div>
          <span className="text-[11px] text-muted-foreground whitespace-nowrap flex-shrink-0">
            {formatTimelineDate(item.createdAt)}
          </span>
        </div>

        {/* 파일 목록 */}
        {files.length > 0 && (
          <div className="mt-1.5 space-y-1">
            {files.length === 1 ? (
              <FileRow file={files[0]} revisionId={payload.revisionId} fileIndex={0} />
            ) : (
              <>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setFilesExpanded((prev) => !prev);
                  }}
                  className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
                  data-testid="timeline-files-toggle"
                >
                  {filesExpanded ? (
                    <ChevronDown className="w-3 h-3" />
                  ) : (
                    <ChevronRight className="w-3 h-3" />
                  )}
                  <FileText className="w-3 h-3" />
                  {files.length}개 파일 {filesExpanded ? '접기' : '펼치기'}
                </button>
                {filesExpanded &&
                  files.map((file, idx) => (
                    <FileRow
                      key={`${payload.revisionId}-${idx}`}
                      file={file}
                      revisionId={payload.revisionId}
                      fileIndex={idx}
                    />
                  ))}
              </>
            )}
          </div>
        )}

        {/* 메모 (관리자 내부용, 거래처는 서버에서 null 마스킹) */}
        {payload.note && (
          <blockquote className="mt-1.5 border-l-2 border-border pl-2 text-[11px] text-muted-foreground whitespace-pre-wrap">
            {payload.note}
          </blockquote>
        )}
      </div>
    </div>
  );
}

function FileRow({
  file,
  revisionId,
  fileIndex,
}: {
  file: { name: string; url: string; size: number; mimeType: string };
  revisionId: string;
  fileIndex: number;
}) {
  return (
    <DownloadButton
      apiUrl={`/api/drawing-revisions/${revisionId}/download?fileIndex=${fileIndex}`}
      fileName={file.name}
      onClick={(e) => e.stopPropagation()}
      ariaLabel={`${file.name} 다운로드`}
      title={`${file.name} 다운로드`}
      size="sm"
      className="flex w-full items-center justify-between gap-2 rounded border-border bg-card px-2 py-1 text-left hover:bg-muted"
    >
      <span
        className="min-w-0 flex-1 truncate text-[11px] font-normal text-foreground"
        title={file.name}
        data-testid="timeline-file-name"
      >
        {file.name}
      </span>
      <Download className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
    </DownloadButton>
  );
}

/**
 * 타임라인 로딩 스켈레톤 — 실제 ContactTimeline(StatusChangeRow)과 동일한 DOM 구조/여백/크기를
 * 사용해 로딩 종료 시 레이아웃 시프트가 없도록 한다.
 *
 * 실제와 맞춘 핵심 포인트:
 * - 같은 `pl-4` + 세로선(`left-[7px]`) + 같은 `space-y-*` 간격
 * - 원형 마커 크기/margin을 실제 Circle과 동일(`w-3 h-3 -ml-[5.5px] mt-0.5`)
 * - 마커 색은 다른 스켈레톤 블록과 통일한 `bg-muted` 회색
 * - 라벨 줄(`h-4`)을 `text-xs`의 line-height(16px)와 일치
 * - 시간 블록 `w-24` (≈ "04/20 오후 03:37" 14자 × ≈7px)
 */
export function ContactTimelineSkeleton({
  compact = false,
  rows = 3,
}: {
  compact?: boolean;
  rows?: number;
}) {
  return (
    <div
      className="relative pl-4 timeline-skeleton-pulse"
      data-testid="timeline-skeleton"
      aria-busy="true"
      aria-label="타임라인 로딩 중"
    >
      {/* 세로선 — 실제와 동일 */}
      <div className="absolute left-[7px] top-1 bottom-1 w-px bg-muted" />

      <div className={compact ? 'space-y-1.5' : 'space-y-2.5'}>
        {Array.from({ length: rows }).map((_, idx) => {
          // 줄마다 라벨 너비를 달리해 자연스러운 플레이스홀더
          const labelWidth = 45 + ((idx * 17) % 30);
          return (
            <div key={idx} className="flex items-start gap-3 relative">
              {/* 원형 마커 — 다른 스켈레톤 블록과 동일한 bg-muted 회색으로 통일 */}
              <Skeleton
                className={`w-3 h-3 flex-shrink-0 -ml-[5.5px] mt-0.5 rounded-full ${TIMELINE_SKELETON_SHIMMER_CLASS}`}
              />
              <div className="flex-1 min-w-0">
                {/* h-4 — text-xs line-height(16px)와 맞춘 행 높이 */}
                <div className="flex items-center justify-between gap-2 h-4">
                  <Skeleton
                    className={`h-3 ${TIMELINE_SKELETON_SHIMMER_CLASS}`}
                    style={{ width: `${labelWidth}%` }}
                  />
                  <Skeleton
                    className={`h-3 w-24 flex-shrink-0 ${TIMELINE_SKELETON_SHIMMER_CLASS}`}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function ContactTimeline({
  entries,
  compact = false,
  showActor = true,
}: ContactTimelineProps) {
  const hideVisibilityBadge = useMemo(() => {
    const drawingItems = entries.filter((e) => e.kind === 'drawing_revision');
    if (drawingItems.length === 0) return true;
    return drawingItems.every((e) => {
      const payload = e.payload;
      return isDrawingRevision(payload) && payload.isPublic === true;
    });
  }, [entries]);

  if (entries.length === 0) {
    return <div className="text-xs text-muted-foreground py-2">타임라인 기록이 없습니다.</div>;
  }

  return (
    <div className="relative pl-4">
      {/* 세로선 */}
      <div className="absolute left-[7px] top-1 bottom-1 w-px bg-muted" />

      <div className={compact ? 'space-y-1.5' : 'space-y-2.5'}>
        {entries.map((item, idx) => {
          const isLast = idx === entries.length - 1;
          if (item.kind === 'status_change') {
            return (
              <StatusChangeRow
                key={item.id}
                item={item}
                compact={compact}
                showActor={showActor}
                isLast={isLast}
              />
            );
          }
          return (
            <DrawingRevisionRow
              key={item.id}
              item={item}
              compact={compact}
              showActor={showActor}
              isLast={isLast}
              hideVisibilityBadge={hideVisibilityBadge}
            />
          );
        })}
      </div>
    </div>
  );
}
