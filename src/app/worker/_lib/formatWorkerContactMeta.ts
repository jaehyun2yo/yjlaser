export function formatWorkerInquiryNumbers(params: {
  inquiryNumber?: string | null;
  workNumber?: string | null;
}): string | null {
  const inquiryNumber = params.inquiryNumber?.trim() || '';
  const workNumber = params.workNumber?.trim() || '';

  if (inquiryNumber && workNumber) return `${inquiryNumber} / ${workNumber}`;
  if (inquiryNumber) return inquiryNumber;
  if (workNumber) return workNumber;
  return null;
}

export function formatWorkerDateTime(date: Date): string {
  const year = String(date.getFullYear() % 100).padStart(2, '0');
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const period = hours < 12 ? '오전' : '오후';
  const displayHour = hours === 0 ? 12 : hours > 12 ? hours - 12 : hours;

  return `${year}년 ${month}월 ${day}일 ${period} ${displayHour}시 ${minutes}분`;
}

export function formatWorkerCreatedAt(dateStr: string): string {
  return formatWorkerDateTime(new Date(dateStr));
}
