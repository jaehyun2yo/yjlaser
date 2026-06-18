'use client';

import { useCallback } from 'react';
import { submitContact as defaultSubmitContact } from '@/app/actions/contacts';

type SubmitContactResult = Awaited<ReturnType<typeof defaultSubmitContact>>;

export function useContactSubmitAction(
  submitContactAction: (formData: FormData) => Promise<SubmitContactResult> = defaultSubmitContact
) {
  const submitContactForm = useCallback(
    (formData: FormData) => submitContactAction(formData),
    [submitContactAction]
  );

  return { submitContactForm };
}
