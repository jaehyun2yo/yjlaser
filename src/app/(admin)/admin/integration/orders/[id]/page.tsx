'use client';

import { useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  ChevronDown,
  CheckCircle,
  Clock,
  AlertCircle,
  Package,
  Building2,
  CalendarDays,
  FileText,
  ListTodo,
} from 'lucide-react';
import { TEXT_COLOR, BG_COLOR, BORDER_COLOR, BADGE } from '@/lib/styles';
import { Button } from '@/components/ui/button';
import {
  useIntegrationOrder,
  useOrderEvents,
  useUpdateOrderStatusMutation,
} from '@/app/(admin)/admin/integration/_lib/hooks';
import { IntegrationNav } from '@/app/(admin)/admin/integration/_components';
import { EventTimeline } from '@/app/(admin)/admin/integration/_components';

const STATUS_OPTIONS = [
  { value: '접수', label: '접수' },
  { value: '도면작업', label: '도면작업' },
  { value: '샘플제작', label: '샘플제작' },
  { value: '레이저가공', label: '레이저가공' },
  { value: '검수', label: '검수' },
  { value: '완료', label: '완료' },
  { value: '납품', label: '납품' },
  { value: '취소', label: '취소' },
];

const statusGroupBadge: Record<string, string> = {
  접수: BADGE.info,
  작업중: BADGE.warning,
  완료: BADGE.success,
  납품: `inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${BG_COLOR.purpleLight} ${TEXT_COLOR.purpleDark}`,
};

const priorityBadge: Record<string, string> = {
  urgent: BADGE.error,
  normal: BADGE.info,
  low: BADGE.gray,
};

const priorityLabel: Record<string, string> = {
  urgent: '긴급',
  normal: '보통',
  low: '낮음',
};

function formatDate(dateStr?: string): string {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDateShort(dateStr?: string): string {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export default function OrderDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const [statusDropdownOpen, setStatusDropdownOpen] = useState(false);

  const { data: order, isLoading: orderLoading } = useIntegrationOrder(id);
  const { data: events = [], isLoading: eventsLoading } = useOrderEvents(id);
  const updateStatusMutation = useUpdateOrderStatusMutation();

  const handleStatusChange = useCallback(
    async (newStatus: string) => {
      await updateStatusMutation.mutateAsync({ id, status: newStatus });
      setStatusDropdownOpen(false);
    },
    [id, updateStatusMutation]
  );

  if (orderLoading) {
    return (
      <div className="space-y-6">
        <IntegrationNav />
        <div className="animate-pulse space-y-4">
          <div className={`h-8 w-48 ${BG_COLOR.light} rounded`} />
          <div className={`h-64 ${BG_COLOR.light} rounded-xl`} />
        </div>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="space-y-6">
        <IntegrationNav />
        <div className={`flex flex-col items-center justify-center py-20 ${TEXT_COLOR.muted}`}>
          <AlertCircle className="w-12 h-12 mb-4 opacity-40" />
          <p className="text-lg font-medium">주문을 찾을 수 없습니다</p>
          <Link
            href="/admin/integration/orders"
            className="mt-4 text-[#ED6C00] hover:text-[#d15f00]"
          >
            목록으로 돌아가기
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <IntegrationNav />

      {/* 뒤로가기 + 헤더 */}
      <div>
        <button
          onClick={() => router.back()}
          className={`flex items-center gap-1.5 text-sm mb-4 ${TEXT_COLOR.secondary} hover:text-[#ED6C00] transition-colors`}
        >
          <ArrowLeft className="w-4 h-4" />
          주문 목록
        </button>

        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 flex-wrap mb-1">
              <span className={`font-mono text-sm ${TEXT_COLOR.muted}`}>#{order.orderNumber}</span>
              <span className={statusGroupBadge[order.statusGroup] ?? BADGE.gray}>
                {order.statusGroup}
              </span>
              <span className={priorityBadge[order.priority] ?? BADGE.gray}>
                {priorityLabel[order.priority] ?? order.priority}
              </span>
            </div>
            <h1 className={`text-2xl font-bold ${TEXT_COLOR.primary}`}>{order.title}</h1>
          </div>

          {/* 상태 변경 드롭다운 */}
          <div className="relative">
            <Button
              variant="ghost"
              onClick={() => setStatusDropdownOpen((v) => !v)}
              className="flex items-center gap-2"
            >
              <Clock className="w-4 h-4" />
              상태 변경
              <ChevronDown className="w-4 h-4" />
            </Button>

            {statusDropdownOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setStatusDropdownOpen(false)} />
                <div
                  className={`absolute right-0 mt-1 w-44 ${BG_COLOR.card} rounded-lg shadow-lg border ${BORDER_COLOR.default} z-20 overflow-hidden`}
                >
                  {STATUS_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => handleStatusChange(opt.value)}
                      disabled={updateStatusMutation.isPending}
                      className={`w-full text-left px-4 py-2.5 text-sm transition-colors ${
                        order.status === opt.value
                          ? 'bg-[#ED6C00] text-white'
                          : `${TEXT_COLOR.primary} ${BG_COLOR.hoverGrayDark}`
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* 메인 그리드 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 왼쪽: 주문 정보 */}
        <div className="lg:col-span-2 space-y-5">
          {/* 기본 정보 */}
          <div className={`${BG_COLOR.card} rounded-xl border ${BORDER_COLOR.default} p-5`}>
            <h2 className={`text-base font-semibold mb-4 ${TEXT_COLOR.primary}`}>주문 정보</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="flex items-start gap-3">
                <Building2 className={`w-4 h-4 mt-0.5 ${TEXT_COLOR.muted}`} />
                <div>
                  <p className={`text-xs ${TEXT_COLOR.muted} mb-0.5`}>업체명</p>
                  <p className={`text-sm font-medium ${TEXT_COLOR.primary}`}>{order.companyName}</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <CalendarDays className={`w-4 h-4 mt-0.5 ${TEXT_COLOR.muted}`} />
                <div>
                  <p className={`text-xs ${TEXT_COLOR.muted} mb-0.5`}>납기일</p>
                  <p className={`text-sm font-medium ${TEXT_COLOR.primary}`}>
                    {formatDateShort(order.dueDate)}
                  </p>
                </div>
              </div>

              {order.assignedTo && (
                <div className="flex items-start gap-3">
                  <Package className={`w-4 h-4 mt-0.5 ${TEXT_COLOR.muted}`} />
                  <div>
                    <p className={`text-xs ${TEXT_COLOR.muted} mb-0.5`}>담당자</p>
                    <p className={`text-sm font-medium ${TEXT_COLOR.primary}`}>
                      {order.assignedTo}
                    </p>
                  </div>
                </div>
              )}

              <div className="flex items-start gap-3">
                <Clock className={`w-4 h-4 mt-0.5 ${TEXT_COLOR.muted}`} />
                <div>
                  <p className={`text-xs ${TEXT_COLOR.muted} mb-0.5`}>등록일</p>
                  <p className={`text-sm font-medium ${TEXT_COLOR.primary}`}>
                    {formatDate(order.createdAt)}
                  </p>
                </div>
              </div>
            </div>

            {order.description && (
              <div className={`mt-4 pt-4 border-t ${BORDER_COLOR.light}`}>
                <div className="flex items-start gap-3">
                  <FileText className={`w-4 h-4 mt-0.5 ${TEXT_COLOR.muted}`} />
                  <div>
                    <p className={`text-xs ${TEXT_COLOR.muted} mb-1`}>설명</p>
                    <p className={`text-sm ${TEXT_COLOR.secondary} whitespace-pre-wrap`}>
                      {order.description}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {order.notes && (
              <div className={`mt-4 pt-4 border-t ${BORDER_COLOR.light}`}>
                <div className="flex items-start gap-3">
                  <ListTodo className={`w-4 h-4 mt-0.5 ${TEXT_COLOR.muted}`} />
                  <div>
                    <p className={`text-xs ${TEXT_COLOR.muted} mb-1`}>메모</p>
                    <p className={`text-sm ${TEXT_COLOR.secondary} whitespace-pre-wrap`}>
                      {order.notes}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* 현재 상태 */}
          <div className={`${BG_COLOR.card} rounded-xl border ${BORDER_COLOR.default} p-5`}>
            <h2 className={`text-base font-semibold mb-4 ${TEXT_COLOR.primary}`}>현재 상태</h2>
            <div className="flex flex-wrap gap-3">
              {STATUS_OPTIONS.map((opt) => {
                const isActive = order.status === opt.value;
                return (
                  <div
                    key={opt.value}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-colors ${
                      isActive
                        ? 'bg-[#ED6C00] text-white font-semibold'
                        : `${BG_COLOR.light} ${TEXT_COLOR.secondary}`
                    }`}
                  >
                    {isActive && <CheckCircle className="w-4 h-4" />}
                    {opt.label}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* 오른쪽: 이벤트 타임라인 */}
        <div className={`${BG_COLOR.card} rounded-xl border ${BORDER_COLOR.default} p-5`}>
          <h2 className={`text-base font-semibold mb-4 ${TEXT_COLOR.primary}`}>이벤트 내역</h2>
          {eventsLoading ? (
            <div className="space-y-4">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="flex gap-3">
                  <div
                    className={`w-7 h-7 rounded-full ${BG_COLOR.light} animate-pulse flex-shrink-0`}
                  />
                  <div className="flex-1 space-y-1">
                    <div className={`h-4 ${BG_COLOR.light} rounded animate-pulse`} />
                    <div className={`h-3 w-20 ${BG_COLOR.light} rounded animate-pulse`} />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EventTimeline
              events={events.map((ev) => ({
                id: ev.id,
                type: ev.type,
                source: ev.source,
                description: ev.description,
                metadata: ev.metadata,
                createdAt: ev.createdAt,
              }))}
            />
          )}
        </div>
      </div>
    </div>
  );
}
