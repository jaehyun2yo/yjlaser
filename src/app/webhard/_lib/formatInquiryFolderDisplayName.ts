const OFFICE_INQUIRY_NUMBER_PATTERN = /^\d{6}-O-\d{3}(?:-\d+)?$/;
const FIELD_WORK_NUMBER_PATTERN = /^\d{6}-F-\d{3}(?:-\d+)?$/;

export function formatInquiryFolderDisplayName(folderName: string): string {
  const trimmed = folderName.trim();
  const parts = trimmed.split('_');

  if (
    parts.length === 2 &&
    OFFICE_INQUIRY_NUMBER_PATTERN.test(parts[0]) &&
    FIELD_WORK_NUMBER_PATTERN.test(parts[1])
  ) {
    return `${parts[0]} / ${parts[1]}`;
  }

  if (OFFICE_INQUIRY_NUMBER_PATTERN.test(trimmed)) {
    return `${trimmed} /`;
  }

  if (FIELD_WORK_NUMBER_PATTERN.test(trimmed)) {
    return `/ ${trimmed}`;
  }

  return folderName;
}
