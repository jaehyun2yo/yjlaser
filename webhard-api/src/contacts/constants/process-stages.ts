export const PROCESS_STAGE_ORDER: string[] = [
  'drawing',
  'sample',
  'drawing_confirmed',
  'laser',
  'cutting',
  'creasing',
  'delivery',
];

export function getNextStage(current: string): string | null {
  const idx = PROCESS_STAGE_ORDER.indexOf(current);
  if (idx === -1 || idx === PROCESS_STAGE_ORDER.length - 1) return null;
  return PROCESS_STAGE_ORDER[idx + 1];
}

export function isValidStageTransition(from: string, to: string): boolean {
  const fromIdx = PROCESS_STAGE_ORDER.indexOf(from);
  const toIdx = PROCESS_STAGE_ORDER.indexOf(to);
  return fromIdx !== -1 && toIdx !== -1 && toIdx > fromIdx;
}
