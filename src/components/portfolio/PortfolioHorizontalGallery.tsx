'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import Image from 'next/image';
import { motion } from 'framer-motion';
import { gsap } from 'gsap';
import { ScrollToPlugin } from 'gsap/ScrollToPlugin';
import { Draggable } from 'gsap/dist/Draggable';
import { transparentBlurDataURL } from '@/lib/images/placeholder';
import { BG_COLOR } from '@/lib/styles';

// GSAP 플러그인 등록
if (typeof window !== 'undefined') {
  gsap.registerPlugin(ScrollToPlugin, Draggable);
}

interface PortfolioItem {
  id: string; // UUID
  title: string;
  field: string;
  purpose: string;
  type: string;
  format: string;
  size: string;
  paper: string;
  printing: string;
  finishing: string;
  description: string;
  images: string[] | Array<{ original: string; thumbnail?: string; medium?: string }>;
  created_at: string;
}

interface PortfolioHorizontalGalleryProps {
  items: PortfolioItem[];
  filteredItems?: PortfolioItem[];
}

// 이미지 URL 추출 헬퍼 함수
function getImageUrl(item: PortfolioItem): string | null {
  if (!item.images || item.images.length === 0) return null;
  const firstImage = item.images[0];
  if (typeof firstImage === 'string') return firstImage;
  return firstImage.medium || firstImage.thumbnail || firstImage.original;
}

// 슬라이드 카드 컴포넌트
function PortfolioSlideCard({
  item,
  index,
  onClick,
  cardRef,
  isVisible = true,
}: {
  item: PortfolioItem;
  index: number;
  onClick: (event: React.MouseEvent<HTMLDivElement>) => void;
  cardRef?: (el: HTMLDivElement | null) => void;
  isVisible?: boolean;
}) {
  const imageUrl = getImageUrl(item);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [displayedText, setDisplayedText] = useState('');

  // 타이핑 애니메이션 효과
  useEffect(() => {
    if (!isHovered) {
      setDisplayedText('');
      return;
    }

    const text = item.title;
    let currentIndex = 0;
    setDisplayedText('');

    const typingInterval = setInterval(() => {
      if (currentIndex < text.length) {
        setDisplayedText(text.slice(0, currentIndex + 1));
        currentIndex++;
      } else {
        clearInterval(typingInterval);
      }
    }, 30); // 각 글자마다 30ms 간격 (이전 50ms에서 더 빠르게)

    return () => clearInterval(typingInterval);
  }, [isHovered, item.title]);

  return (
    <motion.div
      ref={cardRef}
      className="relative cursor-pointer flex-shrink-0 group
        w-[180px] h-[250px]
        md:w-[220px] md:h-[310px]
        lg:w-[250px] lg:h-[350px]"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={onClick}
      initial={{
        scale: 0.8,
        y: 50,
        opacity: 0,
      }}
      animate={
        isVisible && imageLoaded
          ? {
              scale: 1,
              y: 0,
              opacity: 1,
            }
          : {
              scale: 0.8,
              y: 50,
              opacity: 0,
            }
      }
      transition={{
        duration: 0.6,
        delay: index * 0.08,
        ease: [0.25, 0.46, 0.45, 0.94],
        scale: { duration: 0.5 },
        y: { duration: 0.6 },
        opacity: { duration: 0.4 },
      }}
    >
      {imageUrl ? (
        <div className="relative w-full h-full overflow-hidden shadow-lg bg-gray-900">
          <Image
            src={imageUrl}
            alt={item.title}
            fill
            className="object-cover transition-opacity duration-300"
            sizes="(max-width: 768px) 180px, (max-width: 1024px) 220px, 250px"
            quality={100}
            placeholder="blur"
            blurDataURL={transparentBlurDataURL}
            priority={index < 6}
            onLoad={() => setImageLoaded(true)}
            style={{ opacity: imageLoaded ? 1 : 0 }}
          />
        </div>
      ) : (
        <div className="w-full h-full bg-gray-800 flex items-center justify-center">
          <span className="text-gray-500 text-xs">No Image</span>
        </div>
      )}
      {/* 호버 시 카드 외부 하단에 나타나는 프로젝트명 (타이핑 애니메이션) */}
      {isHovered && (
        <motion.div
          className="absolute left-1/2 -translate-x-1/2 whitespace-nowrap pointer-events-none"
          style={{ top: 'calc(100% + 15px)' }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <p className="text-white text-xs md:text-sm font-medium text-center drop-shadow-lg">
            {displayedText}
            <motion.span
              animate={{ opacity: [1, 0] }}
              transition={{
                duration: 0.6,
                repeat: Infinity,
                repeatType: 'reverse',
              }}
              className="inline-block w-0.5 h-4 bg-white ml-0.5 align-middle"
            />
          </p>
        </motion.div>
      )}
    </motion.div>
  );
}

export function PortfolioHorizontalGallery({
  items,
  filteredItems,
}: PortfolioHorizontalGalleryProps) {
  const displayItems = filteredItems && filteredItems.length > 0 ? filteredItems : items;
  const [selectedItem, setSelectedItem] = useState<PortfolioItem | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // 카드 위치 저장 (닫기 애니메이션을 위해)
  const cardPositionRef = useRef<{
    item: PortfolioItem;
    rect: DOMRect;
    element: HTMLElement;
  } | null>(null);

  // 상세 페이지 닫기 핸들러 (역방향 애니메이션)
  const handleCloseModal = useCallback(() => {
    if (!selectedItem || !cardPositionRef.current) {
      setSelectedItem(null);
      return;
    }

    const { item, rect: cardImageRect, element: cardImageContainer } = cardPositionRef.current;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const viewportCenterX = viewportWidth / 2;
    const _viewportCenterY = viewportHeight / 2;

    // 상세 페이지의 헤더 이미지 찾기
    const modalElement = document.querySelector('[data-portfolio-modal]') as HTMLElement;
    if (!modalElement) {
      setSelectedItem(null);
      return;
    }

    const headerImageContainer = modalElement.querySelector(
      'div[class*="relative"]'
    ) as HTMLElement;
    if (!headerImageContainer) {
      setSelectedItem(null);
      return;
    }

    const _headerImageRect = headerImageContainer.getBoundingClientRect();
    const imageUrl = getImageUrl(item);
    if (!imageUrl) {
      setSelectedItem(null);
      return;
    }

    // 이미지 로드 후 실제 크기 확인
    const img = document.createElement('img');
    img.src = imageUrl;

    img.onload = () => {
      const imageNaturalWidth = img.naturalWidth;
      const imageNaturalHeight = img.naturalHeight;
      const imageAspectRatio = imageNaturalWidth / imageNaturalHeight;
      const viewportAspectRatio = viewportWidth / viewportHeight;

      // 모달 이미지의 실제 렌더링 크기 가져오기 (정확한 크기 계산)
      // headerImageContainer의 실제 렌더링 크기 사용
      const modalImageRect = headerImageContainer.getBoundingClientRect();
      let currentWidth: number;
      let currentHeight: number;

      // 실제 렌더링된 크기가 있으면 사용, 없으면 계산된 크기 사용
      if (modalImageRect.width > 0 && modalImageRect.height > 0) {
        currentWidth = modalImageRect.width;
        currentHeight = modalImageRect.height;
      } else {
        // 폴백: 계산된 크기 사용
        if (imageAspectRatio > viewportAspectRatio) {
          currentHeight = viewportHeight;
          currentWidth = viewportHeight * imageAspectRatio;
        } else {
          currentWidth = viewportWidth;
          currentHeight = viewportWidth / imageAspectRatio;
        }
      }

      // 상세 페이지 헤더 이미지 숨기기
      gsap.set(headerImageContainer, { opacity: 0 });

      // 공유 요소 생성 (모달 이미지의 정확한 크기와 위치에서 시작)
      const sharedElement = document.createElement('div');
      sharedElement.className = 'fixed z-[150] overflow-hidden bg-background';
      sharedElement.style.width = `${currentWidth}px`;
      sharedElement.style.height = `${currentHeight}px`;
      sharedElement.style.left = `${viewportCenterX - currentWidth / 2}px`;
      sharedElement.style.top = `0px`;
      sharedElement.style.willChange = 'transform, width, height, left, top';

      // 고화질 원본 이미지 사용
      const sharedImage = document.createElement('img');
      sharedImage.src = imageUrl;
      sharedImage.style.width = '100%';
      sharedImage.style.height = '100%';
      sharedImage.style.objectFit = 'cover';
      sharedImage.style.display = 'block';
      sharedElement.appendChild(sharedImage);

      document.body.appendChild(sharedElement);

      // 카드 위치가 화면 밖에 있을 수 있으므로, 현재 보이는 위치로 조정
      const cardRect = cardImageRect;
      const cardLeft = Math.max(0, Math.min(cardRect.left, viewportWidth - cardRect.width));
      const cardTop = Math.max(0, Math.min(cardRect.top, viewportHeight - cardRect.height));

      // 공유 요소 전환 애니메이션: 화면 전체에서 카드 위치로 축소
      gsap.to(sharedElement, {
        width: cardRect.width,
        height: cardRect.height,
        left: cardLeft,
        top: cardTop,
        duration: 0.8,
        ease: 'power2.inOut',
        onComplete: () => {
          if (sharedElement.parentNode) {
            document.body.removeChild(sharedElement);
          }
          gsap.set(cardImageContainer, { opacity: 1 });
          cardPositionRef.current = null;
        },
      });

      // 상세 페이지 페이드아웃 (공유 요소 애니메이션과 동시에)
      gsap.to(modalElement, {
        opacity: 0,
        duration: 0.2,
        ease: 'power2.in',
        onComplete: () => {
          setSelectedItem(null);
        },
      });
    };

    img.onerror = () => {
      setSelectedItem(null);
    };
  }, [selectedItem]);

  // 상세 페이지 열림/닫힘에 따라 body 스크롤 제어 및 ESC 키 처리
  useEffect(() => {
    if (selectedItem) {
      document.body.style.overflow = 'hidden';

      const handleEscape = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          handleCloseModal();
        }
      };

      window.addEventListener('keydown', handleEscape);

      return () => {
        window.removeEventListener('keydown', handleEscape);
        document.body.style.overflow = '';
      };
    } else {
      document.body.style.overflow = '';
    }

    return () => {
      document.body.style.overflow = '';
    };
  }, [selectedItem, handleCloseModal]);

  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [cardsVisible, setCardsVisible] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const draggableRef = useRef<Draggable | null>(null);
  const _scrollTweenRef = useRef<gsap.core.Tween | null>(null);
  const cardRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const modalImageRef = useRef<HTMLDivElement>(null);

  const [cardWidth, setCardWidth] = useState(180);
  const [cardGap, setCardGap] = useState(16);
  const [windowWidth, setWindowWidth] = useState(0);

  // 반응형 카드 크기 및 간격 설정
  useEffect(() => {
    const updateCardSize = () => {
      const width = window.innerWidth;
      setWindowWidth(width);
      if (width >= 1024) {
        setCardWidth(250);
        setCardGap(24);
      } else if (width >= 768) {
        setCardWidth(220);
        setCardGap(20);
      } else {
        setCardWidth(180);
        setCardGap(16);
      }
    };

    updateCardSize();
    window.addEventListener('resize', updateCardSize);

    return () => {
      window.removeEventListener('resize', updateCardSize);
    };
  }, []);

  // 초기 로드 애니메이션
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsInitialLoad(false);
      setTimeout(() => {
        setCardsVisible(true);
      }, 100);
    }, 800);

    return () => clearTimeout(timer);
  }, []);

  // 필터 변경 시 카드 애니메이션 재시작
  useEffect(() => {
    if (displayItems.length > 0) {
      setCardsVisible(false);
      const timer = setTimeout(() => {
        setCardsVisible(true);
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [displayItems]);

  // 필터 변경 시 부드러운 전환 애니메이션
  useEffect(() => {
    if (!wrapperRef.current || displayItems.length === 0) return;

    const wrapper = wrapperRef.current;

    gsap.to(wrapper, {
      opacity: 0,
      duration: 0.3,
      ease: 'power2.inOut',
      onComplete: () => {
        const slideWidth = cardWidth + cardGap;
        const totalWidth = displayItems.length * slideWidth;
        const visibleCardsCount = Math.floor(window.innerWidth / slideWidth);
        const shouldEnableInfiniteLoop = displayItems.length > visibleCardsCount;
        const centerOffset = shouldEnableInfiniteLoop
          ? totalWidth
          : (window.innerWidth - totalWidth) / 2;
        gsap.set(wrapper, {
          x: shouldEnableInfiniteLoop ? -centerOffset : centerOffset,
          opacity: 1,
        });
        setSelectedIndex(0);
      },
    });
  }, [displayItems, cardWidth, cardGap]);

  // GSAP 수평 스크롤 초기화
  useEffect(() => {
    const isPortfolioPage = window.location.pathname === '/portfolio';
    if (
      !isPortfolioPage ||
      displayItems.length === 0 ||
      !containerRef.current ||
      !wrapperRef.current
    )
      return;

    const container = containerRef.current;
    const wrapper = wrapperRef.current;

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const slideWidth = cardWidth + cardGap;
    const visibleCardsCount = Math.floor(window.innerWidth / slideWidth);
    const shouldEnableInfiniteLoop = displayItems.length > visibleCardsCount;

    const totalWidth = displayItems.length * slideWidth;
    const centerOffset = shouldEnableInfiniteLoop
      ? totalWidth
      : (window.innerWidth - totalWidth) / 2;

    let currentX = shouldEnableInfiniteLoop ? -centerOffset : centerOffset;
    let targetX = shouldEnableInfiniteLoop ? -centerOffset : centerOffset;
    let animationId: number | null = null;
    let isAnimating = false;

    const updateScroll = () => {
      const diff = targetX - currentX;

      if (Math.abs(diff) < 0.01) {
        currentX = targetX;
        gsap.set(wrapper, { x: currentX });
        isAnimating = false;
        animationId = null;
        return;
      }

      const distance = Math.abs(diff);
      let smoothFactor: number;

      if (distance > 100) {
        smoothFactor = 0.12;
      } else if (distance > 50) {
        smoothFactor = 0.08;
      } else if (distance > 10) {
        smoothFactor = 0.05;
      } else {
        smoothFactor = 0.03;
      }

      currentX += diff * smoothFactor;

      if (shouldEnableInfiniteLoop) {
        if (currentX < -centerOffset - totalWidth) {
          currentX += totalWidth;
          targetX += totalWidth;
        } else if (currentX > -centerOffset + totalWidth) {
          currentX -= totalWidth;
          targetX -= totalWidth;
        }
      } else {
        if (totalWidth <= window.innerWidth) {
          const centerX = (window.innerWidth - totalWidth) / 2;
          currentX = centerX;
          targetX = centerX;
        } else {
          const minX = 0;
          const maxX = window.innerWidth - totalWidth;
          if (currentX > minX) {
            currentX = minX;
            targetX = minX;
          } else if (currentX < maxX) {
            currentX = maxX;
            targetX = maxX;
          }
          if (targetX > minX) {
            targetX = minX;
          } else if (targetX < maxX) {
            targetX = maxX;
          }
        }
      }

      gsap.set(wrapper, {
        x: currentX,
        force3D: true,
        willChange: 'transform',
      });

      let relativeX;
      if (shouldEnableInfiniteLoop) {
        relativeX = currentX + centerOffset;
      } else {
        relativeX = -currentX;
      }
      const slideIndex = Math.round(-relativeX / slideWidth);
      const realIndex =
        ((slideIndex % displayItems.length) + displayItems.length) % displayItems.length;
      setSelectedIndex(realIndex);

      animationId = requestAnimationFrame(updateScroll);
    };

    const handleWheel = (e: WheelEvent) => {
      const modalOpen = document.querySelector('[data-portfolio-modal]');
      if (modalOpen) return;

      if (!shouldEnableInfiniteLoop && totalWidth <= window.innerWidth) {
        return;
      }

      e.preventDefault();
      e.stopPropagation();

      const delta = e.deltaY || e.deltaX;
      if (shouldEnableInfiniteLoop) {
        targetX -= delta * 1.5;
      } else {
        targetX += delta * 1.5;
      }

      if (!isAnimating) {
        isAnimating = true;
        animationId = requestAnimationFrame(updateScroll);
      }
    };

    if (draggableRef.current) {
      draggableRef.current.kill();
    }

    let draggableBounds;
    if (shouldEnableInfiniteLoop) {
      draggableBounds = { minX: -centerOffset - totalWidth, maxX: -centerOffset + totalWidth };
    } else {
      if (totalWidth <= window.innerWidth) {
        const centerX = (window.innerWidth - totalWidth) / 2;
        draggableBounds = { minX: centerX, maxX: centerX };
      } else {
        const minX = 0;
        const maxX = window.innerWidth - totalWidth;
        draggableBounds = { minX, maxX };
      }
    }

    draggableRef.current = Draggable.create(wrapper, {
      type: 'x',
      bounds: draggableBounds,
      inertia: true,
      dragResistance: 0.02,
      throwResistance: 4000,
      ease: 'power1.out',
      onDrag: function () {
        currentX = this.x;
        targetX = this.x;

        if (shouldEnableInfiniteLoop) {
          if (currentX < -centerOffset - totalWidth) {
            const offset = currentX - (-centerOffset - totalWidth);
            currentX = -centerOffset + offset;
            this.x = currentX;
            targetX = currentX;
          } else if (currentX > -centerOffset + totalWidth) {
            const offset = currentX - (-centerOffset + totalWidth);
            currentX = -centerOffset - totalWidth + offset;
            this.x = currentX;
            targetX = currentX;
          }
        }

        let relativeX;
        if (shouldEnableInfiniteLoop) {
          relativeX = currentX + centerOffset;
        } else {
          relativeX = -currentX;
        }
        const slideIndex = Math.round(-relativeX / slideWidth);
        const realIndex =
          ((slideIndex % displayItems.length) + displayItems.length) % displayItems.length;
        setSelectedIndex(realIndex);
      },
      onThrowUpdate: function () {
        currentX = this.x;
        targetX = this.x;

        if (shouldEnableInfiniteLoop) {
          if (currentX < -centerOffset - totalWidth) {
            const offset = currentX - (-centerOffset - totalWidth);
            currentX = -centerOffset + offset;
            this.x = currentX;
            targetX = currentX;
          } else if (currentX > -centerOffset + totalWidth) {
            const offset = currentX - (-centerOffset + totalWidth);
            currentX = -centerOffset - totalWidth + offset;
            this.x = currentX;
            targetX = currentX;
          }
        }

        let relativeX;
        if (shouldEnableInfiniteLoop) {
          relativeX = currentX + centerOffset;
        } else {
          relativeX = -currentX;
        }
        const slideIndex = Math.round(-relativeX / slideWidth);
        const realIndex =
          ((slideIndex % displayItems.length) + displayItems.length) % displayItems.length;
        setSelectedIndex(realIndex);
      },
    })[0];

    gsap.set(wrapper, {
      x: shouldEnableInfiniteLoop ? -centerOffset : centerOffset,
      opacity: 1,
    });

    container.addEventListener('wheel', handleWheel, { passive: false });

    return () => {
      document.body.style.overflow = originalOverflow;
      container.removeEventListener('wheel', handleWheel);
      if (draggableRef.current) {
        draggableRef.current.kill();
      }
      if (animationId !== null) {
        cancelAnimationFrame(animationId);
      }
      if (_scrollTweenRef.current) {
        _scrollTweenRef.current.kill();
      }
    };
  }, [displayItems.length, cardWidth, cardGap]);

  // 카드 클릭 핸들러
  const handleCardClick = (item: PortfolioItem, cardElement: HTMLDivElement) => {
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const viewportCenterX = viewportWidth / 2;
    const viewportCenterY = viewportHeight / 2;

    const cardImageContainer = cardElement.querySelector('div[class*="relative"]') as HTMLElement;
    const cardImage = cardElement.querySelector('img') as HTMLImageElement;

    if (!cardImage || !cardImageContainer) {
      setSelectedItem(item);
      return;
    }

    const cardImageRect = cardImageContainer.getBoundingClientRect();

    const imageUrl = getImageUrl(item);
    if (!imageUrl) {
      setSelectedItem(item);
      return;
    }

    const img = document.createElement('img');
    img.src = imageUrl;

    img.onload = () => {
      const imageNaturalWidth = img.naturalWidth;
      const imageNaturalHeight = img.naturalHeight;
      const imageAspectRatio = imageNaturalWidth / imageNaturalHeight;
      const viewportAspectRatio = viewportWidth / viewportHeight;

      let targetWidth: number;
      let targetHeight: number;

      if (imageAspectRatio > viewportAspectRatio) {
        targetHeight = viewportHeight;
        targetWidth = viewportHeight * imageAspectRatio;
      } else {
        targetWidth = viewportWidth;
        targetHeight = viewportWidth / imageAspectRatio;
      }

      const cardImageCenterX = cardImageRect.left + cardImageRect.width / 2;
      const cardImageCenterY = cardImageRect.top + cardImageRect.height / 2;

      cardPositionRef.current = {
        item,
        rect: cardImageRect,
        element: cardImageContainer,
      };

      gsap.set(cardImageContainer, { opacity: 0 });

      const sharedElement = document.createElement('div');
      sharedElement.className = 'fixed z-[150] overflow-hidden ${BG_COLOR.darker}';
      sharedElement.style.width = `${cardImageRect.width}px`;
      sharedElement.style.height = `${cardImageRect.height}px`;
      sharedElement.style.left = `${cardImageRect.left}px`;
      sharedElement.style.top = `${cardImageRect.top}px`;
      sharedElement.style.willChange = 'transform, width, height, left, top';

      const sharedImage = document.createElement('img');
      sharedImage.src = imageUrl;
      sharedImage.style.width = '100%';
      sharedImage.style.height = '100%';
      sharedImage.style.objectFit = 'cover';
      sharedImage.style.display = 'block';
      sharedElement.appendChild(sharedImage);

      document.body.appendChild(sharedElement);

      const finalLeft = viewportCenterX - targetWidth / 2;
      const finalTop = 0;

      gsap.to(sharedElement, {
        width: targetWidth,
        height: targetHeight,
        left: finalLeft,
        top: finalTop,
        duration: 0.8,
        ease: 'power2.out',
        onComplete: () => {
          // 모달을 먼저 렌더링 (배경이 즉시 보이도록)
          setSelectedItem(item);

          // 모달이 렌더링될 때까지 대기
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              const showModalImage = () => {
                const modalImage = document.querySelector(
                  '[data-portfolio-modal] div[class*="relative"]'
                ) as HTMLElement;
                if (modalImage) {
                  const img = modalImage.querySelector('img');
                  if (img && img.complete && img.naturalWidth > 0) {
                    // 모달 이미지를 먼저 보이게 설정 (opacity: 1)
                    gsap.set(modalImage, { opacity: 1 });

                    // sharedElement를 즉시 제거 (모달 이미지가 이미 보이므로)
                    if (sharedElement.parentNode) {
                      document.body.removeChild(sharedElement);
                    }
                  } else {
                    setTimeout(showModalImage, 50);
                  }
                } else {
                  setTimeout(showModalImage, 50);
                }
              };

              showModalImage();
            });
          });

          gsap.set(cardImageContainer, { opacity: 1 });
        },
      });
    };

    img.onerror = () => {
      setSelectedItem(item);
    };
  };

  const duplicatedItems = useMemo(() => {
    if (displayItems.length === 0) return [];

    const slideWidth = cardWidth + cardGap;
    const visibleCardsCount = windowWidth > 0 ? Math.floor(windowWidth / slideWidth) : 0;
    const shouldEnableInfiniteLoop = displayItems.length > visibleCardsCount;

    return shouldEnableInfiniteLoop
      ? [...displayItems, ...displayItems, ...displayItems]
      : displayItems;
  }, [displayItems, cardWidth, cardGap, windowWidth]);

  return (
    <>
      {isInitialLoad && (
        <motion.div
          className="fixed inset-0 bg-black z-[200] pointer-events-none"
          initial={{ opacity: 1 }}
          animate={{ opacity: 0 }}
          transition={{ duration: 0.8, ease: 'easeInOut' }}
          onAnimationComplete={() => setIsInitialLoad(false)}
        />
      )}

      <div
        ref={containerRef}
        className="fixed inset-0 bg-black overflow-hidden z-[50]"
        style={{ height: '100vh', width: '100vw' }}
      >
        {displayItems.length === 0 ? (
          <div className="flex items-center justify-center w-full h-full">
            <p className="text-sm text-gray-400">공개 가능한 포트폴리오는 정리 중입니다.</p>
          </div>
        ) : (
          <div className="h-full w-full flex items-center overflow-hidden">
            <div
              ref={wrapperRef}
              className="flex items-center"
              style={{
                gap: `${cardGap}px`,
                ...(displayItems.length > Math.floor((windowWidth || 1920) / (cardWidth + cardGap))
                  ? {
                      paddingLeft: `calc(50% - ${cardWidth / 2}px)`,
                      paddingRight: `calc(50% - ${cardWidth / 2}px)`,
                    }
                  : {}),
              }}
            >
              {duplicatedItems.map((item, index) => {
                const originalIndex = index % displayItems.length;
                return (
                  <div
                    key={`${item.id}-${index}`}
                    style={{
                      width: `${cardWidth}px`,
                      height: '100vh',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    <PortfolioSlideCard
                      item={item}
                      index={originalIndex}
                      isVisible={cardsVisible}
                      onClick={(e) => {
                        const cardElement = e.currentTarget as HTMLDivElement;
                        handleCardClick(item, cardElement);
                      }}
                      cardRef={(el) => {
                        const uniqueKey = `${item.id}-${index}`;
                        if (el) {
                          cardRefs.current.set(Number(uniqueKey.replace('-', '')), el);
                        } else {
                          cardRefs.current.delete(Number(uniqueKey.replace('-', '')));
                        }
                      }}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {displayItems.length > 0 && (
        <div className="fixed bottom-6 left-1/2 transform -translate-x-1/2 z-50">
          <span className="text-white text-sm font-light tracking-wide">
            {selectedIndex + 1} - {displayItems.length}
          </span>
        </div>
      )}

      {selectedItem && (
        <>
          {/* 닫기 버튼 - Portal을 사용하여 body에 직접 렌더링하여 완전히 고정 */}
          {mounted &&
            createPortal(
              <button
                onClick={handleCloseModal}
                className="fixed top-6 right-6 z-[150] p-2 rounded-full bg-card/80 backdrop-blur-sm hover:bg-card transition-colors text-foreground border border-border/30"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>,
              document.body
            )}

          <div
            data-portfolio-modal
            ref={modalImageRef}
            className="fixed inset-0 z-[100] overflow-y-auto"
            style={{
              background: 'rgba(255, 255, 255, 0.1)',
              backdropFilter: 'blur(20px) saturate(180%)',
              WebkitBackdropFilter: 'blur(20px) saturate(180%)',
            }}
          >
            {/* 헤더 이미지 영역 - 배경 없음 */}
            <div className="relative w-full h-screen bg-transparent">
              {(() => {
                const imageUrl = getImageUrl(selectedItem);
                return imageUrl ? (
                  <div className="relative w-full h-full z-10" style={{ opacity: 0 }}>
                    <Image
                      src={imageUrl}
                      alt={selectedItem.title}
                      fill
                      className="object-cover"
                      quality={100}
                      unoptimized
                      priority
                      onLoad={(e) => {
                        // 이미지 로드 완료 후 opacity를 즉시 1로 설정
                        // sharedElement와의 전환은 handleCardClick에서 처리
                        const target = e.currentTarget.parentElement;
                        if (target) {
                          gsap.set(target, { opacity: 1 });
                        }
                      }}
                    />
                  </div>
                ) : null;
              })()}
            </div>

            {/* 콘텐츠 영역 - 포트폴리오 네비게이션과 동일한 배경색 */}
            <div
              className="text-white"
              style={{
                background: 'rgba(255, 255, 255, 0.1)',
                backdropFilter: 'blur(20px) saturate(180%)',
                WebkitBackdropFilter: 'blur(20px) saturate(180%)',
              }}
            >
              <div className="max-w-4xl mx-auto px-6 py-12 space-y-8">
                <div>
                  <h1 className="text-3xl font-bold mb-4 text-white">{selectedItem.title}</h1>
                </div>

                {Array.isArray(selectedItem.images) && selectedItem.images.length > 1 && (
                  <div className="space-y-6">
                    {selectedItem.images.slice(1).map((img, idx) => {
                      const imageUrl =
                        typeof img === 'string' ? img : img.medium || img.original || img.thumbnail;
                      return imageUrl ? (
                        <div
                          key={idx}
                          className={`relative w-full ${BG_COLOR.lightDark} rounded-lg overflow-hidden`}
                        >
                          <Image
                            src={imageUrl}
                            alt={`${selectedItem.title} - 이미지 ${idx + 2}`}
                            width={1200}
                            height={800}
                            className="w-full h-auto object-contain"
                            quality={100}
                            unoptimized
                          />
                        </div>
                      ) : null;
                    })}
                  </div>
                )}

                <div className="space-y-6">
                  <div className="grid grid-cols-2 gap-6">
                    <div>
                      <label className="text-sm text-white/70 block mb-2">분야</label>
                      <p className="text-base text-white">{selectedItem.field}</p>
                    </div>
                    <div>
                      <label className="text-sm text-white/70 block mb-2">목적</label>
                      <p className="text-base text-white">{selectedItem.purpose}</p>
                    </div>
                    <div>
                      <label className="text-sm text-white/70 block mb-2">종류</label>
                      <p className="text-base text-white">{selectedItem.type}</p>
                    </div>
                    <div>
                      <label className="text-sm text-white/70 block mb-2">형태</label>
                      <p className="text-base text-white">{selectedItem.format}</p>
                    </div>
                  </div>

                  {selectedItem.description && (
                    <div>
                      <label className="text-sm text-white/70 block mb-2">설명</label>
                      <p className="text-base text-white whitespace-pre-line leading-relaxed">
                        {selectedItem.description}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}
