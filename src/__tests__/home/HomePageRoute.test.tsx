import { render, screen } from '@testing-library/react';
import Home from '@/app/page';

describe('Home route', () => {
  it('renders the Spring/Summer homepage composition', () => {
    render(<Home />);

    expect(screen.getByRole('heading', { name: /New Mold Work/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Project cards' })).toBeInTheDocument();
    expect(screen.getByLabelText('주요 작업 캐러셀')).toBeInTheDocument();
  });
});
