import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// 전역 상태 타입 정의
interface AppState {
  // 사용자 관련
  user: {
    email: string;
    name: string;
  } | null;
  setUser: (user: { email: string; name: string } | null) => void;

  // 관리자 인증 상태
  isAdmin: boolean;
  setIsAdmin: (isAdmin: boolean) => void;
}

export const useStore = create<AppState>()(
  persist(
    (set) => ({
      // 초기 상태
      user: null,
      isAdmin: false,

      // Actions
      setUser: (user) => set({ user }),
      setIsAdmin: (isAdmin) => set({ isAdmin }),
    }),
    {
      name: 'app-storage', // localStorage 키
    }
  )
);

// 편의 훅
export const useUser = () => {
  const { user, setUser } = useStore();
  return { user, setUser };
};

export const useAuth = () => {
  const { isAdmin, setIsAdmin } = useStore();
  return { isAdmin, setIsAdmin };
};
