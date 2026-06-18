'use client';

import type { MouseEventHandler } from 'react';
import { Button } from '@/components/ui/button';

interface ContactSubmitButtonProps {
  isSubmitting: boolean;
  onClick: MouseEventHandler<HTMLButtonElement>;
}

export function ContactSubmitButton({ isSubmitting, onClick }: ContactSubmitButtonProps) {
  return (
    <Button
      type="button"
      onClick={onClick}
      disabled={isSubmitting}
      aria-busy={isSubmitting ? 'true' : undefined}
      className="min-w-[112px]"
    >
      {isSubmitting ? (
        <span
          data-testid="contact-submit-spinner"
          aria-hidden="true"
          className="h-4 w-4 rounded-full border-2 border-white/40 border-t-white animate-spin"
        />
      ) : null}
      <span>{isSubmitting ? '전송중...' : '문의하기'}</span>
    </Button>
  );
}
