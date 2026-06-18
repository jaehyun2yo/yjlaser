'use client';

import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/useToast';
import { queryKeys } from '@/lib/react-query/queryKeys';
import { TEXT_COLOR, BG_COLOR, BORDER_COLOR, DIVIDE_COLOR } from '@/lib/styles';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { logger } from '@/lib/utils/logger';

const clientLogger = logger.createLogger('BACKUP_SETTINGS');

// ==================== 타입 ====================

interface BackupSettings {
  enabled: boolean;
  retentionDays: number;
  nasPath: string;
  deleteAfterBackup: boolean;
}

interface EligibleInfo {
  fileCount: number;
  totalSize: number;
}

interface BackupHistoryItem {
  id: string;
  fileName: string;
  originalName: string;
  fileSize: string;
  companyId: number;
  status: 'success' | 'failed' | 'pending';
  error: string | null;
  createdAt: string;
}

interface BackupStartResult {
  status: 'started' | 'skipped' | 'already_running';
  total?: number;
  reason?: string;
}

interface BackupStatusInfo {
  isRunning: boolean;
  total: number;
  success: number;
  failed: number;
}

interface BrowseDirectoriesResponse {
  path: string;
  parent: string | null;
  directories: string[];
  error?: string;
}

interface BackupHistoryResponse {
  items: BackupHistoryItem[];
  total: number;
  page: number;
  totalPages: number;
}

// ==================== 유틸리티 ====================

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

async function backupFetch<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`/api/admin/backup/${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || `API 오류: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

// ==================== 스타일 상수 ====================

const CARD = `rounded-lg border ${BG_COLOR.card} ${BORDER_COLOR.default} shadow-sm`;

// ==================== 상태 뱃지 ====================

function StatusBadge({ status }: { status: BackupHistoryItem['status'] }) {
  const map = {
    success: 'bg-green-100 text-green-700',
    failed: 'bg-red-100 text-red-700',
    pending: 'bg-yellow-100 text-yellow-700',
  } as const;
  const label = { success: '성공', failed: '실패', pending: '대기' } as const;

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${map[status]}`}
    >
      {label[status]}
    </span>
  );
}

// ==================== 토글 ====================

function Toggle({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-[#ED6C00] focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed ${
        checked ? 'bg-brand' : 'bg-muted'
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
          checked ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  );
}

// ==================== 폴더 브라우저 ====================

function FolderBrowser({
  open,
  onClose,
  onSelect,
  initialPath,
}: {
  open: boolean;
  onClose: () => void;
  onSelect: (path: string) => void;
  initialPath: string;
}) {
  const [browsePath, setBrowsePath] = useState(initialPath || '');
  const [directories, setDirectories] = useState<string[]>([]);
  const [parentPath, setParentPath] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [manualInput, setManualInput] = useState('');

  const fetchDirectories = async (dirPath: string) => {
    setLoading(true);
    setError(null);
    try {
      const params = dirPath ? `?path=${encodeURIComponent(dirPath)}` : '';
      const data = await backupFetch<BrowseDirectoriesResponse>(`browse-directories${params}`);
      setBrowsePath(data.path);
      setDirectories(data.directories);
      setParentPath(data.parent);
      if (data.error) setError(data.error);
    } catch (err) {
      setError((err as Error).message);
      setDirectories([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      void fetchDirectories(initialPath || '');
      setManualInput(initialPath || '');
    }
  }, [open, initialPath]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div
        className={`w-full max-w-lg mx-4 rounded-xl shadow-2xl ${BG_COLOR.card} border ${BORDER_COLOR.default}`}
      >
        {/* 헤더 */}
        <div className={`px-5 py-4 border-b ${BORDER_COLOR.default}`}>
          <h3 className={`text-base font-semibold ${TEXT_COLOR.primary}`}>NAS 폴더 선택</h3>
          <p className={`text-xs ${TEXT_COLOR.secondary} mt-1`}>
            백업 파일이 저장될 폴더를 선택하세요.
          </p>
        </div>

        {/* 직접 입력 */}
        <div className={`px-5 pt-4 flex gap-2`}>
          <Input
            type="text"
            value={manualInput}
            onChange={(e) => setManualInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && manualInput.trim()) {
                void fetchDirectories(manualInput.trim());
              }
            }}
            placeholder={String.raw`경로 입력 (예: \\192.168.0.6\home)`}
            className="flex-1 text-sm"
          />
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => manualInput.trim() && void fetchDirectories(manualInput.trim())}
            className="whitespace-nowrap"
          >
            이동
          </Button>
        </div>

        {/* 현재 경로 */}
        <div className={`px-5 pt-3 pb-2`}>
          <div className={`flex items-center gap-2 text-xs ${TEXT_COLOR.secondary}`}>
            <span className="font-medium">현재:</span>
            <span className={`font-mono truncate ${TEXT_COLOR.primary}`}>
              {browsePath || '(드라이브 목록)'}
            </span>
          </div>
        </div>

        {/* 폴더 목록 */}
        <div className={`px-5 pb-3`}>
          <div
            className={`border ${BORDER_COLOR.default} rounded-lg overflow-hidden max-h-64 overflow-y-auto`}
          >
            {loading ? (
              <div className={`px-4 py-8 text-center text-sm ${TEXT_COLOR.secondary}`}>
                불러오는 중...
              </div>
            ) : error ? (
              <div className="px-4 py-8 text-center text-sm text-red-500">{error}</div>
            ) : directories.length === 0 ? (
              <div className={`px-4 py-8 text-center text-sm ${TEXT_COLOR.secondary}`}>
                하위 폴더가 없습니다.
              </div>
            ) : (
              <>
                {parentPath !== null && (
                  <button
                    type="button"
                    onClick={() => {
                      void fetchDirectories(parentPath);
                      setManualInput(parentPath);
                    }}
                    className={`w-full text-left px-4 py-2.5 text-sm ${TEXT_COLOR.secondary} ${BG_COLOR.hoverMuted} transition-colors flex items-center gap-2 border-b ${BORDER_COLOR.default}`}
                  >
                    <span>↑</span>
                    <span>상위 폴더</span>
                  </button>
                )}
                {directories.map((dir) => {
                  const fullPath = browsePath ? `${browsePath}\\${dir}` : dir;
                  return (
                    <button
                      key={dir}
                      type="button"
                      onClick={() => {
                        void fetchDirectories(fullPath);
                        setManualInput(fullPath);
                      }}
                      className={`w-full text-left px-4 py-2.5 text-sm ${TEXT_COLOR.primary} ${BG_COLOR.hoverMuted} transition-colors flex items-center gap-2 border-b last:border-b-0 ${BORDER_COLOR.default}`}
                    >
                      <span className={TEXT_COLOR.secondary}>📁</span>
                      <span className="truncate">{dir}</span>
                    </button>
                  );
                })}
              </>
            )}
          </div>
        </div>

        {/* 하단 버튼 */}
        <div
          className={`px-5 py-4 border-t ${BORDER_COLOR.default} flex items-center justify-end gap-3`}
        >
          <Button type="button" variant="secondary" onClick={onClose}>
            취소
          </Button>
          <Button
            type="button"
            disabled={!browsePath}
            onClick={() => {
              onSelect(browsePath);
              onClose();
            }}
          >
            이 폴더 선택
          </Button>
        </div>
      </div>
    </div>
  );
}

// ==================== NAS 경로 선택 ====================

function NasPathSelector({ value, onChange }: { value: string; onChange: (path: string) => void }) {
  const [browserOpen, setBrowserOpen] = useState(false);

  return (
    <div>
      <label className={`block text-sm font-medium ${TEXT_COLOR.primary} mb-1`}>
        NAS 백업 경로
      </label>
      <div className="flex gap-2">
        <Input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={String.raw`\\192.168.0.6\home\backup\webhard`}
          className="flex-1"
        />
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => setBrowserOpen(true)}
          className="whitespace-nowrap"
        >
          폴더 선택
        </Button>
      </div>
      <FolderBrowser
        open={browserOpen}
        onClose={() => setBrowserOpen(false)}
        onSelect={onChange}
        initialPath={value}
      />
    </div>
  );
}

// ==================== 설정 카드 ====================

function SettingsCard() {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery<BackupSettings>({
    queryKey: queryKeys.backup.settings(),
    queryFn: () => backupFetch<BackupSettings>('settings'),
  });

  const [form, setForm] = useState<BackupSettings>({
    enabled: false,
    retentionDays: 45,
    nasPath: '',
    deleteAfterBackup: true,
  });

  // 서버 데이터 로드 시 폼 동기화
  const [initialized, setInitialized] = useState(false);
  if (data && !initialized) {
    setForm(data);
    setInitialized(true);
  }

  const saveMutation = useMutation({
    mutationFn: (settings: BackupSettings) =>
      backupFetch<BackupSettings>('settings', {
        method: 'PUT',
        body: JSON.stringify(settings),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.backup.settings() });
      clientLogger.info('백업 설정 저장 완료');
    },
    onError: (err) => {
      clientLogger.error('백업 설정 저장 실패', { error: err });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    saveMutation.mutate(form);
  };

  if (isLoading) {
    return (
      <div className={`${CARD} p-6`}>
        <p className={`text-sm ${TEXT_COLOR.secondary}`}>설정을 불러오는 중...</p>
      </div>
    );
  }

  return (
    <div className={`${CARD} p-6`}>
      <h2 className={`text-lg font-semibold ${TEXT_COLOR.primary} mb-4`}>백업 설정</h2>
      <form onSubmit={handleSubmit} className="space-y-5">
        {/* 자동 백업 활성화 */}
        <div className="flex items-center justify-between">
          <div>
            <p className={`text-sm font-medium ${TEXT_COLOR.primary}`}>자동 백업 활성화</p>
            <p className={`text-xs ${TEXT_COLOR.secondary} mt-0.5`}>
              스케줄에 따라 R2 파일을 NAS로 자동 백업합니다.
            </p>
          </div>
          <Toggle checked={form.enabled} onChange={(v) => setForm((f) => ({ ...f, enabled: v }))} />
        </div>

        {/* 백업 보존 기간 */}
        <div>
          <label className={`block text-sm font-medium ${TEXT_COLOR.primary} mb-1`}>
            백업 보존 기간 (일)
          </label>
          <Input
            type="number"
            min={1}
            max={365}
            value={form.retentionDays}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                retentionDays: Math.min(365, Math.max(1, Number(e.target.value))),
              }))
            }
            className="w-32"
          />
          <p className={`text-xs ${TEXT_COLOR.secondary} mt-1`}>1~365일 범위로 설정하세요.</p>
        </div>

        {/* NAS 백업 경로 */}
        <NasPathSelector
          value={form.nasPath}
          onChange={(v) => setForm((f) => ({ ...f, nasPath: v }))}
        />

        {/* 백업 후 R2 삭제 */}
        <div className="flex items-center justify-between">
          <div>
            <p className={`text-sm font-medium ${TEXT_COLOR.primary}`}>백업 후 R2 파일 삭제</p>
            <p className={`text-xs ${TEXT_COLOR.secondary} mt-0.5`}>
              NAS 백업 성공 후 R2에서 원본 파일을 삭제합니다.
            </p>
          </div>
          <Toggle
            checked={form.deleteAfterBackup}
            onChange={(v) => setForm((f) => ({ ...f, deleteAfterBackup: v }))}
          />
        </div>

        <div className="pt-2">
          <Button type="submit" disabled={saveMutation.isPending}>
            {saveMutation.isPending ? '저장 중...' : '설정 저장'}
          </Button>
          {saveMutation.isSuccess && (
            <span className="ml-3 text-sm text-green-600">저장되었습니다.</span>
          )}
          {saveMutation.isError && (
            <span className="ml-3 text-sm text-red-500">
              저장 실패: {(saveMutation.error as Error).message}
            </span>
          )}
        </div>
      </form>
    </div>
  );
}

// ==================== 백업 현황 카드 ====================

function BackupStatusCard() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [isPolling, setIsPolling] = useState(false);
  const wasPollingRef = useRef(false);

  const { data, isLoading, error } = useQuery<EligibleInfo>({
    queryKey: queryKeys.backup.eligible(),
    queryFn: () => backupFetch<EligibleInfo>('eligible'),
  });

  const statusQuery = useQuery<BackupStatusInfo>({
    queryKey: queryKeys.backup.status(),
    queryFn: () => backupFetch<BackupStatusInfo>('status'),
    refetchInterval: isPolling ? 3000 : false,
  });

  // 폴링 중 완료 감지
  useEffect(() => {
    if (isPolling && statusQuery.data && !statusQuery.data.isRunning) {
      setIsPolling(false);
      wasPollingRef.current = true;
      const { success, failed } = statusQuery.data;
      if (failed === 0) {
        toast.success('백업 완료', `${success}개 파일이 성공적으로 백업되었습니다.`);
      } else if (success === 0) {
        toast.error('백업 실패', `${failed}개 파일 모두 백업에 실패했습니다.`);
      } else {
        toast.warning('백업 완료 (일부 실패)', `성공: ${success}개, 실패: ${failed}개`);
      }
      void queryClient.invalidateQueries({ queryKey: queryKeys.backup.eligible() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.backup.history(1) });
    }
  }, [isPolling, statusQuery.data, queryClient, toast]);

  const executeMutation = useMutation({
    mutationFn: () => backupFetch<BackupStartResult>('execute', { method: 'POST' }),
    onSuccess: (data) => {
      if (data.status === 'skipped') {
        toast.warning('백업 스킵', data.reason ?? '알 수 없는 사유');
      } else if (data.status === 'already_running') {
        toast.warning('백업 진행 중', '이미 백업이 실행 중입니다.');
      } else {
        toast.success('백업 시작', `${data.total ?? 0}개 파일 백업을 시작합니다.`);
        setIsPolling(true);
      }
    },
    onError: (err) => {
      toast.error('백업 실행 실패', (err as Error).message);
    },
  });

  return (
    <div className={`${CARD} p-6`}>
      <h2 className={`text-lg font-semibold ${TEXT_COLOR.primary} mb-4`}>백업 현황</h2>

      {isLoading ? (
        <p className={`text-sm ${TEXT_COLOR.secondary}`}>현황을 불러오는 중...</p>
      ) : error ? (
        <p className="text-sm text-red-500">현황 조회에 실패했습니다.</p>
      ) : data ? (
        <div className="grid grid-cols-2 gap-4 mb-5">
          <div className={`rounded-lg p-4 ${BG_COLOR.grayLighter}`}>
            <p className={`text-xs ${TEXT_COLOR.secondary} mb-1`}>백업 대상 파일</p>
            <p className={`text-2xl font-bold ${TEXT_COLOR.primary}`}>
              {data.fileCount.toLocaleString()}
              <span className={`text-sm font-normal ${TEXT_COLOR.secondary} ml-1`}>개</span>
            </p>
          </div>
          <div className={`rounded-lg p-4 ${BG_COLOR.grayLighter}`}>
            <p className={`text-xs ${TEXT_COLOR.secondary} mb-1`}>총 용량</p>
            <p className={`text-2xl font-bold ${TEXT_COLOR.primary}`}>
              {formatBytes(data.totalSize)}
            </p>
          </div>
        </div>
      ) : null}

      <Button
        type="button"
        onClick={() => executeMutation.mutate()}
        disabled={executeMutation.isPending || isPolling}
        className="flex items-center gap-2"
      >
        {(executeMutation.isPending || isPolling) && (
          <svg
            className="animate-spin h-4 w-4 text-white"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
        )}
        {isPolling
          ? '백업 진행 중...'
          : executeMutation.isPending
            ? '백업 실행 중...'
            : '지금 백업 실행'}
      </Button>

      {isPolling && statusQuery.data?.isRunning && (
        <div className="mt-3 space-y-2">
          <div className={`flex justify-between text-xs ${TEXT_COLOR.secondary}`}>
            <span>백업 진행 중...</span>
            <span>
              {statusQuery.data.success + statusQuery.data.failed} / {statusQuery.data.total}
            </span>
          </div>
          <div className={`w-full h-2 ${BG_COLOR.grayLighter} rounded-full overflow-hidden`}>
            <div
              className="h-full bg-[#ED6C00] rounded-full transition-all duration-300"
              style={{
                width: `${
                  statusQuery.data.total > 0
                    ? ((statusQuery.data.success + statusQuery.data.failed) /
                        statusQuery.data.total) *
                      100
                    : 0
                }%`,
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ==================== 백업 이력 카드 ====================

function BackupHistoryCard() {
  const [page, setPage] = useState(1);
  const limit = 15;

  const { data, isLoading, error } = useQuery<BackupHistoryResponse>({
    queryKey: queryKeys.backup.history(page),
    queryFn: () => backupFetch<BackupHistoryResponse>(`history?page=${page}&limit=${limit}`),
  });

  return (
    <div className={`${CARD} overflow-hidden`}>
      <div className={`px-6 py-4 border-b ${BORDER_COLOR.default}`}>
        <h2 className={`text-lg font-semibold ${TEXT_COLOR.primary}`}>
          백업 이력
          {data && (
            <span className={`text-sm font-normal ${TEXT_COLOR.secondary} ml-2`}>
              (총 {data.total.toLocaleString()}건)
            </span>
          )}
        </h2>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead
            className={`text-xs ${TEXT_COLOR.mediumBright} uppercase ${BG_COLOR.grayLighter} border-b ${BORDER_COLOR.default}`}
          >
            <tr>
              <th className="px-4 py-3 font-medium">파일명</th>
              <th className="px-4 py-3 font-medium">원본명</th>
              <th className="px-4 py-3 font-medium">크기</th>
              <th className="px-4 py-3 font-medium">업체 ID</th>
              <th className="px-4 py-3 font-medium">상태</th>
              <th className="px-4 py-3 font-medium">에러</th>
              <th className="px-4 py-3 font-medium">날짜</th>
            </tr>
          </thead>
          <tbody className={`divide-y ${DIVIDE_COLOR.default}`}>
            {isLoading ? (
              <tr>
                <td colSpan={7} className={`px-4 py-8 text-center ${TEXT_COLOR.secondary}`}>
                  불러오는 중...
                </td>
              </tr>
            ) : error ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-red-500">
                  이력을 불러오는 중 오류가 발생했습니다.
                </td>
              </tr>
            ) : !data || data.items.length === 0 ? (
              <tr>
                <td colSpan={7} className={`px-4 py-8 text-center ${TEXT_COLOR.secondary}`}>
                  백업 이력이 없습니다.
                </td>
              </tr>
            ) : (
              data.items.map((item) => (
                <tr
                  key={item.id}
                  className={`${BG_COLOR.card} ${BG_COLOR.hoverMuted} transition-colors`}
                >
                  <td className={`px-4 py-3 max-w-[180px] truncate ${TEXT_COLOR.primary} text-xs`}>
                    {item.fileName}
                  </td>
                  <td
                    className={`px-4 py-3 max-w-[180px] truncate ${TEXT_COLOR.secondary} text-xs`}
                  >
                    {item.originalName}
                  </td>
                  <td className={`px-4 py-3 whitespace-nowrap ${TEXT_COLOR.secondary} text-xs`}>
                    {formatBytes(Number(item.fileSize))}
                  </td>
                  <td className={`px-4 py-3 whitespace-nowrap ${TEXT_COLOR.secondary} text-xs`}>
                    {item.companyId}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <StatusBadge status={item.status} />
                  </td>
                  <td
                    className={`px-4 py-3 max-w-[200px] truncate ${TEXT_COLOR.secondary} text-xs`}
                    title={item.error ?? undefined}
                  >
                    {item.error ?? '-'}
                  </td>
                  <td className={`px-4 py-3 whitespace-nowrap ${TEXT_COLOR.secondary} text-xs`}>
                    {formatDate(item.createdAt)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* 페이지네이션 */}
      {data && data.totalPages > 1 && (
        <div
          className={`px-6 py-4 border-t ${BORDER_COLOR.default} flex items-center justify-center gap-2`}
        >
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
              page === 1
                ? `${TEXT_COLOR.secondary} cursor-not-allowed opacity-40`
                : `${TEXT_COLOR.secondary} ${BG_COLOR.hoverMuted}`
            }`}
          >
            이전
          </button>
          <span className={`text-sm ${TEXT_COLOR.secondary}`}>
            {page} / {data.totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))}
            disabled={page === data.totalPages}
            className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
              page === data.totalPages
                ? `${TEXT_COLOR.secondary} cursor-not-allowed opacity-40`
                : `${TEXT_COLOR.secondary} ${BG_COLOR.hoverMuted}`
            }`}
          >
            다음
          </button>
        </div>
      )}
    </div>
  );
}

// ==================== 메인 ====================

export default function BackupSettings() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <SettingsCard />
        <BackupStatusCard />
      </div>
      <BackupHistoryCard />
    </div>
  );
}
