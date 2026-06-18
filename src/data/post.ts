// src/data/posts.ts

export interface Post {
  id: string;
  title: string;
  content: string;
}

export const posts: Post[] = [
  {
    id: 'welcome-to-nextjs',
    title: 'Next.js 15 버전을 환영합니다!',
    content: '서버 컴포넌트와 최신 기능들을 통해 더 나은 웹사이트를 만들어보세요.',
  },
  {
    id: 'new-product-launch',
    title: '신제품 출시 안내',
    content: '오랫동안 기다려온 제품 A가 드디어 출시되었습니다. 많은 관심 부탁드립니다.',
  },
  {
    id: 'server-maintenance',
    title: '서버 점검 안내 (10/26)',
    content:
      '보다 안정적인 서비스 제공을 위해 10월 26일 새벽 2시부터 4시까지 서버 점검이 있을 예정입니다.',
  },
];
