interface ContactDownloadFilenameInput {
  inquiryNumber?: string | null;
  workNumber?: string | null;
  companyName?: string | null;
  fileName?: string | null;
}

interface ContactFilenameContext {
  inquiryNumber?: string | null;
  workNumber?: string | null;
  companyName?: string | null;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getNumberAliases(numbers: Array<string | null | undefined>): string[] {
  const aliases = new Set<string>();
  for (const number of numbers) {
    const trimmed = number?.trim();
    if (!trimmed) continue;
    aliases.add(trimmed);

    const shortNumber = trimmed.match(/^\d{6}-([OF]-\d+)$/)?.[1];
    if (shortNumber) aliases.add(shortNumber);
  }
  return Array.from(aliases);
}

function stripKnownNumberPrefix(name: string, numbers: Array<string | null | undefined>): string {
  const knownNumbers = getNumberAliases(numbers);
  let result = name.trimStart();
  let changed = true;

  while (changed) {
    changed = false;
    for (const number of knownNumbers) {
      const pattern = new RegExp(`^\\[${escapeRegExp(number)}\\]\\s*`);
      const next = result.replace(pattern, '');
      if (next !== result) {
        result = next;
        changed = true;
      }
    }
  }

  return result;
}

function stripContactDownloadPrefix(
  name: string,
  numbers: Array<string | null | undefined>,
  companyName: string
): string {
  const numberAliases = getNumberAliases(numbers);
  let result = name.trimStart();
  let changed = true;

  while (changed) {
    changed = false;
    for (const number of numberAliases) {
      const pattern = new RegExp(
        `^${escapeRegExp(number)}\\s*-\\s*${escapeRegExp(companyName)}\\s*-\\s*`
      );
      const next = result.replace(pattern, '');
      if (next !== result) {
        result = next;
        changed = true;
      }
    }
  }

  return result;
}

function stripCompanyPrefix(name: string, companyName: string): string {
  const pattern = new RegExp(`^${escapeRegExp(companyName)}\\s*-\\s*`);
  return name.trimStart().replace(pattern, '');
}

function fallbackSegment(value: string | null | undefined, fallback: string): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed : fallback;
}

function cleanContactFileName(fileName: string, context: ContactFilenameContext): string {
  const company = context.companyName?.trim();
  let result = stripKnownNumberPrefix(fileName, [context.inquiryNumber, context.workNumber]);
  if (company) {
    result = stripContactDownloadPrefix(
      result,
      [context.inquiryNumber, context.workNumber],
      company
    );
    result = stripCompanyPrefix(result, company);
  }
  result = stripKnownNumberPrefix(result, [context.inquiryNumber, context.workNumber]);
  if (company) {
    result = stripContactDownloadPrefix(
      result,
      [context.inquiryNumber, context.workNumber],
      company
    );
    result = stripCompanyPrefix(result, company);
  }
  return result.trim();
}

export function buildContactDownloadFilename({
  inquiryNumber,
  workNumber,
  companyName,
  fileName,
}: ContactDownloadFilenameInput): string {
  const number = fallbackSegment(inquiryNumber ?? workNumber, '번호없음');
  const company = fallbackSegment(companyName, '업체미확인');
  const rawFileName = fallbackSegment(fileName, 'download');
  const cleanedFileName = cleanContactFileName(rawFileName, {
    inquiryNumber,
    workNumber,
    companyName: company,
  });

  return `${number} - ${company} - ${cleanedFileName || 'download'}`;
}

export function buildWorkerContactCardFilename({
  inquiryNumber,
  workNumber,
  companyName,
  fileName,
}: ContactDownloadFilenameInput): string {
  const parts = buildWorkerContactCardFilenameParts({
    inquiryNumber,
    workNumber,
    companyName,
    fileName,
  });

  return `${parts.companyName} - ${parts.fileName}`;
}

export function buildWorkerContactCardFilenameParts({
  inquiryNumber,
  workNumber,
  companyName,
  fileName,
}: ContactDownloadFilenameInput): { companyName: string; fileName: string } {
  const company = fallbackSegment(companyName, '업체미확인');
  const rawFileName = fallbackSegment(fileName, '파일 없음');
  const cleanedFileName = cleanContactFileName(rawFileName, {
    inquiryNumber,
    workNumber,
    companyName: company,
  });

  return {
    companyName: company,
    fileName: cleanedFileName || '파일 없음',
  };
}
