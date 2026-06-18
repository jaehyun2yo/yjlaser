import { TEXT_COLOR, BG_COLOR, BORDER_COLOR, DIVIDE_COLOR } from '@/lib/styles';

describe('Design System: Token Consistency', () => {
  test('TEXT_COLOR new keys use CSS variable utilities (no dark: prefix)', () => {
    const newKeys = [
      'primary',
      'secondary',
      'muted',
      'disabled',
      'brand',
      'success',
      'error',
      'warning',
      'info',
    ];
    for (const key of newKeys) {
      const value = TEXT_COLOR[key as keyof typeof TEXT_COLOR];
      expect(value).not.toContain('dark:');
    }
  });

  test('BG_COLOR new keys use CSS variable utilities (no dark: prefix)', () => {
    const newKeys = [
      'page',
      'card',
      'muted',
      'elevated',
      'brand',
      'success',
      'warning',
      'error',
      'info',
    ];
    for (const key of newKeys) {
      const value = BG_COLOR[key as keyof typeof BG_COLOR];
      expect(value).not.toContain('dark:');
    }
  });

  test('BORDER_COLOR new keys use CSS variable utilities (no dark: prefix)', () => {
    const newKeys = ['default', 'strong', 'light', 'brand', 'success', 'warning', 'error', 'info'];
    for (const key of newKeys) {
      const value = BORDER_COLOR[key as keyof typeof BORDER_COLOR];
      expect(value).not.toContain('dark:');
    }
  });

  test('new TEXT_COLOR keys snapshot', () => {
    const { primary, secondary, muted, disabled, brand, success, error, warning, info } =
      TEXT_COLOR;
    expect({
      primary,
      secondary,
      muted,
      disabled,
      brand,
      success,
      error,
      warning,
      info,
    }).toMatchSnapshot();
  });

  test('new BG_COLOR keys snapshot', () => {
    const { page, card, muted, elevated, brand, success, warning, error, info } = BG_COLOR;
    expect({
      page,
      card,
      muted,
      elevated,
      brand,
      success,
      warning,
      error,
      info,
    }).toMatchSnapshot();
  });

  test('new BORDER_COLOR keys snapshot', () => {
    const newBorderKeys = {
      default: BORDER_COLOR.default,
      strong: BORDER_COLOR.strong,
      light: BORDER_COLOR.light,
      brand: BORDER_COLOR.brand,
      success: BORDER_COLOR.success,
      warning: BORDER_COLOR.warning,
      error: BORDER_COLOR.error,
      info: BORDER_COLOR.info,
    };
    expect(newBorderKeys).toMatchSnapshot();
  });

  test('DIVIDE_COLOR preserves all keys', () => {
    expect(DIVIDE_COLOR.default).toBeDefined();
    expect(DIVIDE_COLOR.light).toBeDefined();
    expect(DIVIDE_COLOR.lightSoft).toBeDefined();
    expect(DIVIDE_COLOR.lighter).toBeDefined();
  });

  test('deprecated TEXT_COLOR keys preserve original dark: values', () => {
    expect(TEXT_COLOR.tertiary).toBe('text-gray-600 dark:text-gray-400');
    expect(TEXT_COLOR.strong).toBe('text-gray-900 dark:text-white');
    expect(TEXT_COLOR.accent).toBe('text-[#ED6C00]');
    expect(TEXT_COLOR.errorMid).toBe('text-red-500 dark:text-red-400');
  });

  test('deprecated BG_COLOR keys preserve original dark: values', () => {
    expect(BG_COLOR.white).toBe('bg-white dark:bg-gray-800');
    expect(BG_COLOR.gray).toBe('bg-gray-50 dark:bg-gray-900');
    expect(BG_COLOR.primary).toBe('bg-[#ED6C00]');
    expect(BG_COLOR.gradientCard).toBe(
      'bg-gradient-to-br from-gray-100 to-gray-50 dark:from-gray-900 dark:to-gray-800'
    );
  });

  test('deprecated BORDER_COLOR keys preserve original dark: values', () => {
    expect(BORDER_COLOR.dark).toBe('border-gray-300 dark:border-gray-600');
    expect(BORDER_COLOR.whiteAlpha).toBe('border-gray-200 dark:border-white/10');
  });
});
