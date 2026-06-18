import { render, screen } from '@testing-library/react';
import { Card, CardHeader, CardContent, CardFooter } from '@/components/ui/card';

describe('Card', () => {
  test('renders with default variant', () => {
    render(<Card data-testid="card">Content</Card>);
    const card = screen.getByTestId('card');
    expect(card).toBeInTheDocument();
    expect(card).toHaveClass('bg-card');
    expect(card).toHaveClass('shadow-md');
  });

  test('renders with hover variant', () => {
    render(
      <Card variant="hover" data-testid="card">
        Hover
      </Card>
    );
    expect(screen.getByTestId('card')).toHaveClass('hover:shadow-lg');
  });

  test('renders with flat variant', () => {
    render(
      <Card variant="flat" data-testid="card">
        Flat
      </Card>
    );
    const card = screen.getByTestId('card');
    expect(card).toHaveClass('border-border');
    expect(card).not.toHaveClass('shadow-md');
  });

  test('renders with padding variants', () => {
    render(
      <Card padding="sm" data-testid="card">
        Small
      </Card>
    );
    expect(screen.getByTestId('card')).toHaveClass('p-4');
  });

  test('renders compound components', () => {
    render(
      <Card>
        <CardHeader data-testid="header">Header</CardHeader>
        <CardContent data-testid="content">Content</CardContent>
        <CardFooter data-testid="footer">Footer</CardFooter>
      </Card>
    );
    expect(screen.getByTestId('header')).toBeInTheDocument();
    expect(screen.getByTestId('content')).toBeInTheDocument();
    expect(screen.getByTestId('footer')).toBeInTheDocument();
  });

  test('applies custom className', () => {
    render(
      <Card className="custom-class" data-testid="card">
        Custom
      </Card>
    );
    expect(screen.getByTestId('card')).toHaveClass('custom-class');
  });
});
