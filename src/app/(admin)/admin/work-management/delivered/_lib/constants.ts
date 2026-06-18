export type DateMode = 'daily' | 'monthly';

export const DATE_MODE_OPTIONS: { key: DateMode; label: string }[] = [
  { key: 'daily', label: '하루단위' },
  { key: 'monthly', label: '월단위' },
];
