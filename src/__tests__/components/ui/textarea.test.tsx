import { render, screen } from '@testing-library/react';
import { Textarea } from '@/components/ui/textarea';

describe('Textarea', () => {
  test('renders with default variant', () => {
    render(<Textarea placeholder="Enter text" />);
    const textarea = screen.getByPlaceholderText('Enter text');
    expect(textarea).toHaveClass('border-border');
    expect(textarea).toHaveClass('resize-none');
  });

  test('renders with error variant', () => {
    render(<Textarea variant="error" placeholder="Error" />);
    expect(screen.getByPlaceholderText('Error')).toHaveClass('border-destructive');
  });

  test('renders with different sizes', () => {
    render(<Textarea textareaSize="sm" placeholder="Small" />);
    expect(screen.getByPlaceholderText('Small')).toHaveClass('text-xs');
  });

  test('defaults to 4 rows', () => {
    render(<Textarea placeholder="Rows" />);
    expect(screen.getByPlaceholderText('Rows')).toHaveAttribute('rows', '4');
  });

  test('accepts custom rows', () => {
    render(<Textarea rows={8} placeholder="Custom" />);
    expect(screen.getByPlaceholderText('Custom')).toHaveAttribute('rows', '8');
  });

  test('passes disabled state', () => {
    render(<Textarea disabled placeholder="Disabled" />);
    expect(screen.getByPlaceholderText('Disabled')).toBeDisabled();
  });
});
