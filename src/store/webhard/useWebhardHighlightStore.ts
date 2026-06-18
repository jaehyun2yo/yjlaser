/**
 * useWebhardHighlightStore
 * 웹하드 검색 결과 하이라이트 상태 관리
 * - 검색 결과 클릭 후 해당 항목 강조
 * - 3초 후 자동 해제
 */
import { create } from 'zustand';

interface WebhardHighlightState {
  /** 강조된 항목 ID */
  highlightedId: string | null;
  /** 강조된 항목 타입 */
  highlightType: 'file' | 'folder' | null;
  /** 하이라이트 설정 */
  setHighlight: (id: string, type: 'file' | 'folder') => void;
  /** 하이라이트 해제 */
  clearHighlight: () => void;
}

export const useWebhardHighlightStore = create<WebhardHighlightState>((set) => ({
  highlightedId: null,
  highlightType: null,
  setHighlight: (id, type) => set({ highlightedId: id, highlightType: type }),
  clearHighlight: () => set({ highlightedId: null, highlightType: null }),
}));
