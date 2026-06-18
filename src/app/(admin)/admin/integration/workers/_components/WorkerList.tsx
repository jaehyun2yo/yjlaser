'use client';

import type { FC } from 'react';
import type { Worker } from '@/app/(admin)/admin/erp/_lib/types';
import {
  useWorkersQuery,
  useUpdateWorkerMutation,
  useDeleteWorkerMutation,
} from '@/app/(admin)/admin/erp/_lib/hooks';
import { BG_COLOR, BORDER_COLOR, DIVIDE_COLOR, TEXT_COLOR } from '@/lib/styles';
import { Pencil, Trash2, Users } from 'lucide-react';
import { logger } from '@/lib/utils/logger';

const log = logger.createLogger('WorkerList');

const ROLE_LABELS: Record<string, { label: string; badge: string }> = {
  field_worker: {
    label: '현장작업자',
    badge: `${BG_COLOR.infoLightMid} ${TEXT_COLOR.blueMid}`,
  },
  office_worker: {
    label: '사무실작업자',
    badge: `${BG_COLOR.cyanLight} ${TEXT_COLOR.cyanMid}`,
  },
  supervisor: {
    label: '관리자',
    badge: `${BG_COLOR.purpleLightDeep} ${TEXT_COLOR.purpleMid}`,
  },
  manager: {
    label: '매니저',
    badge: `${BG_COLOR.amberLightDeep} ${TEXT_COLOR.amberStrong}`,
  },
};

function getRoleInfo(role: string) {
  return (
    ROLE_LABELS[role] || {
      label: role,
      badge: `${BG_COLOR.light} ${TEXT_COLOR.secondary}`,
    }
  );
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '-';
  const date = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return '방금 전';
  if (minutes < 60) return `${minutes}분 전`;
  if (hours < 24) return `${hours}시간 전`;
  if (days < 7) return `${days}일 전`;

  return date.toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

interface WorkerListProps {
  onEdit: (worker: Worker) => void;
}

export const WorkerList: FC<WorkerListProps> = ({ onEdit }) => {
  const { data, isLoading, error } = useWorkersQuery();
  const updateMutation = useUpdateWorkerMutation();
  const deleteMutation = useDeleteWorkerMutation();

  const handleToggleActive = async (worker: Worker) => {
    try {
      await updateMutation.mutateAsync({
        id: worker.id,
        isActive: !worker.is_active,
      });
    } catch (err) {
      log.error('Failed to toggle worker status:', err);
    }
  };

  const handleDelete = async (worker: Worker) => {
    if (!confirm(`"${worker.name}" 작업자를 삭제하시겠습니까?`)) return;

    try {
      await deleteMutation.mutateAsync(worker.id);
    } catch (err) {
      log.error('Failed to delete worker:', err);
    }
  };

  if (isLoading) {
    return (
      <div className={`rounded-xl border ${BORDER_COLOR.default} ${BG_COLOR.card} p-5`}>
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className={`h-16 rounded-lg ${BG_COLOR.light} animate-pulse`} />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`rounded-xl border ${BORDER_COLOR.default} ${BG_COLOR.card} p-8`}>
        <div className="text-center text-red-500">
          <p>작업자 목록을 불러오지 못했습니다.</p>
          <p className="text-sm mt-1">{error.message}</p>
        </div>
      </div>
    );
  }

  const workers = data?.workers || [];

  if (workers.length === 0) {
    return (
      <div className={`rounded-xl border ${BORDER_COLOR.default} ${BG_COLOR.card} p-12`}>
        <div className="text-center">
          <Users className={`w-12 h-12 mx-auto mb-4 ${TEXT_COLOR.muted}`} />
          <p className={`${TEXT_COLOR.secondary} mb-1`}>등록된 작업자가 없습니다</p>
          <p className={`text-sm ${TEXT_COLOR.muted}`}>
            상단의 &quot;작업자 추가&quot; 버튼으로 새 작업자를 등록하세요.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={`rounded-xl border ${BORDER_COLOR.default} ${BG_COLOR.card} overflow-hidden`}>
      {/* 모바일 카드 뷰 */}
      <div className={`block sm:hidden divide-y ${DIVIDE_COLOR.light}`}>
        {workers.map((worker) => {
          const roleInfo = getRoleInfo(worker.role);
          return (
            <div key={worker.id} className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={`font-medium ${TEXT_COLOR.primary}`}>{worker.name}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${roleInfo.badge}`}>
                    {roleInfo.label}
                  </span>
                </div>
                <button
                  onClick={() => handleToggleActive(worker)}
                  disabled={updateMutation.isPending}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    worker.is_active ? 'bg-green-500' : '${BG_COLOR.strong}'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      worker.is_active ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
              {worker.allowed_ips.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {worker.allowed_ips.map((ip) => (
                    <span
                      key={ip}
                      className={`text-xs font-mono px-1.5 py-0.5 rounded ${BG_COLOR.light} ${TEXT_COLOR.secondary}`}
                    >
                      {ip}
                    </span>
                  ))}
                </div>
              )}
              <div className="flex items-center justify-between text-sm">
                <span className={TEXT_COLOR.muted}>
                  마지막 로그인: {formatDate(worker.last_login_at)}
                </span>
                <div className="flex gap-1">
                  <button
                    onClick={() => onEdit(worker)}
                    className={`p-2 ${TEXT_COLOR.info} ${BG_COLOR.hoverBlue} rounded-lg transition`}
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(worker)}
                    disabled={deleteMutation.isPending}
                    className={`p-2 ${TEXT_COLOR.error} ${BG_COLOR.hoverError} rounded-lg transition`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* 데스크톱 테이블 뷰 */}
      <table className="hidden sm:table w-full">
        <thead>
          <tr className={`border-b ${BORDER_COLOR.default} ${BG_COLOR.grayDark}`}>
            <th
              className={`text-left px-4 py-3 text-xs font-medium ${TEXT_COLOR.muted} uppercase tracking-wider`}
            >
              이름
            </th>
            <th
              className={`text-left px-4 py-3 text-xs font-medium ${TEXT_COLOR.muted} uppercase tracking-wider`}
            >
              역할
            </th>
            <th
              className={`text-center px-4 py-3 text-xs font-medium ${TEXT_COLOR.muted} uppercase tracking-wider`}
            >
              상태
            </th>
            <th
              className={`text-left px-4 py-3 text-xs font-medium ${TEXT_COLOR.muted} uppercase tracking-wider`}
            >
              허용 IP
            </th>
            <th
              className={`text-left px-4 py-3 text-xs font-medium ${TEXT_COLOR.muted} uppercase tracking-wider`}
            >
              마지막 로그인
            </th>
            <th
              className={`text-right px-4 py-3 text-xs font-medium ${TEXT_COLOR.muted} uppercase tracking-wider`}
            >
              액션
            </th>
          </tr>
        </thead>
        <tbody className={`divide-y ${DIVIDE_COLOR.light}`}>
          {workers.map((worker) => {
            const roleInfo = getRoleInfo(worker.role);
            return (
              <tr key={worker.id} className={`${BG_COLOR.hoverGrayDeep} transition`}>
                <td className="px-4 py-3">
                  <span className={`font-medium ${TEXT_COLOR.primary}`}>{worker.name}</span>
                </td>
                <td className="px-4 py-3">
                  <span className={`text-xs px-2 py-1 rounded-full ${roleInfo.badge}`}>
                    {roleInfo.label}
                  </span>
                </td>
                <td className="px-4 py-3 text-center">
                  <button
                    onClick={() => handleToggleActive(worker)}
                    disabled={updateMutation.isPending}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      worker.is_active ? 'bg-green-500' : '${BG_COLOR.strong}'
                    }`}
                    title={
                      worker.is_active ? '활성 (클릭하여 비활성화)' : '비활성 (클릭하여 활성화)'
                    }
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        worker.is_active ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </td>
                <td className="px-4 py-3">
                  {worker.allowed_ips.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {worker.allowed_ips.map((ip) => (
                        <span
                          key={ip}
                          className={`text-xs font-mono px-1.5 py-0.5 rounded ${BG_COLOR.light} ${TEXT_COLOR.secondary}`}
                        >
                          {ip}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span className={`text-xs ${TEXT_COLOR.muted}`}>제한 없음</span>
                  )}
                </td>
                <td className={`px-4 py-3 text-sm ${TEXT_COLOR.muted}`}>
                  {formatDate(worker.last_login_at)}
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <button
                      onClick={() => onEdit(worker)}
                      className={`p-2 ${TEXT_COLOR.info} ${BG_COLOR.hoverBlue} rounded-lg transition`}
                      title="수정"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(worker)}
                      disabled={deleteMutation.isPending}
                      className={`p-2 ${TEXT_COLOR.error} ${BG_COLOR.hoverError} rounded-lg transition`}
                      title="삭제"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Footer */}
      <div className={`px-4 py-3 border-t ${BORDER_COLOR.default} ${BG_COLOR.grayDark}`}>
        <p className={`text-sm ${TEXT_COLOR.muted}`}>
          총 {workers.length}명의 작업자 (활성: {workers.filter((w) => w.is_active).length}명)
        </p>
      </div>
    </div>
  );
};
