'use client';

import { Truck, MapPin } from 'lucide-react';
import type { DeliveryTab } from '@/app/worker/delivery/_components/DeliveryTabBar';

interface DeliveryActionBarProps {
  selectedCount: number;
  onAction: () => void;
  onToggleMap: () => void;
  showMap: boolean;
  isLoading: boolean;
  activeTab: DeliveryTab;
}

export default function DeliveryActionBar({
  selectedCount,
  onAction,
  onToggleMap,
  showMap,
  isLoading,
  activeTab,
}: DeliveryActionBarProps) {
  if (activeTab === 'completed') {
    return null;
  }

  const buttonColorClass =
    selectedCount > 0 && !isLoading
      ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-md'
      : 'bg-gray-200 text-gray-400 cursor-not-allowed';

  return (
    <div className="fixed bottom-0 left-0 right-0 z-30 bg-white/80 backdrop-blur-md border-t border-gray-200 safe-area-bottom">
      <div className="px-4 py-3 flex items-center gap-3">
        {/* Map toggle */}
        <button
          type="button"
          onClick={onToggleMap}
          className={`shrink-0 w-12 h-12 flex items-center justify-center rounded-xl transition-colors ${
            showMap ? 'bg-[#ED6C00] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
          aria-label={showMap ? '지도 닫기' : '지도 보기'}
        >
          <MapPin className="w-5 h-5" />
        </button>

        {/* Selection count */}
        <div className="flex-1 text-sm font-medium text-gray-700">
          {selectedCount > 0 ? (
            <span>
              <span className="text-[#ED6C00] font-bold">{selectedCount}건</span> 선택됨
            </span>
          ) : (
            <span className="text-gray-400">납품할 건을 선택하세요</span>
          )}
        </div>

        {/* Action button */}
        <button
          type="button"
          onClick={onAction}
          disabled={selectedCount === 0 || isLoading}
          className={`shrink-0 flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-bold transition-colors ${buttonColorClass}`}
        >
          {isLoading ? (
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
          ) : (
            <Truck className="w-4 h-4" />
          )}
          납품 완료
        </button>
      </div>
    </div>
  );
}
