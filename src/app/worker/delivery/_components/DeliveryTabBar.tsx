'use client';

export type DeliveryTab = 'pending' | 'completed';

interface DeliveryTabBarProps {
  activeTab: DeliveryTab;
  onTabChange: (tab: DeliveryTab) => void;
  counts: { pending: number; completed: number };
}

const TAB_CONFIG: Array<{ key: DeliveryTab; label: string }> = [
  { key: 'pending', label: '대기' },
  { key: 'completed', label: '완료' },
];

export default function DeliveryTabBar({ activeTab, onTabChange, counts }: DeliveryTabBarProps) {
  return (
    <div className="flex border-b border-gray-200 bg-white">
      {TAB_CONFIG.map(({ key, label }) => {
        const isActive = activeTab === key;
        const count = counts[key];

        return (
          <button
            key={key}
            type="button"
            onClick={() => onTabChange(key)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-3 text-sm font-semibold transition-colors min-h-[44px] ${
              isActive
                ? 'text-[#ED6C00] border-b-2 border-[#ED6C00]'
                : 'text-gray-400 hover:text-gray-600'
            }`}
            aria-selected={isActive}
            role="tab"
          >
            {label}
            {count > 0 && (
              <span
                className={`inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 text-xs font-bold rounded-full ${
                  isActive ? 'bg-[#ED6C00] text-white' : 'bg-gray-200 text-gray-500'
                }`}
              >
                {count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
