'use client';

import { useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { useWebhardHighlightStore } from '@/store/webhard/useWebhardHighlightStore';

const HIGHLIGHT_DURATION_MS = 3000;

interface HighlightableFile {
  id: string;
}

export function useWebhardFileIdHighlight(
  selectedFolderId: string | null,
  files: readonly HighlightableFile[]
): void {
  const searchParams = useSearchParams();
  const handledFileIdRef = useRef<string | null>(null);

  useEffect(() => {
    const fileIdFromUrl = searchParams.get('fileId');
    if (!fileIdFromUrl) return;
    if (handledFileIdRef.current === fileIdFromUrl) return;
    if (!selectedFolderId) return;

    const fileExists = files.some((f) => f.id === fileIdFromUrl);
    if (!fileExists) return;

    const { setHighlight, clearHighlight } = useWebhardHighlightStore.getState();
    setHighlight(fileIdFromUrl, 'file');
    handledFileIdRef.current = fileIdFromUrl;

    const timer = setTimeout(() => {
      clearHighlight();
    }, HIGHLIGHT_DURATION_MS);
    return () => clearTimeout(timer);
  }, [searchParams, selectedFolderId, files]);
}
