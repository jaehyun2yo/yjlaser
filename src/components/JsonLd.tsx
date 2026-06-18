/**
 * JSON-LD 문자열 보안 이스케이프 처리 (XSS 방지)
 * script 태그 종료 시퀀스 및 HTML 특수문자 이스케이프
 */
function safeJsonLdString(str: string): string {
  return str
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/'/g, '\\u0027')
    .replace(/"/g, '\\u0022');
}

/**
 * 안전한 JSON-LD 객체 생성
 * 모든 문자열 값에 보안 이스케이프 적용
 */
function sanitizeJsonLd(obj: Record<string, unknown>): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string') {
      sanitized[key] = safeJsonLdString(value);
    } else if (Array.isArray(value)) {
      sanitized[key] = value.map((item) =>
        typeof item === 'string'
          ? safeJsonLdString(item)
          : typeof item === 'object' && item !== null
            ? sanitizeJsonLd(item as Record<string, unknown>)
            : item
      );
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitizeJsonLd(value as Record<string, unknown>);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

interface OrganizationJsonLdProps {
  name: string;
  url: string;
  logo: string;
  description: string;
  address: {
    streetAddress: string;
    addressLocality: string;
    addressRegion: string;
    postalCode: string;
    addressCountry: string;
  };
  telephone: string;
}

export function OrganizationJsonLd({
  name,
  url,
  logo,
  description,
  address,
  telephone,
}: OrganizationJsonLdProps) {
  const jsonLd = sanitizeJsonLd({
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name,
    url,
    logo,
    description,
    address: {
      '@type': 'PostalAddress',
      ...address,
    },
    telephone,
  });

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
    />
  );
}

interface LocalBusinessJsonLdProps extends OrganizationJsonLdProps {
  openingHours?: string[];
  priceRange?: string;
}

export function LocalBusinessJsonLd({
  name,
  url,
  logo,
  description,
  address,
  telephone,
  openingHours,
  priceRange,
}: LocalBusinessJsonLdProps) {
  const jsonLd = sanitizeJsonLd({
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    name,
    url,
    logo,
    description,
    address: {
      '@type': 'PostalAddress',
      ...address,
    },
    telephone,
    ...(openingHours && { openingHours }),
    ...(priceRange && { priceRange }),
  });

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
    />
  );
}

interface ProductJsonLdProps {
  name: string;
  description: string;
  image?: string;
  brand?: string;
  category?: string;
}

export function ProductJsonLd({
  name,
  description,
  image,
  brand = '유진레이저목형',
  category,
}: ProductJsonLdProps) {
  const jsonLd = sanitizeJsonLd({
    '@context': 'https://schema.org',
    '@type': 'Product',
    name,
    description,
    ...(image && { image }),
    brand: {
      '@type': 'Brand',
      name: brand,
    },
    ...(category && { category }),
  });

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
    />
  );
}

interface BlogPostingJsonLdProps {
  headline: string;
  description: string;
  datePublished: string;
  url: string;
  author?: string;
}

export function BlogPostingJsonLd({
  headline,
  description,
  datePublished,
  url,
  author = '유진레이저목형',
}: BlogPostingJsonLdProps) {
  const jsonLd = sanitizeJsonLd({
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline,
    description,
    datePublished,
    author: {
      '@type': 'Organization',
      name: author,
    },
    publisher: {
      '@type': 'Organization',
      name: '유진레이저목형',
    },
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': url,
    },
  });

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
    />
  );
}

// CollectionPage JSON-LD (목록 페이지용)
interface CollectionPageJsonLdProps {
  name: string;
  description: string;
  url: string;
  itemCount?: number;
}

export function CollectionPageJsonLd({
  name,
  description,
  url,
  itemCount,
}: CollectionPageJsonLdProps) {
  const jsonLd = sanitizeJsonLd({
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name,
    description,
    url,
    ...(itemCount && { numberOfItems: itemCount }),
    isPartOf: {
      '@type': 'WebSite',
      name: '유진레이저목형',
      url: 'https://www.yjlaser.net',
    },
  });

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
    />
  );
}

// ContactPoint JSON-LD (연락처 페이지용)
interface ContactPointJsonLdProps {
  telephone: string;
  email?: string;
  contactType?: string;
  areaServed?: string;
  availableLanguage?: string[];
}

export function ContactPointJsonLd({
  telephone,
  email,
  contactType = 'customer service',
  areaServed = 'KR',
  availableLanguage = ['Korean'],
}: ContactPointJsonLdProps) {
  const jsonLd = sanitizeJsonLd({
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: '유진레이저목형',
    url: 'https://www.yjlaser.net',
    contactPoint: {
      '@type': 'ContactPoint',
      telephone,
      ...(email && { email }),
      contactType,
      areaServed,
      availableLanguage,
    },
  });

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
    />
  );
}

// AboutPage JSON-LD (회사소개 페이지용)
interface AboutPageJsonLdProps {
  name: string;
  description: string;
  url: string;
}

export function AboutPageJsonLd({ name, description, url }: AboutPageJsonLdProps) {
  const jsonLd = sanitizeJsonLd({
    '@context': 'https://schema.org',
    '@type': 'AboutPage',
    name,
    description,
    url,
    isPartOf: {
      '@type': 'WebSite',
      name: '유진레이저목형',
      url: 'https://www.yjlaser.net',
    },
  });

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
    />
  );
}
