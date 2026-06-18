import { render, screen } from '@testing-library/react';
import { Badge } from '@/components/ui/badge';

describe('Badge', () => {
  test('renders with default variant', () => {
    render(<Badge>Default</Badge>);
    expect(screen.getByText('Default')).toBeInTheDocument();
  });

  test('renders each status variant', () => {
    const variants = ['success', 'warning', 'error', 'info'] as const;
    for (const variant of variants) {
      const { unmount } = render(<Badge variant={variant}>{variant}</Badge>);
      expect(screen.getByText(variant)).toBeInTheDocument();
      unmount();
    }
  });

  test('renders with gray variant by default', () => {
    render(<Badge>Gray</Badge>);
    expect(screen.getByText('Gray')).toHaveClass('bg-muted');
  });

  test('renders with primary variant', () => {
    render(<Badge variant="primary">Primary</Badge>);
    expect(screen.getByText('Primary')).toHaveClass('bg-brand-light');
  });

  test('renders with size variants', () => {
    const { unmount } = render(<Badge size="sm">Small</Badge>);
    expect(screen.getByText('Small')).toHaveClass('px-1.5');
    unmount();

    render(<Badge size="lg">Large</Badge>);
    expect(screen.getByText('Large')).toHaveClass('px-2.5');
  });

  test('applies custom className', () => {
    render(<Badge className="custom-class">Custom</Badge>);
    expect(screen.getByText('Custom')).toHaveClass('custom-class');
  });
});
