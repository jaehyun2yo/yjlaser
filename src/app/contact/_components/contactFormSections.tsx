import type { ReactNode } from 'react';

export const CONTACT_FORM_SECTIONS = [
  { step: 1, key: 'company-info', label: 'company info section' },
  { step: 2, key: 'file-upload', label: 'file upload section' },
  { step: 3, key: 'visit-booking', label: 'visit booking section' },
  { step: 4, key: 'estimate-method', label: 'estimate method section' },
] as const;

type ContactFormSectionProps = {
  active: boolean;
  className?: string;
  children: ReactNode;
};

function ContactFormSection({
  active,
  className,
  children,
  sectionKey,
}: ContactFormSectionProps & { sectionKey: (typeof CONTACT_FORM_SECTIONS)[number]['key'] }) {
  return (
    <div
      data-contact-form-section={sectionKey}
      style={{ display: active ? 'block' : 'none' }}
      className={className}
    >
      {children}
    </div>
  );
}

export function ContactCompanyInfoSection(props: ContactFormSectionProps) {
  return <ContactFormSection {...props} sectionKey="company-info" />;
}

export function ContactFileUploadSection(props: ContactFormSectionProps) {
  return <ContactFormSection {...props} sectionKey="file-upload" />;
}

export function ContactVisitBookingSection(props: ContactFormSectionProps) {
  return <ContactFormSection {...props} sectionKey="visit-booking" />;
}

export function ContactEstimateMethodSection(props: ContactFormSectionProps) {
  return <ContactFormSection {...props} sectionKey="estimate-method" />;
}
