interface CompanyInquiryDisplayTitleInput {
  inquiryTitle?: string | null;
  alternateTitle?: string | null;
  companyName?: string | null;
  fallbackTitle: string;
}

export function getCompanyInquiryDisplayTitle({
  inquiryTitle,
  alternateTitle,
  companyName,
  fallbackTitle,
}: CompanyInquiryDisplayTitleInput): string {
  const rawTitle = inquiryTitle?.trim() || alternateTitle?.trim();
  if (!rawTitle) {
    return fallbackTitle;
  }

  const trimmedCompanyName = companyName?.trim();
  if (!trimmedCompanyName || !rawTitle.startsWith(trimmedCompanyName)) {
    return rawTitle;
  }

  const titleWithoutCompany = rawTitle
    .slice(trimmedCompanyName.length)
    .replace(/^[\s\-_:|/·]+/, '')
    .trim();

  return titleWithoutCompany || rawTitle;
}
