'use client';

import ProcessContactCard from './ProcessContactCard';
import type { ProcessColumnData } from '@/app/(admin)/admin/process-board/_lib/types';
import type { Contact } from '@/lib/types/contact';
import { BG_COLOR, TEXT_COLOR } from '@/lib/styles';

interface ProcessColumnProps extends ProcessColumnData {
  onCardClick: (contact: Contact) => void;
}

export default function ProcessColumn({
  stage,
  label,
  contacts,
  color,
  bgColor,
  onCardClick,
}: ProcessColumnProps) {
  return (
    <div className="min-w-[280px] w-[280px] flex-shrink-0">
      <div className={`${BG_COLOR.muted}/50 rounded-lg p-3 h-full flex flex-col`}>
        {/* 헤더 */}
        <div className="flex items-center justify-between mb-3">
          <h3 className={`text-sm font-semibold ${color}`}>{label}</h3>
          <span className={`${bgColor} ${color} px-2 py-0.5 rounded-full text-xs font-medium`}>
            {contacts.length}
          </span>
        </div>

        {/* 카드 리스트 */}
        <div className="flex-1 overflow-y-auto max-h-[calc(100vh-250px)] space-y-2">
          {contacts.length === 0 ? (
            <div className="text-center py-8">
              <p className={`text-sm ${TEXT_COLOR.disabled}`}>문의 없음</p>
            </div>
          ) : (
            contacts.map((contact) => (
              <ProcessContactCard
                key={contact.id}
                contact={contact}
                onClick={() => onCardClick(contact)}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}
