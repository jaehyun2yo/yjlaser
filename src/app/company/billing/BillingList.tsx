'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FaFileInvoice, FaCalendarAlt, FaCheckCircle, FaSpinner } from 'react-icons/fa';
import {
  COMPANY_THEME,
  TEXT_COLOR,
  BG_COLOR,
  BORDER_COLOR,
  BADGE,
  BUTTON_STYLES,
} from '@/lib/styles';
import { Button } from '@/components/ui/button';
import { queryKeys } from '@/lib/react-query/queryKeys';

interface Contact {
  id: number;
  company_name: string;
  inquiry_number: string | null;
  inquiry_title: string | null;
  created_at: string;
  completed_at?: string | null;
}

interface Invoice {
  id: string;
  company_id: string;
  billing_year: number;
  billing_month: number;
  total_amount: number;
  status: string;
  due_date: string | null;
  paid_at: string | null;
  payment_method: string | null;
  notes: string | null;
  created_at: string;
  companies?: {
    id: string;
    company_name: string;
  };
}

interface InvoiceResponse {
  invoices: Invoice[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

interface BillingListProps {
  contacts: Contact[];
}

function getStatusBadge(status: string) {
  switch (status) {
    case 'paid':
      return { label: '결제완료', badge: BADGE.success };
    case 'pending':
      return { label: '미결제', badge: BADGE.warning };
    case 'overdue':
      return { label: '연체', badge: BADGE.error };
    case 'cancelled':
      return { label: '취소', badge: BADGE.gray };
    default:
      return { label: status, badge: BADGE.gray };
  }
}

function formatAmount(amount: number): string {
  return new Intl.NumberFormat('ko-KR', { style: 'currency', currency: 'KRW' }).format(amount);
}

export function BillingList({ contacts }: BillingListProps) {
  const [invoicePage, setInvoicePage] = useState(1);

  // 청구서 목록 조회
  const { data: invoiceData, isLoading: invoicesLoading } = useQuery<InvoiceResponse>({
    queryKey: queryKeys.billing.invoices.list({ page: invoicePage }),
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set('page', invoicePage.toString());
      params.set('limit', '10');
      const response = await fetch(`/api/billing/invoices?${params}`);
      if (!response.ok) throw new Error('청구서 조회 실패');
      return response.json();
    },
  });

  const invoices = invoiceData?.invoices || [];
  const pagination = invoiceData?.pagination;

  return (
    <div className="space-y-6">
      {/* 청구서 목록 섹션 */}
      <div className={COMPANY_THEME.card}>
        <div className={COMPANY_THEME.cardPadding}>
          <div className="mb-6">
            <h2 className={`text-lg font-semibold ${TEXT_COLOR.primary} mb-2`}>
              <FaFileInvoice className="inline-block mr-2 text-[#ED6C00]" />
              발행된 청구서
            </h2>
            <p className={`text-sm ${TEXT_COLOR.secondary}`}>관리자가 발행한 청구서 목록입니다.</p>
          </div>

          {invoicesLoading ? (
            <div className="flex items-center justify-center py-12">
              <FaSpinner className={`animate-spin text-xl ${TEXT_COLOR.muted} mr-2`} />
              <span className={TEXT_COLOR.muted}>청구서를 불러오는 중...</span>
            </div>
          ) : invoices.length === 0 ? (
            <div className="text-center py-12">
              <div
                className={`mx-auto w-16 h-16 rounded-full ${BG_COLOR.muted} flex items-center justify-center mb-4`}
              >
                <FaFileInvoice className={`text-2xl ${TEXT_COLOR.muted}`} />
              </div>
              <p className={TEXT_COLOR.tertiary}>발행된 청구서가 없습니다</p>
            </div>
          ) : (
            <>
              <div className="space-y-3">
                {invoices.map((invoice) => {
                  const statusInfo = getStatusBadge(invoice.status);
                  return (
                    <div
                      key={invoice.id}
                      className={`p-4 border ${BORDER_COLOR.default} rounded-xl ${BG_COLOR.gray} ${BG_COLOR.hoverLight} transition-all duration-200`}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2 mb-2">
                            <h3 className={`text-base font-semibold ${TEXT_COLOR.primary}`}>
                              {invoice.billing_year}년 {invoice.billing_month}월 청구서
                            </h3>
                            <span className={statusInfo.badge}>{statusInfo.label}</span>
                          </div>
                          <div className={`flex flex-wrap gap-4 text-sm ${TEXT_COLOR.tertiary}`}>
                            <span>
                              금액:{' '}
                              <span className={`font-semibold ${TEXT_COLOR.primary}`}>
                                {formatAmount(invoice.total_amount)}
                              </span>
                            </span>
                            {invoice.due_date && (
                              <span>
                                납부기한: {new Date(invoice.due_date).toLocaleDateString('ko-KR')}
                              </span>
                            )}
                            {invoice.paid_at && (
                              <span>
                                결제일: {new Date(invoice.paid_at).toLocaleDateString('ko-KR')}
                              </span>
                            )}
                          </div>
                        </div>
                        {invoice.payment_method && (
                          <span className={`text-xs ${TEXT_COLOR.tertiary}`}>
                            {invoice.payment_method}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* 페이지네이션 */}
              {pagination && pagination.totalPages > 1 && (
                <div className="flex items-center justify-center gap-2 mt-4">
                  <button
                    onClick={() => setInvoicePage((p) => Math.max(1, p - 1))}
                    disabled={invoicePage === 1}
                    className={`${BUTTON_STYLES.ghost} !py-1.5 !px-3 !text-xs disabled:opacity-50 disabled:cursor-not-allowed`}
                  >
                    이전
                  </button>
                  <span className={`text-sm ${TEXT_COLOR.tertiary}`}>
                    {invoicePage} / {pagination.totalPages}
                  </span>
                  <button
                    onClick={() => setInvoicePage((p) => Math.min(pagination.totalPages, p + 1))}
                    disabled={invoicePage === pagination.totalPages}
                    className={`${BUTTON_STYLES.ghost} !py-1.5 !px-3 !text-xs disabled:opacity-50 disabled:cursor-not-allowed`}
                  >
                    다음
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* 완료된 주문 목록 */}
      {contacts.length > 0 && (
        <div className={COMPANY_THEME.card}>
          <div className={COMPANY_THEME.cardPadding}>
            <div className="mb-6">
              <h2 className={`text-lg font-semibold ${TEXT_COLOR.primary} mb-2`}>완료된 주문</h2>
              <p className={`text-sm ${TEXT_COLOR.tertiary}`}>
                총 <span className={TEXT_COLOR.accent}>{contacts.length}</span>개의 완료된 주문
              </p>
            </div>

            <div className="space-y-4">
              {contacts.map((contact) => (
                <div
                  key={contact.id}
                  className={`p-5 border ${BORDER_COLOR.default} rounded-xl ${BG_COLOR.gray} ${BG_COLOR.hoverLight} transition-all duration-200`}
                >
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-3">
                        <h3 className={`text-base font-semibold ${TEXT_COLOR.primary}`}>
                          {contact.inquiry_title || contact.company_name || `문의 #${contact.id}`}
                        </h3>
                        <span className={BADGE.success}>
                          <FaCheckCircle className="text-[10px]" />
                          완료
                        </span>
                      </div>
                      <div className={`flex flex-wrap gap-4 text-sm ${TEXT_COLOR.tertiary}`}>
                        <div className="flex items-center gap-2">
                          <FaCalendarAlt className="text-xs" />
                          <span>
                            주문일: {new Date(contact.created_at).toLocaleDateString('ko-KR')}
                          </span>
                        </div>
                        {contact.completed_at && (
                          <div className="flex items-center gap-2">
                            <FaCalendarAlt className="text-xs" />
                            <span>
                              완료일: {new Date(contact.completed_at).toLocaleDateString('ko-KR')}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
