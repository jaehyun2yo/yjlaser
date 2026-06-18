'use client';

/**
 * WebhardMainContainer
 * 웹하드 메인 컨테이너 컴포넌트
 * - WebhardMain에 props 전달
 */

import { WebhardMain } from '@/app/webhard/components/WebhardMain';

interface WebhardMainContainerProps {
  userType: 'admin' | 'company';
  userId: string;
}

export function WebhardMainContainer({ userType, userId }: WebhardMainContainerProps) {
  return <WebhardMain userType={userType} userId={userId} />;
}

export default WebhardMainContainer;
