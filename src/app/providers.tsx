'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from 'next-themes';
import { useState } from 'react';
import dynamic from 'next/dynamic';
import { LazyMotion } from 'framer-motion';
import { ToastProvider } from '@/components/toast/ToastProvider';

// 개발 환경에서만 React Query DevTools 동적 import
const shouldEnableReactQueryDevtools =
  process.env.NODE_ENV === 'development' &&
  process.env.NEXT_PUBLIC_ENABLE_REACT_QUERY_DEVTOOLS === 'true';

const ReactQueryDevtools = shouldEnableReactQueryDevtools
  ? dynamic(
      () =>
        import('@tanstack/react-query-devtools')
          .then((mod) => mod.ReactQueryDevtools)
          .catch(() => {
            return () => null;
          }),
      { ssr: false }
    )
  : () => null;

// Framer Motion features - domMax for full AnimatePresence support
const loadFeatures = () => import('framer-motion').then((mod) => mod.domMax);

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // 5분간 데이터를 stale 상태로 유지
            staleTime: 5 * 60 * 1000,
            // 10분간 캐시 유지
            gcTime: 10 * 60 * 1000,
            // 개발 환경에서 retry 줄여 에러 표시 빠르게
            retry: process.env.NODE_ENV === 'development' ? 1 : 3,
            // 네트워크 에러 시 재시도
            retryOnMount: true,
            // 개발에서 window focus 시 무한 재요청 방지
            refetchOnWindowFocus: false,
          },
        },
      })
  );

  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem disableTransitionOnChange>
      <QueryClientProvider client={queryClient}>
        <ToastProvider placement="top-center" toastOffset={80}>
          <LazyMotion features={loadFeatures}>{children}</LazyMotion>
          {shouldEnableReactQueryDevtools && <ReactQueryDevtools initialIsOpen={false} />}
        </ToastProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
