'use client';

import React, { Component, ErrorInfo, ReactNode } from 'react';
import * as Sentry from '@sentry/nextjs';
import Link from 'next/link';
import { logger } from '@/lib/utils/logger';
import { BG_COLOR, BORDER_COLOR, TEXT_COLOR } from '@/lib/styles';

const errorLogger = logger.createLogger('ERROR_BOUNDARY');

interface Props {
  children: ReactNode;
  fallback?: ReactNode | ((controls: { reset: () => void }) => ReactNode);
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  eventId: string | null;
}

/**
 * 전역 에러 바운더리 컴포넌트
 * React 컴포넌트 트리에서 발생하는 에러를 포착하고 Sentry로 전송합니다.
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      eventId: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    // 다음 렌더에서 폴백 UI가 보이도록 상태를 업데이트합니다.
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // 에러 로깅
    errorLogger.error('Error caught by boundary', error, {
      componentStack: errorInfo.componentStack,
    });

    // Sentry로 에러 전송
    const eventId = Sentry.captureException(error, {
      extra: {
        componentStack: errorInfo.componentStack,
      },
      tags: {
        errorBoundary: 'true',
      },
    });

    this.setState({ eventId });

    // 커스텀 에러 핸들러 호출
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }
  }

  handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      eventId: null,
    });
  };

  handleFeedback = () => {
    if (this.state.eventId) {
      Sentry.showReportDialog({ eventId: this.state.eventId });
    }
  };

  render() {
    if (this.state.hasError) {
      // 커스텀 폴백 UI가 제공되면 사용
      if (this.props.fallback) {
        return typeof this.props.fallback === 'function'
          ? this.props.fallback({ reset: this.handleReset })
          : this.props.fallback;
      }

      // 기본 에러 UI
      return (
        <div className={`min-h-screen flex items-center justify-center ${BG_COLOR.page} px-4`}>
          <div className={`max-w-md w-full ${BG_COLOR.card} rounded-lg shadow-lg p-6`}>
            <div
              className={`flex items-center justify-center w-12 h-12 mx-auto ${BG_COLOR.errorMedium}/20 rounded-full mb-4`}
            >
              <svg
                className={`w-6 h-6 ${TEXT_COLOR.error}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
            </div>
            <h2 className={`text-xl font-semibold ${TEXT_COLOR.primary} text-center mb-2`}>
              문제가 발생했습니다
            </h2>
            <p className={`${TEXT_COLOR.secondary} text-center mb-6`}>
              예상치 못한 오류가 발생했습니다. 페이지를 새로고침하거나 다시 시도해주세요.
            </p>
            {process.env.NODE_ENV === 'development' && this.state.error && (
              <div
                className={`mb-4 p-3 ${BG_COLOR.errorSoft} rounded border ${BORDER_COLOR.error}`}
              >
                <p className={`text-sm font-mono ${TEXT_COLOR.errorDeep} break-all`}>
                  {this.state.error.message}
                </p>
              </div>
            )}
            <div className="flex gap-3">
              <button
                onClick={this.handleReset}
                className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                aria-label="에러 복구 후 다시 시도"
              >
                다시 시도
              </button>
              <Link
                href="/"
                className={`flex-1 px-4 py-2 ${BG_COLOR.muted} ${BG_COLOR.hoverMuted} ${TEXT_COLOR.primary} text-center rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2`}
                aria-label="홈으로 이동"
              >
                홈으로
              </Link>
            </div>
            {this.state.eventId && (
              <button
                onClick={this.handleFeedback}
                className={`w-full mt-3 px-4 py-2 text-sm ${TEXT_COLOR.secondary} ${TEXT_COLOR.hoverPrimary} transition-colors`}
                aria-label="피드백 보내기"
              >
                문제 리포트 보내기
              </button>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
