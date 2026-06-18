import { render, screen } from '@testing-library/react';
import { Input } from '@/components/ui/input';

describe('Input', () => {
  test('renders with default variant', () => {
    render(<Input placeholder="Enter text" />);
    const input = screen.getByPlaceholderText('Enter text');
    expect(input).toHaveClass('border-border');
  });

  test('renders with error variant', () => {
    render(<Input variant="error" placeholder="Error" />);
    const input = screen.getByPlaceholderText('Error');
    expect(input).toHaveClass('border-destructive');
  });

  test('renders with different sizes', () => {
    render(<Input inputSize="sm" placeholder="Small" />);
    expect(screen.getByPlaceholderText('Small')).toHaveClass('text-xs');
  });

  test('renders with large size', () => {
    render(<Input inputSize="lg" placeholder="Large" />);
    expect(screen.getByPlaceholderText('Large')).toHaveClass('text-base');
  });

  test('passes disabled state', () => {
    render(<Input disabled placeholder="Disabled" />);
    expect(screen.getByPlaceholderText('Disabled')).toBeDisabled();
  });

  test('applies custom className', () => {
    render(<Input className="w-full" placeholder="Full" />);
    expect(screen.getByPlaceholderText('Full')).toHaveClass('w-full');
  });
});
