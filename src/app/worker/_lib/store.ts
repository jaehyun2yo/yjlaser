'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { logger } from '@/lib/utils/logger';

const log = logger.createLogger('ErpMobileStore');

interface WorkerSession {
  id: string;
  name: string;
  role: string;
  workerType: string | null;
}

interface ErpMobileStore {
  workerSession: WorkerSession | null;
  _hydrated: boolean;
  setWorkerSession: (session: WorkerSession | null) => void;
  logout: () => Promise<void>;
}

export const useErpMobileStore = create<ErpMobileStore>()(
  persist(
    (set) => ({
      workerSession: null,
      _hydrated: false,
      setWorkerSession: (session) => set({ workerSession: session }),
      logout: async () => {
        // 서버 세션 삭제
        try {
          await fetch('/api/erp/session', {
            method: 'DELETE',
          });
        } catch (error) {
          log.error('Failed to delete server session:', error);
        }
        // 자동로그인 정보 삭제
        try {
          localStorage.removeItem('worker-auto-login');
        } catch {
          // ignore
        }
        // 클라이언트 세션 삭제
        set({ workerSession: null });
      },
    }),
    {
      name: 'erp-mobile-session',
      onRehydrateStorage: () => (state) => {
        if (state) state._hydrated = true;
      },
      partialize: (state) => ({ workerSession: state.workerSession }),
    }
  )
);
