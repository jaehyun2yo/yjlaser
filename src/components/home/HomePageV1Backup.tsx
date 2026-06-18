import dynamic from 'next/dynamic';
import HeroBoxSection from '@/components/home/HeroBoxSection';

const BoxNetSection = dynamic(() => import('@/components/home/BoxNetSection'), {
  ssr: true,
});
const ProcessSection = dynamic(() => import('@/components/home/ProcessSection'), {
  ssr: true,
});
const PortfolioSection = dynamic(() => import('@/components/home/PortfolioSection'), {
  ssr: true,
});
const InquirySection = dynamic(() => import('@/components/home/InquirySection'), {
  ssr: true,
});

interface PortfolioItem {
  id: string;
  title: string;
  field: string;
  images: string[];
}

interface HomePageV1BackupProps {
  portfolioItems: PortfolioItem[];
}

export default function HomePageV1Backup({ portfolioItems }: HomePageV1BackupProps) {
  return (
    <main className="min-h-screen scroll-smooth bg-white">
      <HeroBoxSection />
      <BoxNetSection />
      <ProcessSection />
      <div className="h-64 bg-gradient-to-b from-[#0a0a0a] to-white md:h-80" />
      <PortfolioSection items={portfolioItems} />
      <div className="h-64 bg-gradient-to-b from-white to-[#0a0a0a] md:h-80" />
      <InquirySection />
    </main>
  );
}
