'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { queryKeys } from '@/lib/react-query/queryKeys';
import { logger } from '@/lib/utils/logger';
import { folderAliasApi, type FolderAlias } from '../_lib/folder-alias-api';
import { BG_COLOR, BORDER_COLOR, TEXT_COLOR } from '@/lib/styles';

const log = logger.createLogger('PendingAliasesPanel');

const PAGE_SIZE = 25;

function formatDate(value: string | null): string {
  if (!value) return '—';
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

export function PendingAliasesPanel() {
  const [page, setPage] = useState(1);
  const [cascadeMap, setCascadeMap] = useState<Record<number, boolean>>({});
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const queryClient = useQueryClient();

  const { data, isLoading, isError } = useQuery({
    queryKey: queryKeys.folderAliases.list('pending', page, PAGE_SIZE),
    queryFn: () => folderAliasApi.list('pending', page, PAGE_SIZE),
  });

  const showMessage = (type: 'success' | 'error', text: string, ms = 3000) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), ms);
  };

  const approveMutation = useMutation({
    mutationFn: (input: { id: number; cascadeBackfill: boolean }) =>
      folderAliasApi.approve(input.id, input.cascadeBackfill),
    onSuccess: (resp) => {
      if (resp.backfill) {
        showMessage(
          'success',
          `승인 완료. ${resp.backfill.relocated}건 통합, ${resp.backfill.skipped}건 skip.`
        );
      } else {
        showMessage('success', '승인 완료. 다음 동기화부터 자동 통합됩니다.');
      }
      queryClient.invalidateQueries({ queryKey: queryKeys.folderAliases.all });
    },
    onError: (e: Error) => {
      log.error('alias 승인 실패', e);
      showMessage('error', e.message || '승인 실패');
    },
  });

  const rejectMutation = useMutation({
    mutationFn: (id: number) => folderAliasApi.reject(id),
    onSuccess: () => {
      showMessage('success', '거절 완료.', 2000);
      queryClient.invalidateQueries({ queryKey: queryKeys.folderAliases.all });
    },
    onError: (e: Error) => {
      log.error('alias 거절 실패', e);
      showMessage('error', e.message || '거절 실패');
    },
  });

  const isRowPending = (aliasId: number) =>
    (approveMutation.isPending && approveMutation.variables?.id === aliasId) ||
    (rejectMutation.isPending && rejectMutation.variables === aliasId);

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  return (
    <section className={`${BG_COLOR.card} p-6 rounded-xl shadow-md border ${BORDER_COLOR.default}`}>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className={`text-lg font-bold ${TEXT_COLOR.primary}`}>승인 대기 목록</h2>
          <p className={`text-sm mt-1 ${TEXT_COLOR.secondary}`}>
            외부 동기화 시 자동 등록된 폴더 ↔ 업체 후보 매핑입니다. 승인하면 다음 동기화부터 매칭된
            업체 폴더로 자동 통합됩니다.
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
      ) : !data || data.items.length === 0 ? (
        <p className={`text-sm ${TEXT_COLOR.secondary} italic`}>승인 대기 중인 후보가 없습니다.</p>
      ) : (
        <>
          <div className={`overflow-x-auto border rounded-lg ${BORDER_COLOR.default}`}>
            <table className="w-full text-sm">
              <thead className={BG_COLOR.muted}>
                <tr className={`border-b ${BORDER_COLOR.default}`}>
                  <th className={`text-left px-4 py-2 font-semibold ${TEXT_COLOR.primary}`}>
                    외부 폴더명
                  </th>
                  <th className={`text-left px-4 py-2 font-semibold ${TEXT_COLOR.primary}`}>
                    후보 업체
                  </th>
                  <th className={`text-left px-4 py-2 font-semibold ${TEXT_COLOR.primary}`}>
                    등록일
                  </th>
                  <th className={`text-center px-4 py-2 font-semibold ${TEXT_COLOR.primary}`}>
                    기존 데이터 일괄 이동
                  </th>
                  <th className={`text-right px-4 py-2 font-semibold ${TEXT_COLOR.primary}`}>
                    작업
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((alias: FolderAlias) => {
                  const cascadeBackfill = cascadeMap[alias.id] ?? false;
                  const rowPending = isRowPending(alias.id);
                  return (
                    <tr
                      key={alias.id}
                      className={`border-b last:border-b-0 ${BORDER_COLOR.default}`}
                    >
                      <td className={`px-4 py-2 font-mono ${TEXT_COLOR.primary}`}>
                        {alias.folderName}
                      </td>
                      <td className={`px-4 py-2 ${TEXT_COLOR.primary}`}>
                        <span className="mr-2">{alias.company.companyName}</span>
                        {!alias.company.isApproved && (
                          <Badge variant="warning" size="xs">
                            미승인 가입
                          </Badge>
                        )}
                      </td>
                      <td className={`px-4 py-2 ${TEXT_COLOR.secondary}`}>
                        {formatDate(alias.createdAt)}
                      </td>
                      <td className="px-4 py-2 text-center">
                        <input
                          type="checkbox"
                          checked={cascadeBackfill}
                          disabled={rowPending}
                          onChange={(e) =>
                            setCascadeMap((prev) => ({
                              ...prev,
                              [alias.id]: e.target.checked,
                            }))
                          }
                          aria-label="기존 데이터 일괄 이동"
                          className="cursor-pointer"
                        />
                      </td>
                      <td className="px-4 py-2 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            size="sm"
                            variant="primary"
                            type="button"
                            disabled={rowPending}
                            onClick={() =>
                              approveMutation.mutate({
                                id: alias.id,
                                cascadeBackfill,
                              })
                            }
                          >
                            {rowPending && approveMutation.variables?.id === alias.id ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Check className="w-3.5 h-3.5" />
                            )}
                            승인
                          </Button>
                          <Button
                            size="sm"
                            variant="danger"
                            type="button"
                            disabled={rowPending}
                            onClick={() => rejectMutation.mutate(alias.id)}
                          >
                            {rowPending && rejectMutation.variables === alias.id ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <X className="w-3.5 h-3.5" />
                            )}
                            거절
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-end gap-2 mt-4">
              <Button
                size="sm"
                variant="ghost"
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                이전
              </Button>
              <span className={`text-xs ${TEXT_COLOR.secondary}`}>
                {page} / {totalPages}
              </span>
              <Button
                size="sm"
                variant="ghost"
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                다음
              </Button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
