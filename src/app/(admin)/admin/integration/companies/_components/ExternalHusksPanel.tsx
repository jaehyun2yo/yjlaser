'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { queryKeys } from '@/lib/react-query/queryKeys';
import { logger } from '@/lib/utils/logger';
import { externalHuskApi, type ExternalHusk } from '../_lib/external-husk-api';
import { BG_COLOR, BORDER_COLOR, TEXT_COLOR } from '@/lib/styles';

const log = logger.createLogger('ExternalHusksPanel');

function formatDate(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * task 27 Phase C: 외부웹하드 husk (빈 껍데기) 정리 패널.
 *
 * 마이그레이션 후 비워진 외부 폴더 목록 (자식·파일 0). admin 명시 액션 으로 cascade soft-delete.
 * 안전 가드: 자식 폴더 0 + 직접 파일 0 만 후보. 동기화로 새 파일이 들어오면 후보에서 자동 제외.
 */
export function ExternalHusksPanel() {
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const queryClient = useQueryClient();

  const showMessage = (type: 'success' | 'error', text: string, ms = 5000) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), ms);
  };

  const { data, isLoading, isError } = useQuery({
    queryKey: queryKeys.externalHusks.list(),
    queryFn: () => externalHuskApi.list(),
  });

  const cleanupMutation = useMutation({
    mutationFn: (rootId: string) => externalHuskApi.cleanup(rootId),
    onSuccess: (resp) => {
      showMessage(
        'success',
        `정리 완료 — 폴더 ${resp.deletedFolderIds.length}개 cascade soft-delete.`
      );
      queryClient.invalidateQueries({ queryKey: queryKeys.externalHusks.all });
    },
    onError: (e: Error) => {
      log.error('husk 정리 실패', e);
      showMessage('error', e.message || 'husk 정리 실패');
    },
  });

  const handleCleanup = (husk: ExternalHusk) => {
    const ok = window.confirm(
      `"${husk.name}" husk 를 cascade soft-delete 합니다.\n\n자식 폴더·파일이 모두 비어있는 것이 검증된 후 일괄 deletedAt set 됩니다. 위반 시 422 에러로 거절됩니다.\n\n계속하시겠습니까?`
    );
    if (!ok) return;
    cleanupMutation.mutate(husk.id);
  };

  const isRowPending = (huskId: string) =>
    cleanupMutation.isPending && cleanupMutation.variables === huskId;

  return (
    <section className={`${BG_COLOR.card} p-6 rounded-xl shadow-md border ${BORDER_COLOR.default}`}>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className={`text-lg font-bold ${TEXT_COLOR.primary}`}>외부 husk 정리</h2>
          <p className={`text-sm mt-1 ${TEXT_COLOR.secondary}`}>
            마이그레이션 후 비워진 외부웹하드 폴더입니다. 자식·파일이 모두 0 인 husk 만 후보로
            표시되며, 정리 클릭 시 안전 검증 후 cascade soft-delete 됩니다. 신규 동기화로 새 파일이
            들어오면 후보에서 자동 제외됩니다.
          </p>
        </div>
        {message && (
          <span
            className={`text-xs ${
              message.type === 'success' ? TEXT_COLOR.success : TEXT_COLOR.error
            }`}
          >
            {message.text}
          </span>
        )}
      </div>

      {isLoading ? (
        <p className={`text-sm ${TEXT_COLOR.secondary}`}>로딩 중...</p>
      ) : isError ? (
        <p className={`text-sm ${TEXT_COLOR.error}`}>목록 조회 실패</p>
      ) : !data || data.length === 0 ? (
        <p className={`text-sm ${TEXT_COLOR.secondary} italic`}>정리 가능한 husk 가 없습니다.</p>
      ) : (
        <div className={`overflow-x-auto border rounded-lg ${BORDER_COLOR.default}`}>
          <table className="w-full text-sm">
            <thead className={BG_COLOR.muted}>
              <tr className={`border-b ${BORDER_COLOR.default}`}>
                <th className={`text-left px-4 py-2 font-semibold ${TEXT_COLOR.primary}`}>
                  폴더명
                </th>
                <th className={`text-left px-4 py-2 font-semibold ${TEXT_COLOR.primary}`}>경로</th>
                <th className={`text-left px-4 py-2 font-semibold ${TEXT_COLOR.primary}`}>
                  최초 등록
                </th>
                <th className={`text-right px-4 py-2 font-semibold ${TEXT_COLOR.primary}`}>작업</th>
              </tr>
            </thead>
            <tbody>
              {data.map((husk: ExternalHusk) => {
                const rowPending = isRowPending(husk.id);
                return (
                  <tr key={husk.id} className={`border-b last:border-b-0 ${BORDER_COLOR.default}`}>
                    <td className={`px-4 py-2 font-mono ${TEXT_COLOR.primary}`}>{husk.name}</td>
                    <td className={`px-4 py-2 font-mono text-xs ${TEXT_COLOR.secondary}`}>
                      {husk.path ?? '—'}
                    </td>
                    <td className={`px-4 py-2 ${TEXT_COLOR.secondary}`}>
                      {formatDate(husk.createdAt)}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <Button
                        size="sm"
                        variant="danger"
                        type="button"
                        disabled={rowPending}
                        onClick={() => handleCleanup(husk)}
                      >
                        {rowPending ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="w-3.5 h-3.5" />
                        )}
                        정리
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
