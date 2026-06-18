// src/app/login/page.tsx

import { redirect } from 'next/navigation';
import { verifyAndGetUser } from '@/lib/auth/session';
import { loginAction } from '@/app/actions/auth';
import { LoginForm } from './LoginForm';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  // 이미 로그인된 경우 적절한 페이지로 리디렉션 (1회 호출로 통합)
  const { isValid, user } = await verifyAndGetUser();
  if (isValid) {
    if (user?.userType === 'company') {
      redirect('/company/dashboard');
    } else {
      redirect('/admin');
    }
  }

  const params = await searchParams;
  const error = params?.error;
  const nextPath = params?.next;
  let errorMessage = '';

  if (error === 'invalid') {
    errorMessage = '아이디 또는 비밀번호가 올바르지 않습니다.';
  } else if (error === 'server') {
    errorMessage = '서버 오류가 발생했습니다. 잠시 후 다시 시도해주세요.';
  } else if (error === 'locked') {
    errorMessage = '너무 많은 로그인 시도로 인해 계정이 일시적으로 잠겼습니다.';
  } else if (error === 'inactive') {
    errorMessage = '계정이 비활성화되어 있습니다. 관리자에게 문의하세요.';
  } else if (error === 'pending_approval') {
    errorMessage = '관리자 승인 대기 중입니다. 관리자에게 문의해주세요.';
  } else if (error === 'rate_limit') {
    errorMessage =
      '너무 많은 로그인 시도로 인해 일시적으로 차단되었습니다. 잠시 후 다시 시도해주세요.';
  }

  return <LoginForm loginAction={loginAction} errorMessage={errorMessage} nextPath={nextPath} />;
}
