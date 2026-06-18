'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * 디바운스 훅
 * 값이 변경된 후 지정된 시간이 지나면 새 값을 반환합니다.
 */
export function useDebounce<T>(value: T, delay: number = 300): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(timer);
    };
  }, [value, delay]);

  return debouncedValue;
}

/**
 * 디바운스된 콜백 훅
 * 콜백 함수 실행을 디바운스합니다.
 */
export function useDebouncedCallback<T extends (...args: Parameters<T>) => ReturnType<T>>(
  callback: T,
  delay: number = 300
): (...args: Parameters<T>) => void {
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const callbackRef = useRef(callback);

  // 콜백 참조 업데이트
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  // 클린업
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return useCallback(
    (...args: Parameters<T>) => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      timeoutRef.current = setTimeout(() => {
        callbackRef.current(...args);
      }, delay);
    },
    [delay]
  );
}

/**
 * 쓰로틀 훅
 * 지정된 시간 간격으로만 값을 업데이트합니다.
 */
export function useThrottle<T>(value: T, interval: number = 300): T {
  const [throttledValue, setThrottledValue] = useState<T>(value);
  const lastUpdated = useRef<number>(Date.now());

  useEffect(() => {
    const now = Date.now();
    const timeSinceLastUpdate = now - lastUpdated.current;

    if (timeSinceLastUpdate >= interval) {
      lastUpdated.current = now;
      setThrottledValue(value);
    } else {
      const timer = setTimeout(() => {
        lastUpdated.current = Date.now();
        setThrottledValue(value);
      }, interval - timeSinceLastUpdate);

      return () => {
        clearTimeout(timer);
      };
    }
  }, [value, interval]);

  return throttledValue;
}

/**
 * 검색 입력을 위한 최적화된 훅
 * 디바운싱 + 최소 길이 체크 + 로딩 상태
 */
export function useSearchInput(options?: {
  delay?: number;
  minLength?: number;
  onSearch?: (query: string) => void;
}) {
  const { delay = 300, minLength = 2, onSearch } = options || {};

  const [inputValue, setInputValue] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const debouncedValue = useDebounce(inputValue, delay);

  // 디바운스된 검색 실행
  useEffect(() => {
    const shouldSearch = debouncedValue.length >= minLength;

    if (shouldSearch) {
      setIsSearching(true);
      onSearch?.(debouncedValue);
      // 검색 완료 후 로딩 상태 해제는 외부에서 처리
    } else if (debouncedValue.length === 0) {
      // 빈 검색어면 초기화
      onSearch?.('');
    }
  }, [debouncedValue, minLength, onSearch]);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value);
  }, []);

  const clearInput = useCallback(() => {
    setInputValue('');
    setIsSearching(false);
    onSearch?.('');
  }, [onSearch]);

  return {
    inputValue,
    debouncedValue,
    isSearching,
    setIsSearching,
    handleInputChange,
    clearInput,
    setInputValue,
  };
}
