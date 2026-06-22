'use client';

import type { OperationFailure } from '@/app/(admin)/admin/integration/_lib/types';
import { BG_COLOR, BORDER_COLOR, TEXT_COLOR } from '@/lib/styles';

interface OperationFailuresTableProps {
  failures?: OperationFailure[];
  isLoading?: boolean;
  isError?: boolean;
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getOccurredAt(failure: OperationFailure): string {
  return failure.last_event?.occurred_at ?? failure.created_at;
}

export function OperationFailuresTable({
  failures,
  isLoading = false,
  isError = false,
}: OperationFailuresTableProps) {
  if (isLoading) {
    return <p className={`px-4 py-6 text-sm ${TEXT_COLOR.secondary}`}>로딩 중...</p>;
  }

  if (isError) {
    return <p className={`px-4 py-6 text-sm ${TEXT_COLOR.error}`}>목록 조회 실패</p>;
  }

  if (!failures || failures.length === 0) {
    return <p className={`px-4 py-6 text-sm ${TEXT_COLOR.secondary}`}>미해결 실패가 없습니다.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] text-sm">
        <thead className={BG_COLOR.muted}>
          <tr className={`border-b ${BORDER_COLOR.default}`}>
            <th className={`px-4 py-2 text-left font-semibold ${TEXT_COLOR.primary}`}>worker</th>
            <th className={`px-4 py-2 text-left font-semibold ${TEXT_COLOR.primary}`}>errorCode</th>
            <th className={`px-4 py-2 text-left font-semibold ${TEXT_COLOR.primary}`}>retryable</th>
            <th className={`px-4 py-2 text-left font-semibold ${TEXT_COLOR.primary}`}>
              occurredAt
            </th>
          </tr>
        </thead>
        <tbody>
          {failures.map((failure) => (
            <tr
              key={failure.failure_id}
              className={`border-b last:border-b-0 ${BORDER_COLOR.default}`}
            >
              <td className={`px-4 py-3 font-mono text-xs ${TEXT_COLOR.primary}`}>
                {failure.source_worker}
              </td>
              <td className={`px-4 py-3 font-mono text-xs ${TEXT_COLOR.primary}`}>
                {failure.error_code}
              </td>
              <td className={`px-4 py-3 ${TEXT_COLOR.secondary}`}>
                {failure.retryable ? 'true' : 'false'}
              </td>
              <td className={`px-4 py-3 ${TEXT_COLOR.secondary}`}>
                {formatDateTime(getOccurredAt(failure))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
