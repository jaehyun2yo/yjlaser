'use server';

import { hashPassword } from '@/lib/auth/security';
import { logger } from '@/lib/utils/logger';
import { initializeCompanyFolders } from '@/app/actions/webhard';
import { logActivity } from '@/lib/activity-logger';
import { headers } from 'next/headers';
import {
  serverCheckDuplicateUsername,
  serverCheckDuplicateBusinessNumber,
  serverCreateCompany,
  serverUploadCompanyBusinessRegistrationToDrive,
} from '@/lib/api/nestjs-server-client';
import {
  validateRegistrationForm,
  type RegistrationFormValues,
} from '@/lib/validation/register-validation';

const registerLogger = logger.createLogger('REGISTER');

/**
 * 회사 등록 서버 액션
 *
 * 새로운 회사 계정을 등록합니다.
 *
 * @param formData - FormData 객체 (회사 정보, 로그인 정보, 담당자 정보 포함)
 *
 * @remarks
 * - 비밀번호는 bcrypt로 해시화되어 저장됩니다
 * - 등록 후 로그인 페이지로 리디렉션됩니다
 * - 상태는 'pending'으로 설정되어 관리자 승인을 기다립니다
 *
 * @example
 * ```typescript
 * const formData = new FormData();
 * formData.append('company_name', '회사명');
 * formData.append('username', 'company_user');
 * formData.append('password', 'password123');
 * // ... 기타 필드
 *
 * await registerCompany(formData);
 * ```
 */
export async function registerCompany(
  formData: FormData
): Promise<{
  success: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
  fileUploadError?: string;
}> {
  'use server';

  try {
    // 로그인 정보
    const username = String(formData.get('username') || '').trim();
    const password = String(formData.get('password') || '').trim();
    const passwordConfirm = String(formData.get('password_confirm') || '').trim();

    // 업체 정보
    const companyName = String(formData.get('company_name') || '').trim();
    const businessRegistrationNumber = String(
      formData.get('business_registration_number') || ''
    ).trim();
    const representativeName = String(formData.get('representative_name') || '').trim();
    const businessType = String(formData.get('business_type') || '').trim();
    const businessCategory = String(formData.get('business_category') || '').trim();
    const businessAddress = String(formData.get('business_address') || '').trim();
    const businessRegistrationFile = formData.get('business_registration_file') as File | null;

    // 실무담당자 정보
    const managerName = String(formData.get('manager_name') || '').trim();
    const managerPosition = String(formData.get('manager_position') || '').trim();
    const managerPhone = String(formData.get('manager_phone') || '').trim();
    const managerEmail = String(formData.get('manager_email') || '').trim();

    // 회계담당자 정보
    const accountantName = String(formData.get('accountant_name') || '').trim();
    const accountantPhone = String(formData.get('accountant_phone') || '').trim();
    const accountantEmail = String(formData.get('accountant_email') || '').trim();
    const accountantFax = String(formData.get('accountant_fax') || '').trim();

    // 견적서 제공받을 방법 (단일 선택)
    const quoteMethod = String(formData.get('quote_method') || '').trim();
    const quoteMethodEmail = quoteMethod === 'email';
    const quoteMethodFax = quoteMethod === 'fax';
    const quoteMethodSms = quoteMethod === 'sms';

    // 공유 검증 모듈로 전체 폼 검증
    const values: RegistrationFormValues = {
      username,
      password,
      passwordConfirm,
      companyName,
      businessRegistrationNumber,
      representativeName,
      businessType,
      businessCategory,
      businessAddress,
      managerName,
      managerPosition,
      managerPhone,
      managerEmail,
      accountantName,
      accountantPhone,
      accountantEmail,
      accountantFax,
      quoteMethod,
    };

    const validation = validateRegistrationForm(values);
    if (!validation.valid) {
      return { success: false, fieldErrors: validation.fieldErrors };
    }

    // 아이디 중복 확인 (NestJS API)
    try {
      const usernameCheck = await serverCheckDuplicateUsername(username);
      if (usernameCheck.exists) {
        return { success: false, fieldErrors: { username: '이미 사용 중인 아이디입니다.' } };
      }
    } catch {
      return { success: false, error: 'connection_error' };
    }

    // 사업자등록번호 중복 확인 (NestJS API)
    try {
      const businessNumberCheck = await serverCheckDuplicateBusinessNumber(
        businessRegistrationNumber
      );
      if (businessNumberCheck.exists) {
        return {
          success: false,
          fieldErrors: {
            businessRegistrationNumber: '이미 등록된 사업자등록번호입니다.',
          },
        };
      }
    } catch {
      return { success: false, error: 'connection_error' };
    }

    // 비밀번호 해싱
    const passwordHash = await hashPassword(password);

    // 데이터베이스에 저장 (NestJS API) — camelCase 키 (DTO 매칭)
    const insertData = {
      username,
      passwordHash,
      companyName,
      businessRegistrationNumber,
      representativeName,
      businessType: businessType || undefined,
      businessCategory: businessCategory || undefined,
      businessAddress,
      businessRegistrationFileUrl: undefined,
      businessRegistrationFileName: undefined,
      managerName,
      managerPosition,
      managerPhone,
      managerEmail,
      accountantName: accountantName || undefined,
      accountantPhone: accountantPhone || undefined,
      accountantEmail: accountantEmail || undefined,
      accountantFax: accountantFax || undefined,
      quoteMethodEmail,
      quoteMethodFax,
      quoteMethodSms,
    };

    registerLogger.debug('Inserting data', { insertData });

    const createResult = await serverCreateCompany(insertData);

    if (!createResult.success || !createResult.data) {
      registerLogger.error('Database insert error', { error: createResult.error });
      return { success: false, error: 'database_error' };
    }

    if (businessRegistrationFile && businessRegistrationFile.size > 0) {
      const uploadResult = await serverUploadCompanyBusinessRegistrationToDrive(
        createResult.data.id,
        businessRegistrationFile
      );
      if (!uploadResult.success) {
        registerLogger.error('Business registration Drive upload error', {
          companyId: createResult.data.id,
          error: uploadResult.error,
        });
        return { success: true, fileUploadError: 'file_upload_failed' };
      }
    }

    const createdCompany = createResult.data;
    registerLogger.info('Successfully inserted company', { companyId: createdCompany.id });

    // 활동 로그 기록
    if (createdCompany.id) {
      const headersList = await headers();
      const ip = headersList.get('x-forwarded-for') || 'unknown';
      const userAgent = headersList.get('user-agent') || 'unknown';

      await logActivity({
        actorType: 'company',
        actorId: String(createdCompany.id),
        actorName: companyName,
        action: 'REGISTER_COMPANY',
        details: {
          company_name: companyName,
          representative_name: representativeName,
          business_registration_number: businessRegistrationNumber,
        },
        ipAddress: ip,
        userAgent: userAgent,
      });
    }

    // 웹하드 폴더 구조 자동 생성
    if (createdCompany.id) {
      try {
        const folderResult = await initializeCompanyFolders(
          createdCompany.id,
          companyName,
          true // 업체 등록 시에는 인증 체크 건너뛰기
        );
        if (folderResult.success) {
          registerLogger.info('Webhard folders initialized', { companyId: createdCompany.id });
        } else {
          registerLogger.warn('Failed to initialize webhard folders', {
            companyId: createdCompany.id,
            error: folderResult.error,
          });
        }
      } catch (error) {
        registerLogger.error('Error initializing webhard folders', error);
        // 폴더 생성 실패해도 등록은 성공으로 처리
      }
    }

    return { success: true };
  } catch (error) {
    registerLogger.error('Registration error', error);
    return { success: false, error: 'server_error' };
  }
}

export async function createTestAccount() {
  'use server';

  try {
    // 테스트 계정 정보
    const testUsername = `test_${Date.now()}`;
    const testPassword = 'test1234';
    const passwordHash = await hashPassword(testPassword);

    // 아이디 중복 확인 (NestJS API)
    const usernameCheck = await serverCheckDuplicateUsername(testUsername);

    if (usernameCheck.exists) {
      return { success: false };
    }

    // 테스트 계정 생성 (NestJS API) — camelCase 키 (DTO 매칭)
    const testInsertData = {
      username: testUsername,
      passwordHash: passwordHash,
      companyName: '테스트 업체',
      businessRegistrationNumber: `123-45-${Math.floor(Math.random() * 100000)}`,
      representativeName: '테스트 대표',
      businessType: '제조업',
      businessCategory: '포장재 제조',
      businessAddress: '서울시 강남구 테스트로 123',
      managerName: '테스트 담당자',
      managerPosition: '과장',
      managerPhone: '010-1234-5678',
      managerEmail: `test${Date.now()}@example.com`,
      accountantName: '테스트 회계',
      accountantPhone: '010-9876-5432',
      accountantEmail: `accountant${Date.now()}@example.com`,
      accountantFax: '02-1234-5678',
      quoteMethodEmail: true,
      quoteMethodFax: false,
      quoteMethodSms: false,
    };

    registerLogger.info('Inserting test account', { testInsertData });

    const createResult = await serverCreateCompany(testInsertData);

    if (!createResult.success || !createResult.data) {
      registerLogger.error('Database insert error', { error: createResult.error });
      return { success: false };
    }

    registerLogger.info('Successfully created test account', { data: createResult.data });

    // 성공 시 테스트 계정 정보 반환 (모달 표시 후 리디렉션)
    return {
      success: true,
      username: testUsername,
      password: testPassword,
    };
  } catch (error) {
    // Next.js의 redirect()는 NEXT_REDIRECT 에러를 throw하므로 다시 throw
    if (
      error instanceof Error &&
      (error.message === 'NEXT_REDIRECT' ||
        (error as { digest?: string }).digest?.startsWith('NEXT_REDIRECT'))
    ) {
      throw error;
    }

    // 에러는 이미 위에서 처리됨
    return { success: false };
  }
}
