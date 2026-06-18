'use client';

import { useEffect, useState } from 'react';

const MOBILE_QUERY = '(max-width: 767px)';

export function useIsMobile(): boolean | null {
  const [isMobile, setIsMobile] = useState<boolean | null>(null);

  useEffect(() => {
    const query = window.matchMedia(MOBILE_QUERY);

    const updateViewport = () => {
      setIsMobile(query.matches);
    };

    updateViewport();
    query.addEventListener('change', updateViewport);

    return () => {
      query.removeEventListener('change', updateViewport);
    };
  }, []);

  return isMobile;
}
