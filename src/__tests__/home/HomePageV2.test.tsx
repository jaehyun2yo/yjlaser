import { render, screen } from '@testing-library/react';
import HomePageV2 from '@/components/home/HomePageV2';

describe('HomePageV2', () => {
  it('marks the dark follow-up band for inverse header contrast', () => {
    render(<HomePageV2 />);

    const followUpBand = screen.getByText('YJ Laser Mold').closest('section');

    expect(followUpBand).toHaveAttribute('data-header-theme', 'dark');
  });
});
