import { render, screen } from '@testing-library/react';
import Home from '@/app/page';

describe('Home route', () => {
  it('renders the restored V1 homepage composition', async () => {
    render(<Home />);

    expect(
      screen.getByRole('heading', { level: 1, name: /패\s*키\s*지\s+완\s*성\s*도/ })
    ).toBeInTheDocument();
    expect(screen.getByText('Packaging Structure Design')).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: /패키지\s*갤러리/ })).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /문의하기/ })[0]).toHaveAttribute(
      'href',
      '/contact'
    );
    expect(screen.getAllByRole('link', { name: /포트폴리오 보기/ })[0]).toHaveAttribute(
      'href',
      '/portfolio'
    );
  });
});
