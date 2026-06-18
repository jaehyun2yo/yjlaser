import { FaLightbulb, FaEye, FaHeart, FaRocket } from 'react-icons/fa';
import Link from 'next/link';

const VALUES = [
  {
    icon: FaLightbulb,
    title: '미션',
    description:
      '고객사의 기대를 뛰어넘는 지속 가능하고 안정적인 솔루션을 제공함으로써 고객사의 가치를 높입니다.',
    color: 'from-orange-500 to-amber-500',
  },
  {
    icon: FaEye,
    title: '비전',
    description:
      '우리의 패키지 설계는 제품과 사람을 연결하는 매개체이며, 지속가능한 성장을 바라봅니다.',
    color: 'from-blue-500 to-cyan-500',
  },
  {
    icon: FaHeart,
    title: '핵심 가치',
    description: '정직, 품질, 안전 - 이 세 가지 가치가 우리의 모든 결정과 행동의 기반이 됩니다.',
    color: 'from-rose-500 to-pink-500',
  },
  {
    icon: FaRocket,
    title: '목표',
    description: '인쇄 시장에서 기술 혁신과 지속 가능성의 선두 주자가 되는 것입니다.',
    color: 'from-violet-500 to-purple-500',
  },
];

export default function AboutUsSection() {
  return (
    <section
      data-header-theme="light"
      className="py-24 md:py-32 bg-gradient-to-b from-white to-gray-50"
    >
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          {/* Section Header */}
          <div className="text-center mb-20 animate-fadeInUp">
            <span className="inline-block px-4 py-2 bg-[#ED6C00]/10 text-[#ED6C00] text-sm font-medium rounded-full mb-6">
              Our Values
            </span>
            <h2 className="text-4xl md:text-5xl font-bold text-gray-900 mb-6">
              우리가 추구하는 <span className="text-[#ED6C00]">가치</span>
            </h2>
            <p className="text-gray-600 text-lg max-w-3xl mx-auto leading-relaxed">
              우리의 서비스는 기술과 창의적 전문성의 결합으로 특별합니다. 신뢰를 구축하고 충성도
              높은 파트너십을 확립하는 서비스를 제공합니다.
            </p>
          </div>

          {/* Value Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {VALUES.map((value, index) => (
              <div
                key={value.title}
                className="group relative animate-stagger-item"
                style={{ animationDelay: `${index * 0.1}s` }}
              >
                <div className="relative bg-white rounded-2xl p-8 shadow-lg hover:shadow-2xl transition-all duration-500 border border-gray-100 h-full overflow-hidden">
                  {/* Background gradient on hover */}
                  <div
                    className={`absolute inset-0 bg-gradient-to-br ${value.color} opacity-0 group-hover:opacity-5 transition-opacity duration-500`}
                  />

                  {/* Icon */}
                  <div
                    className={`relative w-14 h-14 rounded-xl bg-gradient-to-br ${value.color} flex items-center justify-center mb-6 shadow-lg group-hover:scale-110 transition-transform duration-300`}
                  >
                    <value.icon className="text-white text-xl" />
                  </div>

                  {/* Content */}
                  <h3 className="relative text-xl font-bold text-gray-900 mb-3 group-hover:text-[#ED6C00] transition-colors">
                    {value.title}
                  </h3>
                  <p className="relative text-gray-600 leading-relaxed text-sm">
                    {value.description}
                  </p>

                  {/* Decorative corner */}
                  <div className="absolute -bottom-2 -right-2 w-20 h-20 bg-gray-50 rounded-tl-3xl opacity-50" />
                </div>
              </div>
            ))}
          </div>

          {/* Bottom CTA */}
          <div className="text-center mt-16 animate-fadeInUp animate-delay-500">
            <p className="text-gray-500 mb-6">더 자세한 정보가 필요하신가요?</p>
            <Link
              href="/about"
              className="inline-flex items-center gap-2 px-5 py-2.5 text-sm bg-gray-900 text-white font-semibold rounded-full hover:bg-[#ED6C00] transition-all duration-300 shadow-lg hover:shadow-xl"
            >
              회사 소개 보기
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M17 8l4 4m0 0l-4 4m4-4H3"
                />
              </svg>
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
