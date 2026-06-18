import { act, fireEvent, render, screen } from '@testing-library/react';
import HeroPackageStructureSection from '@/components/home/HeroPackageStructureSection';

describe('HeroPackageStructureSection', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('renders the v2 hero copy, ivory background, and drawing asset slide', () => {
    const { container } = render(<HeroPackageStructureSection />);

    const heroWordmark = screen.getByRole('heading', { name: /shape it right/i });
    expect(heroWordmark).toBeInTheDocument();
    expect(heroWordmark).toHaveStyle({
      position: 'absolute',
      fontSize: 'clamp(2rem, calc(14vw - 1rem), 10.5rem)',
    });
    expect(screen.getByRole('img', { name: 'A형 지기구조 도안' })).toHaveAttribute(
      'src',
      '/images/box-shapes/a-box.png'
    );
    expect(screen.queryByText('Packaging Structure Design')).not.toBeInTheDocument();
    expect(screen.queryByText('패키지 완성도는 지기구조에서 결정됩니다')).not.toBeInTheDocument();
    expect(screen.queryByText('기본 박스 구조의 기준이 되는 전개 도안')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '문의하기' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '포트폴리오 보기' })).not.toBeInTheDocument();
    expect(container.firstElementChild).toHaveClass('bg-stone-50');
    expect(container.firstElementChild).toHaveStyle({
      height: 'clamp(620px, 78vh, 720px)',
    });
  });

  it('shows a forced loading percentage for 1.5 seconds before revealing the hero', () => {
    jest.useFakeTimers();

    render(<HeroPackageStructureSection />);

    expect(screen.getByRole('status', { name: '홈페이지 로딩' })).toHaveTextContent('%');

    act(() => {
      jest.advanceTimersByTime(1500);
    });

    expect(screen.queryByRole('status', { name: '홈페이지 로딩' })).not.toBeInTheDocument();
  });

  it('applies mouse-driven 3D movement to the drawing and grid but not to the wordmark', () => {
    const { container } = render(<HeroPackageStructureSection />);
    const section = container.firstElementChild as HTMLElement;

    fireEvent.mouseMove(section, { clientX: 900, clientY: 120 });

    expect(screen.getByTestId('package-structure-visual').style.transform).toContain('rotateX');
    expect(screen.getByTestId('package-structure-grid').style.transform).toContain('rotateX');
    expect(screen.getByRole('heading', { name: /shape it right/i })).toHaveStyle({
      transform: 'translateX(-50%)',
    });
  });

  it('moves drawing slides with arrow controls', () => {
    render(<HeroPackageStructureSection />);

    expect(screen.getByTestId('package-structure-track')).toHaveStyle({
      transform: 'translateX(-0%)',
    });

    fireEvent.click(screen.getByRole('button', { name: '다음 도안 보기' }));

    expect(screen.getByTestId('package-structure-track')).toHaveStyle({
      transform: 'translateX(-100%)',
    });

    fireEvent.click(screen.getByRole('button', { name: '이전 도안 보기' }));

    expect(screen.getByTestId('package-structure-track')).toHaveStyle({
      transform: 'translateX(-0%)',
    });
  });
});
