'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useErpMobileStore } from '@/app/worker/_lib/store';
import type { FC } from 'react';

const PIN_LENGTH = 4;

const WorkerLoginPage: FC = () => {
  const router = useRouter();
  const { setWorkerSession, workerSession } = useErpMobileStore();
  const [name, setName] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const pinAreaRef = useRef<HTMLDivElement>(null);

  // 이미 로그인된 경우 리다이렉트
  useEffect(() => {
    if (workerSession) {
      router.push('/worker/dashboard');
    }
  }, [workerSession, router]);

  const doLogin = useCallback(
    async (loginName: string, loginPin: string) => {
      setIsLoading(true);
      setError('');

      try {
        const response = await fetch('/api/erp/session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: loginName, pin: loginPin }),
        });

        if (!response.ok) {
          const data = await response.json().catch(() => ({ message: '로그인 실패' }));
          throw new Error(data.message || '로그인에 실패했습니다');
        }

        const data = await response.json();

        if (data.success && data.worker) {
          // Zustand 세션 저장
          setWorkerSession({
            id: data.worker.id,
            name: data.worker.name,
            role: data.worker.role,
            workerType: data.worker.worker_type || null,
          });

          // 통합 대시보드로 이동 (worker_type에 따라 기본 탭 설정)
          const defaultTab = data.worker.worker_type === 'office' ? 'office' : 'field';
          router.push(`/worker/dashboard?tab=${defaultTab}`);
        } else {
          setError(data.message || '이름 또는 PIN이 일치하지 않습니다.');
          setPin('');
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : '로그인에 실패했습니다');
        setPin('');
      } finally {
        setIsLoading(false);
      }
    },
    [router, setWorkerSession]
  );

  const handleDigitInput = useCallback(
    (digit: string) => {
      const newPin = pin + digit;
      if (newPin.length > PIN_LENGTH) return;

      setError('');
      setPin(newPin);

      if (newPin.length === PIN_LENGTH && name.trim()) {
        setTimeout(() => doLogin(name.trim(), newPin), 100);
      }
    },
    [pin, name, doLogin]
  );

  const handleBackspace = useCallback(() => {
    setError('');
    setPin((prev) => prev.slice(0, -1));
  }, []);

  const handleClear = useCallback(() => {
    setError('');
    setPin('');
  }, []);

  // 키보드 이벤트 핸들러 (PIN 영역에서 숫자키 입력)
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (isLoading) return;

      if (e.key >= '0' && e.key <= '9') {
        e.preventDefault();
        handleDigitInput(e.key);
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        handleBackspace();
      }
    },
    [isLoading, handleDigitInput, handleBackspace]
  );

  // 이름 입력 후 Enter → PIN 포커스
  const handleNameKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      pinAreaRef.current?.focus();
    }
  }, []);

  const numpadKeys = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

  return (
    <div className="min-h-screen bg-gray-900 flex flex-col items-center justify-center p-4">
      {/* 로고 / 타이틀 */}
      <div className="mb-6 text-center">
        <div className="w-16 h-16 bg-blue-500 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-blue-500/30">
          <svg className="w-9 h-9 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
            />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-white">작업관리</h1>
        <p className="text-gray-400 text-sm mt-1">이름과 PIN을 입력해주세요</p>
        {error && (
          <div
            className="mt-4 w-full max-w-xs rounded-xl border border-red-500/50 bg-red-500/20 px-4 py-3 text-sm text-red-300"
            aria-live="polite"
          >
            <p className="text-center font-medium">{error}</p>
            <div className="mt-2 space-y-1 text-left text-gray-300">
              <p>PIN을 모르면 현장 관리자에게 문의해주세요.</p>
              <p className="text-xs text-gray-400">
                반복 실패 또는 잠금 상태도 관리자 확인이 필요합니다.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* 이름 입력 */}
      <div className="w-full max-w-xs mb-4">
        <label htmlFor="worker-name" className="mb-2 block text-sm font-medium text-gray-300">
          작업자 이름
        </label>
        <input
          id="worker-name"
          ref={nameInputRef}
          type="text"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setError('');
          }}
          onKeyDown={handleNameKeyDown}
          placeholder="예: 홍길동"
          autoFocus
          disabled={isLoading}
          className="w-full h-12 px-4 rounded-xl text-center text-lg font-medium bg-gray-800 border-2 border-gray-600 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed"
        />
      </div>

      {/* PIN 표시 */}
      <div
        ref={pinAreaRef}
        tabIndex={0}
        onKeyDown={handleKeyDown}
        className="mb-4 flex gap-3 outline-none"
        role="group"
        aria-label={`PIN ${pin.length}자리 입력됨`}
      >
        {Array.from({ length: PIN_LENGTH }).map((_, i) => (
          <div
            key={i}
            className={`w-12 h-12 rounded-xl border-2 flex items-center justify-center transition-all duration-150 ${
              i < pin.length ? 'border-blue-500 bg-blue-500/20' : 'border-gray-600 bg-gray-800'
            }`}
          >
            {i < pin.length && <div className="w-3 h-3 rounded-full bg-blue-400" />}
          </div>
        ))}
      </div>

      {/* 숫자 키패드 */}
      <div className="w-full max-w-xs">
        <div className="grid grid-cols-3 gap-3 mb-3">
          {numpadKeys.map((num) => (
            <button
              key={num}
              type="button"
              onClick={() => handleDigitInput(num)}
              disabled={isLoading || pin.length >= PIN_LENGTH || !name.trim()}
              className="h-14 rounded-2xl text-2xl font-semibold bg-gray-800 hover:bg-gray-700 active:bg-gray-600 text-white border border-gray-700 hover:border-gray-600 transition-all duration-100 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-blue-500/50 min-h-[56px]"
            >
              {num}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-3 gap-3">
          <button
            type="button"
            onClick={handleClear}
            disabled={isLoading || pin.length === 0}
            aria-label="전체 지우기"
            className="h-14 rounded-2xl text-sm font-semibold bg-gray-800 hover:bg-gray-700 active:bg-gray-600 text-gray-400 hover:text-gray-200 border border-gray-700 transition-all duration-100 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none min-h-[56px]"
          >
            전체 삭제
          </button>

          <button
            type="button"
            onClick={() => handleDigitInput('0')}
            disabled={isLoading || pin.length >= PIN_LENGTH || !name.trim()}
            className="h-14 rounded-2xl text-2xl font-semibold bg-gray-800 hover:bg-gray-700 active:bg-gray-600 text-white border border-gray-700 hover:border-gray-600 transition-all duration-100 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-blue-500/50 min-h-[56px]"
          >
            0
          </button>

          <button
            type="button"
            onClick={handleBackspace}
            disabled={isLoading || pin.length === 0}
            aria-label="한 자리 삭제"
            className="h-14 rounded-2xl bg-gray-800 hover:bg-gray-700 active:bg-gray-600 text-gray-300 hover:text-white border border-gray-700 transition-all duration-100 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none flex items-center justify-center min-h-[56px]"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M3 12l6.414 6.414a2 2 0 001.414.586H19a2 2 0 002-2V7a2 2 0 00-2-2h-8.172a2 2 0 00-1.414.586L3 12z"
              />
            </svg>
          </button>
        </div>

        {isLoading && (
          <div className="mt-4 flex items-center justify-center gap-2 text-gray-400 text-sm">
            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
            로그인 중...
          </div>
        )}
      </div>
    </div>
  );
};

export default WorkerLoginPage;
