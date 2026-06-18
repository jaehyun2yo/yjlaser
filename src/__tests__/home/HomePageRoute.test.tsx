import { render, screen } from '@testing-library/react';
import Home from '@/app/page';

jest.mock('@/components/home/HomePageV1Backup', () => ({
  __esModule: true,
  default: ({ portfolioItems }: { portfolioItems: unknown[] }) => (
    <main data-testid="home-page-v1" data-portfolio-count={portfolioItems.length} />
  ),
}));

jest.mock('@/components/home/HomePageV2', () => ({
  __esModule: true,
  default: () => <main data-testid="home-page-v2" />,
}));

describe('Home route', () => {
  it('renders the v1 homepage composition', () => {
    render(<Home />);

    expect(screen.getByTestId('home-page-v1')).toHaveAttribute('data-portfolio-count', '0');
    expect(screen.queryByTestId('home-page-v2')).not.toBeInTheDocument();
  });
});
