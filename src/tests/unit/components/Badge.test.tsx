import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { Badge } from '@/components/Badge';

describe('Badge', () => {
  it('keeps one-digit badges centered in a fixed circular box', () => {
    render(<Badge count={3} />);

    const badge = screen.getByText('3');
    expect(badge).toHaveStyle({
      width: '18px',
      minWidth: '18px',
      height: '18px',
      padding: '0px',
      boxSizing: 'border-box',
    });
  });
});
