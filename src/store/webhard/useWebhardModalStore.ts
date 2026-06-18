/**
 * 웹하드 모달 상태 관리 스토어
 * - 단일 모달 관리 (한 번에 하나의 모달만 열림)
 * - 모달 데이터 전달
 */
import { create } from 'zustand';

export type ModalType =
  | 'settings'
  | 'search'
  | 'trash'
  | 'move'
  | 'moveProgress'
  | 'download'
  | 'delete'
  | 'deleteConfirm'
  | 'folderUpload'
  | 'folderSelect'
  | 'shareLink'
  | null;

interface ModalState {
  // State
  activeModal: ModalType;
  modalData: Record<string, unknown>;

  // Actions
  openModal: (modal: NonNullable<ModalType>, data?: Record<string, unknown>) => void;
  closeModal: () => void;
  updateModalData: (data: Record<string, unknown>) => void;

  // Getters
  isModalOpen: (modal: NonNullable<ModalType>) => boolean;
  hasAnyModalOpen: boolean;
}

export const useWebhardModalStore = create<ModalState>((set, get) => ({
  // Initial State
  activeModal: null,
  modalData: {},

  // Actions
  openModal: (modal: NonNullable<ModalType>, data: Record<string, unknown> = {}) => {
    set({
      activeModal: modal,
      modalData: data,
    });
  },

  closeModal: () => {
    set({
      activeModal: null,
      modalData: {},
    });
  },

  updateModalData: (data: Record<string, unknown>) => {
    set((state) => ({
      modalData: { ...state.modalData, ...data },
    }));
  },

  // Getters
  isModalOpen: (modal: NonNullable<ModalType>) => {
    return get().activeModal === modal;
  },

  get hasAnyModalOpen() {
    return get().activeModal !== null;
  },
}));
