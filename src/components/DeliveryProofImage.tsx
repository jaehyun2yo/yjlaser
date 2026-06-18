'use client';

import { useState, useEffect, useCallback } from 'react';
import { ImageOff } from 'lucide-react';
import DeliveryProofLightbox from '@/components/DeliveryProofLightbox';
import { Skeleton } from '@/components/ui/skeleton';

interface DeliveryProofImageProps {
  contactId: string;
  className?: string;
  /** 라이트박스(전체화면) 기능 활성화 여부 */
  enableLightbox?: boolean;
  onReady?: () => void;
}

/**
 * 납품 증빙 사진 — presigned URL 기반 보안 이미지 컴포넌트.
 * Admin/Company/Worker 인증에 따라 접근 제어됨.
 */
export default function DeliveryProofImage({
  contactId,
  className = 'w-full max-h-32 object-cover rounded-lg',
  enableLightbox = true,
  onReady,
}: DeliveryProofImageProps) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function fetchUrl() {
      try {
        const res = await fetch(`/api/contacts/${contactId}/delivery-proof`);
        if (!res.ok) {
          if (!cancelled) {
            setError(true);
            onReady?.();
          }
          return;
        }
        const data = await res.json();
        if (!cancelled) {
          if (data.url) {
            setUrl(data.url);
          } else {
            onReady?.();
          }
        }
      } catch {
        if (!cancelled) {
          setError(true);
          onReady?.();
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchUrl();
    return () => {
      cancelled = true;
    };
  }, [contactId, onReady]);

  const handleClick = useCallback(() => {
    if (enableLightbox && url) setLightboxOpen(true);
  }, [enableLightbox, url]);

  if (loading) {
    return <Skeleton className={`${className} rounded-lg`} style={{ minHeight: 80 }} />;
  }

  if (error || !url) {
    return (
      <div className="flex items-center gap-1.5 py-2 text-xs text-gray-400">
        <ImageOff className="w-3.5 h-3.5" />
        <span>사진을 불러올 수 없습니다</span>
      </div>
    );
  }

  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt="납품 증빙"
        className={`${className} ${enableLightbox ? 'cursor-pointer hover:opacity-90 transition-opacity' : ''}`}
        onClick={handleClick}
        onLoad={onReady}
        onError={() => {
          setError(true);
          onReady?.();
        }}
      />
      {enableLightbox && (
        <DeliveryProofLightbox
          imageUrl={url}
          isOpen={lightboxOpen}
          onClose={() => setLightboxOpen(false)}
        />
      )}
    </>
  );
}
