import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * 특정 라우트에서 ApiKeyGuard 인증을 건너뛰는 데코레이터.
 * 공개 폼 제출 등 인증 없이 접근해야 하는 엔드포인트에 사용.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
