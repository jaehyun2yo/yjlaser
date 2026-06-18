'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { RefreshCw, ArrowLeft, Package } from 'lucide-react';
import Link from 'next/link';
import { useErpMobileStore } from '@/app/worker/_lib/store';
import {
  useDeliveryContacts,
  useDeliverySocket,
  useDeliveryAddresses,
  usePendingDeliveryContacts,
} from '@/app/worker/delivery/_lib/hooks';
import { queryKeys } from '@/lib/react-query/queryKeys';
import DeliveryTabBar from '@/app/worker/delivery/_components/DeliveryTabBar';
import type { DeliveryTab } from '@/app/worker/delivery/_components/DeliveryTabBar';
import DeliveryContactCard from '@/app/worker/delivery/_components/DeliveryContactCard';
import DeliveryActionBar from '@/app/worker/delivery/_components/DeliveryActionBar';
import DeliveryPhotoCapture from '@/app/worker/delivery/_components/DeliveryPhotoCapture';
import DeliveryKakaoMap from '@/app/worker/delivery/_components/DeliveryKakaoMap';
import CompletedTab from '@/app/worker/delivery/_components/CompletedTab';

function isValidTab(value: string | null): value is DeliveryTab {
  return value === 'pending' || value === 'completed';
}

const DELIVERY_HIGHLIGHT_DURATION_MS = 4500;

export default function WorkerDeliveryPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const { workerSession, _hydrated } = useErpMobileStore();

  // Tab state derived from URL (single source of truth)
  const tabParam = searchParams.get('tab');
  const activeTab: DeliveryTab = isValidTab(tabParam) ? tabParam : 'pending';
  const highlightContactId = searchParams.get('highlight');
  const completedSearchQuery = searchParams.get('search') ?? '';

  // State
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showPhotoCapture, setShowPhotoCapture] = useState(false);
  const [showMap, setShowMap] = useState(true);
  const [highlightedContactId, setHighlightedContactId] = useState<string | null>(
    highlightContactId
  );

  // Data
  const { deliveryContacts, isLoading, isFetched: deliveryFetched } = useDeliveryContacts();
  const { pendingContacts } = usePendingDeliveryContacts();

  // Realtime
  useDeliverySocket();

  // Auth check
  useEffect(() => {
    if (_hydrated && !workerSession) {
      router.push('/worker/login');
    }
  }, [_hydrated, workerSession, router]);

  // Tab change handler — reset selection and update URL
  const handleTabChange = useCallback(
    (tab: DeliveryTab) => {
      setSelectedIds(new Set());
      const params = new URLSearchParams(searchParams.toString());
      params.set('tab', tab);
      params.delete('highlight');
      router.replace(`/worker/delivery?${params.toString()}`);
    },
    [router, searchParams]
  );

  // Handlers
  const handleToggleSelect = useCallback((contactId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(contactId)) {
        next.delete(contactId);
      } else {
        next.add(contactId);
      }
      return next;
    });
  }, []);

  const handleAction = useCallback(() => {
    if (selectedIds.size === 0) return;
    setShowPhotoCapture(true);
  }, [selectedIds.size]);

  const handleDeliveryComplete = useCallback(() => {
    setShowPhotoCapture(false);
    setSelectedIds(new Set());
    // Navigate to completed tab after delivery
    handleTabChange('completed');
  }, [handleTabChange]);

  const handleRefresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: queryKeys.processBoard.all });
  }, [queryClient]);

  const handleToggleMap = useCallback(() => {
    setShowMap((prev) => !prev);
  }, []);

  // Addresses for map
  const deliveryAddresses = useDeliveryAddresses(pendingContacts);

  // Tab counts
  const counts = useMemo(
    () => ({
      pending: pendingContacts.length,
      completed: 0, // managed by WorkerDeliveredList internally
    }),
    [pendingContacts.length]
  );

  useEffect(() => {
    setHighlightedContactId(highlightContactId);
  }, [highlightContactId]);

  useEffect(() => {
    if (!highlightedContactId || activeTab !== 'pending' || isLoading) return undefined;

    const scrollTimeout = window.setTimeout(() => {
      const target = document.getElementById(`delivery-contact-${highlightedContactId}`);
      target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 80);
    const highlightClearTimeout = window.setTimeout(() => {
      setHighlightedContactId((current) => (current === highlightedContactId ? null : current));
    }, DELIVERY_HIGHLIGHT_DURATION_MS);

    return () => {
      window.clearTimeout(scrollTimeout);
      window.clearTimeout(highlightClearTimeout);
    };
  }, [activeTab, highlightedContactId, isLoading, pendingContacts.length]);

  // Loading / auth gate — 초기 데이터 로드 완료 전까지 스피너 표시
  if (!_hydrated || !workerSession || !deliveryFetched) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand" />
      </div>
    );
  }

  const totalCount = deliveryContacts.length;
  const selectedContactIds = Array.from(selectedIds).map(String);

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Link
                href="/worker/dashboard"
                className="p-2 -ml-2 text-gray-500 hover:text-gray-700 rounded-lg transition-colors"
              >
                <ArrowLeft className="w-5 h-5" />
              </Link>
              <div>
                <h1 className="text-xl font-bold text-gray-900">납품 관리</h1>
                <p className="text-xs text-gray-500">총 {totalCount}건</p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleRefresh}
              className="p-2 text-gray-500 hover:text-brand hover:bg-brand-light rounded-lg transition-colors"
              aria-label="새로고침"
            >
              <RefreshCw className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Tab Bar */}
        <DeliveryTabBar activeTab={activeTab} onTabChange={handleTabChange} counts={counts} />
      </div>

      {/* Tab Content */}
      {activeTab === 'completed' ? (
        <div className="px-4 py-3">
          <CompletedTab
            highlightContactId={highlightContactId}
            initialSearch={completedSearchQuery}
          />
        </div>
      ) : (
        <div className="px-4 py-3">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-brand" />
            </div>
          ) : pendingContacts.length === 0 ? (
            <div className="text-center py-16">
              <Package className="w-12 h-12 mx-auto text-gray-300 mb-3" />
              <p className="text-gray-400 text-sm font-medium">납품 대기 건이 없습니다</p>
              <Link
                href="/worker/dashboard"
                className="inline-block mt-4 text-sm text-brand font-medium hover:underline"
              >
                대시보드로 돌아가기
              </Link>
            </div>
          ) : (
            <>
              {/* Kakao Map */}
              <DeliveryKakaoMap addresses={deliveryAddresses} isVisible={showMap} />

              {/* Contact list */}
              <section className="mb-6">
                <h2 className="text-sm font-bold text-gray-700 mb-2">
                  납품 대기 <span className="text-brand">({pendingContacts.length})</span>
                </h2>
                <div className="space-y-2">
                  {pendingContacts.map((contact) => (
                    <DeliveryContactCard
                      key={contact.id}
                      contact={contact}
                      isSelected={selectedIds.has(contact.id)}
                      isHighlighted={highlightedContactId === contact.id}
                      onToggleSelect={handleToggleSelect}
                    />
                  ))}
                </div>
              </section>
            </>
          )}
        </div>
      )}

      {/* Action bar — hidden for completed tab */}
      <DeliveryActionBar
        selectedCount={selectedIds.size}
        onAction={handleAction}
        onToggleMap={handleToggleMap}
        showMap={showMap}
        isLoading={false}
        activeTab={activeTab}
      />

      {/* Photo capture modal */}
      <DeliveryPhotoCapture
        isOpen={showPhotoCapture}
        onClose={() => setShowPhotoCapture(false)}
        selectedContactIds={selectedContactIds}
        onComplete={handleDeliveryComplete}
      />
    </div>
  );
}
