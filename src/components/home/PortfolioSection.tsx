import Link from 'next/link';
import Image from 'next/image';
import { FaArrowRight, FaImages, FaEye } from 'react-icons/fa';

interface PortfolioItem {
  id: string; // UUID
  title: string;
  field: string;
  images: string[];
}

interface PortfolioSectionProps {
  items: PortfolioItem[];
}

// 데이터가 없을 경우 기본 플레이스홀더
const PLACEHOLDER_PROJECTS = [
  { id: 1, title: '럭셔리 향수 박스', field: '프리미엄 포장', imageCount: 12 },
  { id: 2, title: '전자제품 패키지', field: '테크 포장', imageCount: 8 },
  { id: 3, title: '리테일 디스플레이', field: '디스플레이', imageCount: 15 },
  { id: 4, title: '화장품 케이스', field: '뷰티 포장', imageCount: 10 },
  { id: 5, title: '식품 패키지', field: '식품 포장', imageCount: 7 },
  { id: 6, title: '선물 박스', field: '기프트 포장', imageCount: 9 },
];

export default function PortfolioSection({ items }: PortfolioSectionProps) {
  // 실제 데이터가 있으면 사용, 없으면 플레이스홀더 사용
  const displayItems =
    items.length > 0
      ? items.map((item) => ({
          id: item.id,
          title: item.title,
          category: item.field,
          image: item.images?.[0] || null,
          imageCount: item.images?.length || 0,
        }))
      : PLACEHOLDER_PROJECTS.map((p) => ({
          id: p.id,
          title: p.title,
          category: p.field,
          image: null,
          imageCount: p.imageCount,
        }));

  return (
    <section
      data-header-theme="light"
      className="pt-24 pb-24 md:pt-32 md:pb-32 bg-white relative overflow-hidden"
    >
      {/* 배경 장식 */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-20 right-0 w-[500px] h-[500px] bg-[#ED6C00]/[0.03] rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-orange-100/50 rounded-full blur-3xl" />
      </div>

      <div className="container mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        {/* Section Header */}
        <div className="text-center mb-16 animate-fadeInUp">
          <span className="inline-block px-4 py-2 bg-[#ED6C00]/10 text-[#ED6C00] text-sm font-semibold rounded-full mb-6">
            Our Portfolio
          </span>
          <h2 className="text-4xl md:text-5xl lg:text-6xl font-extrabold text-gray-900 mb-6 tracking-tight">
            패키지 <span className="text-[#ED6C00]">갤러리</span>
          </h2>
          <p className="text-gray-600 text-lg max-w-2xl mx-auto">
            다양한 업종의 맞춤형 패키지 솔루션을 확인하세요
          </p>
        </div>

        {/* Portfolio Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8">
          {displayItems.map((project, index) => (
            <div
              key={project.id}
              className="group animate-stagger-item"
              style={{ animationDelay: `${index * 0.1}s` }}
            >
              <Link href={`/portfolio?item=${project.id}`} className="block">
                {/* 카드 컨테이너 */}
                <div className="relative bg-white rounded-3xl overflow-hidden shadow-lg hover:shadow-2xl transition-all duration-500 border border-gray-100 hover:border-[#ED6C00]/30">
                  {/* 이미지 영역 */}
                  <div className="relative aspect-[4/3] overflow-hidden bg-gradient-to-br from-gray-100 to-gray-200">
                    {project.image ? (
                      <Image
                        src={project.image}
                        alt={project.title}
                        fill
                        className="object-cover transition-transform duration-700 group-hover:scale-110"
                        sizes="(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 33vw"
                      />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-[#ED6C00]/5 to-orange-50">
                        <div className="text-center">
                          <div className="w-16 h-16 mx-auto mb-3 rounded-2xl bg-[#ED6C00]/10 flex items-center justify-center">
                            <FaImages className="w-7 h-7 text-[#ED6C00]" />
                          </div>
                          <p className="text-gray-400 text-sm">이미지 준비중</p>
                        </div>
                      </div>
                    )}

                    {/* 호버 오버레이 */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-all duration-500">
                      {/* 보기 버튼 */}
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center shadow-xl opacity-0 group-hover:opacity-100 transition-all duration-300 delay-100">
                          <FaEye className="w-6 h-6 text-[#ED6C00]" />
                        </div>
                      </div>

                      {/* 하단 정보 */}
                      <div className="absolute bottom-0 left-0 right-0 p-5 translate-y-2 group-hover:translate-y-0 transition-transform duration-300">
                        <p className="text-white/80 text-sm">클릭하여 갤러리 보기</p>
                      </div>
                    </div>

                    {/* 이미지 개수 뱃지 */}
                    {project.imageCount > 0 && (
                      <div className="absolute top-4 right-4 px-3 py-1.5 bg-black/60 backdrop-blur-sm rounded-full flex items-center gap-1.5">
                        <FaImages className="w-3 h-3 text-white" />
                        <span className="text-white text-xs font-medium">{project.imageCount}</span>
                      </div>
                    )}
                  </div>

                  {/* 콘텐츠 영역 */}
                  <div className="p-6">
                    {/* 카테고리 */}
                    <span className="inline-block px-3 py-1 bg-[#ED6C00]/10 text-[#ED6C00] text-xs font-semibold rounded-full mb-3">
                      {project.category}
                    </span>

                    {/* 제목 */}
                    <h3 className="text-xl font-bold text-gray-900 mb-3 group-hover:text-[#ED6C00] transition-colors duration-300">
                      {project.title}
                    </h3>

                    {/* CTA */}
                    <div className="flex items-center justify-between">
                      <span className="text-gray-500 text-sm">갤러리 보기</span>
                      <div className="w-10 h-10 rounded-full bg-gray-100 group-hover:bg-[#ED6C00] flex items-center justify-center transition-all duration-300">
                        <FaArrowRight className="w-4 h-4 text-gray-400 group-hover:text-white group-hover:translate-x-0.5 transition-all duration-300" />
                      </div>
                    </div>
                  </div>
                </div>
              </Link>
            </div>
          ))}
        </div>

        {/* CTA 버튼 */}
        <div className="mt-16 text-center animate-fadeInUp animate-delay-500">
          <Link
            href="/portfolio"
            className="inline-flex items-center gap-3 px-8 py-4 bg-gray-900 text-white font-semibold rounded-full hover:bg-[#ED6C00] transition-all duration-300 shadow-lg hover:shadow-xl group"
          >
            전체 포트폴리오 보기
            <FaArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform duration-300" />
          </Link>
        </div>
      </div>
    </section>
  );
}
