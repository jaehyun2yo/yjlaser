import { getSessionUser } from '@/lib/auth/session';
import { WebhardMain } from './components/WebhardMain';
import { WebhardErrorBoundary } from './components/WebhardErrorBoundary';
import { initializeCompanyFolders } from '@/app/actions/webhard';
import { serverGetCompanyWebhardInfo } from '@/lib/api/nestjs-server-client';
import Link from 'next/link';
import { FaLock } from 'react-icons/fa';
import { BG_COLOR, TEXT_COLOR } from '@/lib/styles';
import { Button } from '@/components/ui/button';
import { logger } from '@/lib/utils/logger';

export const dynamic = 'force-dynamic';

const log = logger.createLogger('WebhardPage');

function WebhardAccessDenied({ title, description }: { title: string; description: string }) {
  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <div className="text-center p-8 max-w-md">
        <div
          className={`w-20 h-20 mx-auto mb-6 rounded-full ${BG_COLOR.error} flex items-center justify-center`}
        >
          <FaLock className={`w-10 h-10 ${TEXT_COLOR.error}`} />
        </div>
        <h1 className={`text-2xl font-bold ${TEXT_COLOR.primary} mb-4`}>{title}</h1>
        <p className={`${TEXT_COLOR.secondary} mb-6`}>
          {description}
          <br />
          문의사항이 있으시면 관리자에게 연락해 주세요.
        </p>
        <Button asChild>
          <Link href="/company/dashboard">대시보드로 이동</Link>
        </Button>
      </div>
    </div>
  );
}

export default async function WebhardPage() {
  // layout에서 이미 검증됨 - 여기서는 userId만 필요
  const user = await getSessionUser();

  if (!user) {
    return null;
  }

  // 관리자는 바로 렌더링
  if (user.userType === 'admin') {
    return (
      <WebhardErrorBoundary>
        <WebhardMain userType={user.userType} userId={String(user.userId)} />
      </WebhardErrorBoundary>
    );
  }

  // 업체 사용자인 경우에만 추가 검증
  if (user.userType === 'company' && user.userId) {
    try {
      // NestJS API에서 업체 웹하드 접근 정보 조회
      log.info('Checking company webhard access', { userId: user.userId, userType: user.userType });
      const companyInfo = await serverGetCompanyWebhardInfo(Number(user.userId));
      log.info('Company webhard info result', {
        userId: user.userId,
        companyInfo: companyInfo
          ? { webhardAccess: companyInfo.webhardAccess, hasRootFolder: companyInfo.hasRootFolder }
          : null,
      });

      if (!companyInfo) {
        return (
          <WebhardAccessDenied
            title="웹하드 접근 정보를 확인할 수 없습니다"
            description="현재 웹하드 접근 권한을 확인할 수 없습니다."
          />
        );
      }

      // 웹하드 접근이 차단된 경우
      if (companyInfo.webhardAccess === false) {
        return (
          <WebhardAccessDenied
            title="웹하드 접근이 제한되었습니다"
            description="관리자에 의해 웹하드 접근이 제한되었습니다."
          />
        );
      }

      // 폴더가 없으면 생성 (동기 처리 - 폴더 초기화 완료 후 렌더링)
      if (!companyInfo.hasRootFolder) {
        await initializeCompanyFolders(Number(user.userId), companyInfo.companyName);
      }
    } catch (error) {
      log.error('Failed to get company webhard info', {
        userId: user.userId,
        userType: user.userType,
        error: error instanceof Error ? error.message : String(error),
      });

      return (
        <WebhardAccessDenied
          title="웹하드 접근 정보를 확인할 수 없습니다"
          description="현재 웹하드 접근 권한을 확인할 수 없습니다."
        />
      );
    }
  }

  return (
    <WebhardErrorBoundary>
      <WebhardMain userType={user.userType} userId={String(user.userId)} />
    </WebhardErrorBoundary>
  );
}
