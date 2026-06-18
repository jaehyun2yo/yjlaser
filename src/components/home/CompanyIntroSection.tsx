import Link from 'next/link';

export default function CompanyIntroSection() {
  return (
    <section
      data-header-theme="dark"
      className="relative py-32 md:py-40 bg-gradient-to-b from-black via-gray-900 to-white overflow-hidden"
    >
      {/* Background decorative elements */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-[#ED6C00]/5 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-[#ED6C00]/5 rounded-full blur-3xl" />
      </div>

      <div className="container mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="flex flex-col lg:flex-row items-center gap-16 max-w-7xl mx-auto">
          {/* Left Side - Image */}
          <div className="w-full lg:w-5/12 animate-slideInLeft">
            <div className="relative">
              {/* Main image container */}
              <div className="aspect-[4/5] bg-gradient-to-br from-gray-800 to-gray-900 rounded-2xl overflow-hidden shadow-2xl border border-white/10">
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="text-center">
                    <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-white/10 flex items-center justify-center">
                      <svg
                        className="w-10 h-10 text-white/40"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={1.5}
                          d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                        />
                      </svg>
                    </div>
                    <span className="text-white/30 text-sm">Company Photo</span>
                  </div>
                </div>
              </div>

              {/* Floating accent card */}
              <div className="absolute -bottom-6 -right-6 bg-[#ED6C00] text-white p-6 rounded-xl shadow-xl animate-fadeInUp animate-delay-500">
                <div className="text-4xl font-bold">15+</div>
                <div className="text-sm text-white/80">Years Experience</div>
              </div>
            </div>
          </div>

          {/* Right Side - Content */}
          <div className="w-full lg:w-7/12 animate-slideInRight">
            <div className="text-white">
              {/* Badge */}
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-white/10 backdrop-blur-sm rounded-full mb-6 animate-fadeIn animate-delay-300">
                <span className="w-2 h-2 bg-[#ED6C00] rounded-full animate-pulse" />
                <span className="text-sm text-white/80 tracking-wide">About Us</span>
              </div>

              {/* Title */}
              <h2 className="text-4xl md:text-5xl lg:text-6xl font-bold mb-8 leading-tight">
                프리미엄 목형의
                <br />
                <span className="text-[#ED6C00]">새로운 기준</span>
              </h2>

              {/* Description */}
              <p className="text-white/70 text-lg leading-relaxed mb-6">
                21년의 패키지 목형제작 경력으로 인쇄 산업에서 신뢰할 수 있는 파트너로 자리매김하게
                되었습니다.
              </p>
              <p className="text-white/70 text-lg leading-relaxed mb-10">
                맞춤 지기구조 와 세밀한 목형작업을 통해 고객사의 제품의 가치를 높입니다.
              </p>

              {/* Stats */}
              <div className="grid grid-cols-3 gap-6 mb-10">
                {[
                  { number: '500+', label: '완료 프로젝트' },
                  { number: '100+', label: '파트너사' },
                  { number: '99%', label: '고객 만족도' },
                ].map((stat, index) => (
                  <div
                    key={stat.label}
                    className="text-center md:text-left animate-fadeInUp"
                    style={{ animationDelay: `${0.6 + index * 0.1}s` }}
                  >
                    <div className="text-3xl md:text-4xl font-bold text-white mb-1">
                      {stat.number}
                    </div>
                    <div className="text-sm text-white/50">{stat.label}</div>
                  </div>
                ))}
              </div>

              {/* CTA Button */}
              <div className="animate-fadeInUp animate-delay-700">
                <Link
                  href="/about"
                  className="group inline-flex items-center gap-2 bg-white text-gray-900 px-5 py-2.5 text-sm rounded-full font-semibold hover:bg-[#ED6C00] hover:text-white transition-all duration-300 shadow-lg hover:shadow-xl"
                >
                  <span>더 알아보기</span>
                  <svg
                    className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
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
        </div>
      </div>
    </section>
  );
}
