# Contact Form Submission Split

Status: implemented (2026-05-10)

## Scope

This document covers AUDIT-17 for the public `/contact` form.

## Boundaries

- `ContactForm.tsx` remains the user-facing page component.
- `src/app/contact/_lib/contactSubmission.ts` owns final submission payload assembly and final submit validation contracts.
- `src/app/contact/hooks/useContactSubmitAction.ts` owns the `submitContact` server action call boundary.
- `src/app/contact/_components/contactFormSections.tsx` defines the stable section order:
  1. company info section
  2. file upload section
  3. visit booking section
  4. estimate method section

## Payload Contracts

- `referral_source` keeps the existing mapping: `기타` and `거래처 소개` send the free-text value.
- `drawing_type='create'` with `hasReferencePhotos=true` promotes the first reference file to `drawing_file` when no explicit drawing file exists.
- When `hasReferencePhotos=false`, stale client reference file state is not sent.
- `drawing_type='have'` keeps explicit `drawing_file` and sends either `delivery_company_address='company_address'` or delivery company fields.
- Portfolio reference payload is included only when a portfolio product and origin are available.

## Validation Contracts

- Company name/name/position/phone/email validation remains before submission.
- `drawing_type='have'` requires drawing modification and an uploaded drawing file.
- Delivery company mode requires name, phone, and address.
- `drawing_type='create'` requires receipt method.
- Visit receipt requires visit date and slot.
- Delivery receipt requires delivery type, address, recipient name, and phone.
- While the final submit action is pending, the last-step submit button is disabled and shows `전송중...` with a spinner and `aria-busy="true"`.

## Verification

- `src/app/contact/__tests__/ContactSubmitButton.test.tsx`
- `src/app/contact/__tests__/audit17-contact-submission.test.ts`
- `src/__tests__/contact/booking-slot-ux.test.tsx`
- `src/__tests__/lib/utils/contactDataProcessor.test.ts`
- `pnpm test -- --testPathPatterns="src/app/contact|src/__tests__/contact|src/__tests__/lib/utils/contactDataProcessor" --testPathIgnorePatterns=".worktrees" --runInBand`
- `npx tsc --noEmit`
