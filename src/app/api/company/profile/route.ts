import { verifySession, getSessionUser } from '@/lib/auth/session';
import { hashPassword } from '@/lib/auth/security';
import { revalidatePath } from 'next/cache';
import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { logActivity } from '@/lib/activity-logger';
import {
  serverGetCompany,
  serverUpdateCompany,
  serverCheckDuplicateBusinessNumber,
  serverUploadCompanyBusinessRegistrationToDrive,
} from '@/lib/api/nestjs-server-client';

export async function GET() {
  try {
    const isAuthenticated = await verifySession();
    if (!isAuthenticated) {
      return NextResponse.json({ success: false, error: '인증이 필요합니다.' }, { status: 401 });
    }

    const user = await getSessionUser();
    if (!user?.userId || user.userType !== 'company') {
      return NextResponse.json({ success: false, error: '권한이 없습니다.' }, { status: 403 });
    }

    const company = await serverGetCompany(Number(user.userId));
    if (!company) {
      return NextResponse.json(
        { success: false, error: '업체 정보를 찾을 수 없습니다.' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, company });
  } catch (_error) {
    return NextResponse.json(
      { success: false, error: '서버 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    // 세션 확인
    const isAuthenticated = await verifySession();
    if (!isAuthenticated) {
      return NextResponse.json({ success: false, error: '인증이 필요합니다.' }, { status: 401 });
    }

    const user = await getSessionUser();
    if (!user?.userId || user?.userType !== 'company') {
      return NextResponse.json({ success: false, error: '권한이 없습니다.' }, { status: 403 });
    }

    // 업체 정보 가져오기 (NestJS API)
    const currentCompany = await serverGetCompany(Number(user.userId));

    if (!currentCompany) {
      return NextResponse.json(
        { success: false, error: '업체 정보를 찾을 수 없습니다.' },
        { status: 404 }
      );
    }

    // FormData 파싱
    const formData = await request.formData();

    // 폼 데이터 추출
    const companyName = String(formData.get('company_name') || '').trim();
    const businessRegistrationNumber = String(
      formData.get('business_registration_number') || ''
    ).trim();
    const representativeName = String(formData.get('representative_name') || '').trim();
    const businessType = String(formData.get('business_type') || '').trim();
    const businessCategory = String(formData.get('business_category') || '').trim();
    const businessAddress = String(formData.get('business_address') || '').trim();
    const businessRegistrationFile = formData.get('business_registration_file') as File | null;

    const managerName = String(formData.get('manager_name') || '').trim();
    const managerPosition = String(formData.get('manager_position') || '').trim();
    const managerPhone = String(formData.get('manager_phone') || '').trim();
    const managerEmail = String(formData.get('manager_email') || '').trim();

    const accountantName = String(formData.get('accountant_name') || '').trim();
    const accountantPhone = String(formData.get('accountant_phone') || '').trim();
    const accountantEmail = String(formData.get('accountant_email') || '').trim();
    const accountantFax = String(formData.get('accountant_fax') || '').trim();

    const quoteMethod = String(formData.get('quote_method') || '').trim();
    const quoteMethodEmail = quoteMethod === 'email';
    const quoteMethodFax = quoteMethod === 'fax';
    const quoteMethodSms = quoteMethod === 'sms';

    const newPassword = String(formData.get('new_password') || '').trim();
    const newPasswordConfirm = String(formData.get('new_password_confirm') || '').trim();

    // 필수 필드 검증
    if (!companyName || !businessRegistrationNumber || !representativeName || !businessAddress) {
      return NextResponse.json(
        { success: false, error: '필수 항목을 모두 입력해주세요.' },
        { status: 400 }
      );
    }

    if (!managerName || !managerPosition || !managerPhone || !managerEmail) {
      return NextResponse.json(
        { success: false, error: '실무담당자 정보를 모두 입력해주세요.' },
        { status: 400 }
      );
    }

    // 비밀번호 변경 검증
    if (newPassword || newPasswordConfirm) {
      if (newPassword !== newPasswordConfirm) {
        return NextResponse.json(
          { success: false, error: '비밀번호와 비밀번호 확인이 일치하지 않습니다.' },
          { status: 400 }
        );
      }
      if (newPassword.length < 8) {
        return NextResponse.json(
          { success: false, error: '비밀번호는 최소 8자 이상이어야 합니다.' },
          { status: 400 }
        );
      }
    }

    // 사업자등록번호 중복 확인 (본인 제외, NestJS API)
    if (businessRegistrationNumber !== currentCompany.business_registration_number) {
      const bizCheck = await serverCheckDuplicateBusinessNumber(
        businessRegistrationNumber,
        Number(user.userId)
      );

      if (bizCheck.exists) {
        return NextResponse.json(
          { success: false, error: '이미 등록된 사업자등록번호입니다.' },
          { status: 400 }
        );
      }
    }

    // 사업자등록증 파일 업로드
    const businessRegistrationFileUrl = currentCompany.business_registration_file_url;
    const businessRegistrationFileName = currentCompany.business_registration_file_name;

    if (businessRegistrationFile && businessRegistrationFile.size > 0) {
      // 파일 크기 제한 (10MB)
      if (businessRegistrationFile.size > 10 * 1024 * 1024) {
        return NextResponse.json(
          { success: false, error: '파일 크기는 10MB 이하여야 합니다.' },
          { status: 400 }
        );
      }
    }

    // 업데이트 데이터 준비
    const updateData: {
      company_name: string;
      business_registration_number: string;
      representative_name: string;
      business_type: string | null;
      business_category: string | null;
      business_address: string;
      business_registration_file_url: string | null;
      business_registration_file_name: string | null;
      manager_name: string;
      manager_position: string;
      manager_phone: string;
      manager_email: string;
      accountant_name: string | null;
      accountant_phone: string | null;
      accountant_email: string | null;
      accountant_fax: string | null;
      quote_method_email: boolean;
      quote_method_fax: boolean;
      quote_method_sms: boolean;
      updated_at: string;
      password_hash?: string;
    } = {
      company_name: companyName,
      business_registration_number: businessRegistrationNumber,
      representative_name: representativeName,
      business_type: businessType || null,
      business_category: businessCategory || null,
      business_address: businessAddress,
      business_registration_file_url: businessRegistrationFileUrl,
      business_registration_file_name: businessRegistrationFileName,
      manager_name: managerName,
      manager_position: managerPosition,
      manager_phone: managerPhone,
      manager_email: managerEmail,
      accountant_name: accountantName || null,
      accountant_phone: accountantPhone || null,
      accountant_email: accountantEmail || null,
      accountant_fax: accountantFax || null,
      quote_method_email: quoteMethodEmail,
      quote_method_fax: quoteMethodFax,
      quote_method_sms: quoteMethodSms,
      updated_at: new Date().toISOString(),
    };

    // 비밀번호 변경
    if (newPassword) {
      const passwordHash = await hashPassword(newPassword);
      updateData.password_hash = passwordHash;
    }

    // 데이터베이스 업데이트 (NestJS API)
    const updateResult = await serverUpdateCompany(Number(user.userId), updateData);

    if (!updateResult.success) {
      return NextResponse.json(
        { success: false, error: '정보 수정에 실패했습니다.' },
        { status: 500 }
      );
    }

    if (businessRegistrationFile && businessRegistrationFile.size > 0) {
      const uploadResult = await serverUploadCompanyBusinessRegistrationToDrive(
        Number(user.userId),
        businessRegistrationFile
      );
      if (!uploadResult.success) {
        return NextResponse.json(
          { success: false, error: uploadResult.error || '파일 업로드에 실패했습니다.' },
          { status: 500 }
        );
      }
    }

    // 비밀번호 변경 시 활동 로그 기록
    if (newPassword) {
      const headersList = await headers();
      await logActivity({
        actorType: 'company',
        actorId: String(user.userId),
        actorName: currentCompany.company_name,
        action: 'PASSWORD_CHANGE',
        resourceType: 'company',
        resourceId: String(user.userId),
        details: {
          companyName: currentCompany.company_name,
        },
        ipAddress: headersList.get('x-forwarded-for') || 'unknown',
        userAgent: headersList.get('user-agent') || 'unknown',
      });
    }

    // 페이지 캐시 무효화
    revalidatePath('/company/profile');
    revalidatePath('/company/dashboard');

    return NextResponse.json({ success: true });
  } catch (_error) {
    return NextResponse.json(
      { success: false, error: '서버 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
