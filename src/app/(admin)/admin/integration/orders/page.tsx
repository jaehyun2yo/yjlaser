'use client';

import { useState, useCallback } from 'react';
import Link from 'next/link';
import { Plus, Search, ChevronLeft, ChevronRight, X, AlertCircle } from 'lucide-react';
import { TEXT_COLOR, BG_COLOR, BORDER_COLOR, TABLE, BADGE, MODAL } from '@/lib/styles';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  useIntegrationOrders,
  useCreateOrderMutation,
  useUpdateOrderPriorityMutation,
} from '@/app/(admin)/admin/integration/_lib/hooks';
import { IntegrationNav } from '@/app/(admin)/admin/integration/_components';
import type {
  OrderFilters,
  OrderStatusGroup,
  OrderPriority,
  CreateOrderRequest,
} from '@/app/(admin)/admin/integration/_lib/types';

const STATUS_GROUPS: OrderStatusGroup[] = ['접수', '작업중', '완료', '납품'];
const PRIORITIES: { value: OrderPriority; label: string }[] = [
  { value: 'urgent', label: '긴급' },
  { value: 'normal', label: '보통' },
  { value: 'low', label: '낮음' },
];

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

const statusGroupBadge: Record<string, string> = {
  접수: BADGE.info,
  작업중: BADGE.warning,
  완료: BADGE.success,
  납품: `inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${BG_COLOR.purpleLight} ${TEXT_COLOR.purpleDark}`,
};

function formatDate(dateStr?: string): string {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

// 주문 생성 모달
function CreateOrderModal({ onClose }: { onClose: () => void }) {
  const createMutation = useCreateOrderMutation();
  const [form, setForm] = useState<CreateOrderRequest>({
    companyName: '',
    title: '',
    description: '',
    priority: 'normal',
    dueDate: '',
    notes: '',
  });

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      await createMutation.mutateAsync({
        ...form,
        description: form.description || undefined,
        dueDate: form.dueDate || undefined,
        notes: form.notes || undefined,
      });
      onClose();
    },
    [form, createMutation, onClose]
  );

  return (
    <div className={MODAL.overlay}>
      <div className={`${MODAL.container} max-w-lg`}>
        <div className={MODAL.header}>
          <h2 className={`text-lg font-semibold ${TEXT_COLOR.primary}`}>새 주문 등록</h2>
          <button
            onClick={onClose}
            className={`p-1 rounded ${TEXT_COLOR.secondary} hover:${TEXT_COLOR.primary} transition-colors`}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className={`${MODAL.body} space-y-4`}>
            <div>
              <label className={`block text-sm font-medium mb-1 ${TEXT_COLOR.secondary}`}>
                업체명 *
              </label>
              <Input
                value={form.companyName}
                onChange={(e) => setForm({ ...form, companyName: e.target.value })}
                className="w-full"
                placeholder="업체명 입력"
                required
              />
            </div>

            <div>
              <label className={`block text-sm font-medium mb-1 ${TEXT_COLOR.secondary}`}>
                주문 제목 *
              </label>
              <Input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                className="w-full"
                placeholder="주문 제목 입력"
                required
              />
            </div>

            <div>
              <label className={`block text-sm font-medium mb-1 ${TEXT_COLOR.secondary}`}>
                설명
              </label>
              <textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                rows={3}
                className="w-full border border-border rounded-lg bg-card text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand transition-colors px-4 py-2 text-sm resize-none"
                placeholder="주문 상세 내용"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={`block text-sm font-medium mb-1 ${TEXT_COLOR.secondary}`}>
                  우선순위
                </label>
                <select
                  value={form.priority}
                  onChange={(e) => setForm({ ...form, priority: e.target.value as OrderPriority })}
                  className="w-full border border-border rounded-lg bg-card text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand transition-colors px-4 py-2 text-sm"
                >
                  {PRIORITIES.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className={`block text-sm font-medium mb-1 ${TEXT_COLOR.secondary}`}>
                  납기일
                </label>
                <Input
                  type="date"
                  value={form.dueDate}
                  onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
                  className="w-full"
                />
              </div>
            </div>

            <div>
              <label className={`block text-sm font-medium mb-1 ${TEXT_COLOR.secondary}`}>
                메모
              </label>
              <textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                rows={2}
                className="w-full border border-border rounded-lg bg-card text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand transition-colors px-4 py-2 text-sm resize-none"
                placeholder="추가 메모"
              />
            </div>
          </div>

          <div className={MODAL.footer}>
            <Button type="button" variant="secondary" onClick={onClose}>
              취소
            </Button>
            <Button
              type="submit"
              disabled={createMutation.isPending || !form.companyName || !form.title}
            >
              {createMutation.isPending ? '등록 중...' : '등록'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function IntegrationOrdersPage() {
  const [filters, setFilters] = useState<OrderFilters>({ page: 1, limit: 20 });
  const [searchInput, setSearchInput] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);

  const priorityMutation = useUpdateOrderPriorityMutation();
  const { data: ordersPage, isLoading } = useIntegrationOrders(filters);
  const orders = ordersPage?.data ?? [];
  const total = ordersPage?.total ?? 0;
  const totalPages = ordersPage?.totalPages ?? 1;

  const handleSearch = useCallback(() => {
    setFilters((prev) => ({ ...prev, companyName: searchInput || undefined, page: 1 }));
  }, [searchInput]);

  const handleStatusFilter = useCallback((statusGroup?: OrderStatusGroup) => {
    setFilters((prev) => ({ ...prev, statusGroup, page: 1 }));
  }, []);

  const handlePriorityFilter = useCallback((priority?: OrderPriority) => {
    setFilters((prev) => ({ ...prev, priority, page: 1 }));
  }, []);

  const handlePage = useCallback((page: number) => {
    setFilters((prev) => ({ ...prev, page }));
  }, []);

  return (
    <div className="space-y-6">
      <IntegrationNav />

      {/* 헤더 */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className={`text-2xl font-bold ${TEXT_COLOR.primary}`}>주문 관리</h1>
          <p className={`text-sm mt-1 ${TEXT_COLOR.secondary}`}>전체 {total}건의 주문</p>
        </div>
        <Button onClick={() => setShowCreateModal(true)} className="flex items-center gap-2">
          <Plus className="w-4 h-4" />새 주문
        </Button>
      </div>

      {/* 필터 영역 */}
      <div className={`${BG_COLOR.card} rounded-xl border ${BORDER_COLOR.default} p-4 space-y-3`}>
        {/* 검색 */}
        <div className="flex gap-2">
          <div className="relative flex-1 max-w-xs">
            <Search
              className={`absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 ${TEXT_COLOR.muted}`}
            />
            <Input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              placeholder="업체명으로 검색"
              className="pl-9 w-full"
            />
          </div>
          <Button onClick={handleSearch} size="sm">
            검색
          </Button>
          {(filters.companyName || filters.statusGroup || filters.priority) && (
            <button
              onClick={() => {
                setFilters({ page: 1, limit: 20 });
                setSearchInput('');
              }}
              className={`flex items-center gap-1 px-3 py-2 text-sm ${TEXT_COLOR.secondary} hover:${TEXT_COLOR.primary} transition-colors`}
            >
              <X className="w-4 h-4" />
              초기화
            </button>
          )}
        </div>

        {/* 상태 필터 */}
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => handleStatusFilter(undefined)}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
              !filters.statusGroup
                ? 'bg-[#ED6C00] text-white'
                : `${BG_COLOR.light} ${TEXT_COLOR.secondary} hover:${BG_COLOR.hoverMuted}`
            }`}
          >
            전체
          </button>
          {STATUS_GROUPS.map((group) => (
            <button
              key={group}
              onClick={() => handleStatusFilter(group)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                filters.statusGroup === group
                  ? 'bg-[#ED6C00] text-white'
                  : `${BG_COLOR.light} ${TEXT_COLOR.secondary} hover:${BG_COLOR.hoverMuted}`
              }`}
            >
              {group}
            </button>
          ))}

          <div className={`w-px h-6 self-center ${BG_COLOR.medium} mx-1`} />

          <span className={`text-xs self-center ${TEXT_COLOR.muted}`}>우선순위:</span>
          {PRIORITIES.map((p) => (
            <button
              key={p.value}
              onClick={() =>
                handlePriorityFilter(filters.priority === p.value ? undefined : p.value)
              }
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                filters.priority === p.value
                  ? 'bg-[#ED6C00] text-white'
                  : `${BG_COLOR.light} ${TEXT_COLOR.secondary} hover:${BG_COLOR.hoverMuted}`
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* 주문 테이블 */}
      <div className={`${BG_COLOR.card} rounded-xl border ${BORDER_COLOR.default} overflow-hidden`}>
        {isLoading ? (
          <div className="p-8 flex justify-center">
            <div className="animate-spin w-6 h-6 border-2 border-[#ED6C00] border-t-transparent rounded-full" />
          </div>
        ) : orders.length === 0 ? (
          <div className={`p-12 text-center ${TEXT_COLOR.muted}`}>
            <AlertCircle className="w-10 h-10 mx-auto mb-3 opacity-40" />
            <p>주문이 없습니다</p>
          </div>
        ) : (
          <div className={TABLE.container}>
            <table className={TABLE.table}>
              <thead className={TABLE.thead}>
                <tr>
                  <th className={TABLE.th}>주문번호</th>
                  <th className={TABLE.th}>업체명</th>
                  <th className={TABLE.th}>제목</th>
                  <th className={TABLE.th}>상태</th>
                  <th className={TABLE.th}>우선순위</th>
                  <th className={TABLE.th}>납기일</th>
                  <th className={TABLE.th}>등록일</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => (
                  <tr key={order.id} className={TABLE.trHover}>
                    <td className={TABLE.td}>
                      <Link
                        href={`/admin/integration/orders/${order.id}`}
                        className="font-mono text-[#ED6C00] hover:text-[#d15f00] font-medium"
                      >
                        #{order.orderNumber}
                      </Link>
                    </td>
                    <td className={TABLE.td}>
                      <span className={TEXT_COLOR.primary}>{order.companyName}</span>
                    </td>
                    <td className={TABLE.td}>
                      <Link
                        href={`/admin/integration/orders/${order.id}`}
                        className={`hover:text-[#ED6C00] transition-colors line-clamp-1 ${TEXT_COLOR.primary}`}
                      >
                        {order.title}
                      </Link>
                    </td>
                    <td className={TABLE.td}>
                      <span className={statusGroupBadge[order.statusGroup] ?? BADGE.gray}>
                        {order.statusGroup}
                      </span>
                    </td>
                    <td className={TABLE.td}>
                      <button
                        onClick={() =>
                          priorityMutation.mutate({
                            id: order.id,
                            priority: order.priority === 'urgent' ? 'normal' : 'urgent',
                          })
                        }
                        disabled={priorityMutation.isPending}
                        className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-lg transition-colors cursor-pointer disabled:opacity-50 ${
                          order.priority === 'urgent'
                            ? `${BG_COLOR.errorLight} ${TEXT_COLOR.errorDark} hover:bg-red-200`
                            : `${BG_COLOR.light} ${TEXT_COLOR.secondary} hover:bg-gray-200`
                        }`}
                      >
                        {order.priority === 'urgent' ? '긴급' : '긴급설정'}
                      </button>
                    </td>
                    <td className={TABLE.td}>
                      <span className={TEXT_COLOR.secondary}>{formatDate(order.dueDate)}</span>
                    </td>
                    <td className={TABLE.td}>
                      <span className={TEXT_COLOR.secondary}>{formatDate(order.createdAt)}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* 페이지네이션 */}
        {!isLoading && totalPages > 1 && (
          <div
            className={`flex items-center justify-between px-4 py-3 border-t ${BORDER_COLOR.default}`}
          >
            <p className={`text-sm ${TEXT_COLOR.secondary}`}>
              {total}건 중 {((filters.page ?? 1) - 1) * (filters.limit ?? 20) + 1}~
              {Math.min((filters.page ?? 1) * (filters.limit ?? 20), total)}
            </p>
            <div className="flex items-center gap-1">
              <button
                onClick={() => handlePage((filters.page ?? 1) - 1)}
                disabled={(filters.page ?? 1) <= 1}
                className={`p-1.5 rounded ${TEXT_COLOR.secondary} disabled:opacity-40 hover:${BG_COLOR.hoverMuted} transition-colors`}
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className={`text-sm px-2 ${TEXT_COLOR.secondary}`}>
                {filters.page} / {totalPages}
              </span>
              <button
                onClick={() => handlePage((filters.page ?? 1) + 1)}
                disabled={(filters.page ?? 1) >= totalPages}
                className={`p-1.5 rounded ${TEXT_COLOR.secondary} disabled:opacity-40 hover:${BG_COLOR.hoverMuted} transition-colors`}
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 주문 생성 모달 */}
      {showCreateModal && <CreateOrderModal onClose={() => setShowCreateModal(false)} />}
    </div>
  );
}
