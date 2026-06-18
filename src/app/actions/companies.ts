'use server';

import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { logActivity } from '@/lib/activity-logger';
import { getSessionUser, verifySession } from '@/lib/auth/session';
import { hashPassword } from '@/lib/auth/security';
import { logger } from '@/lib/utils/logger';
import {
  serverGetCompany,
  serverUpdateCompany,
  serverUpdateCompanyStatus,
  serverToggleWebhardAccess,
  serverToggleLaserOnly,
  serverApproveCompany,
  serverDeleteCompany,
  serverRestoreCompany,
  serverCheckDuplicateBusinessNumber,
  serverUploadCompanyBusinessRegistrationToDrive,
} from '@/lib/api/nestjs-server-client';
import type { VoidActionResult } from '@/lib/types/api';

const companiesLogger = logger.createLogger('COMPANIES_ACTIONS');

/**
 * 업체 상태 변경 서버 액션
 */
export async function updateCompanyStatus(
  companyId: number,
  status: 'active' | 'inactive' | 'pending'
): Promise<VoidActionResult> {
  try {
    // 관리자 권한 검사
    const isAuthenticated = await verifySession();
    const user = await getSessionUser();

    if (!isAuthenticated || user?.userType !== 'admin') {
      companiesLogger.warn('Unauthorized attempt to update company status', { companyId });
      return { success: false, error: '관리자 권한이 필요합니다.' };
    }

    // NestJS API 경유로 업체 상태 변경
    const result = await serverUpdateCompanyStatus(companyId, status);

    if (!result.success) {
      companiesLogger.error('Error updating company status:', result.error);
      return { success: false, error: result.error || '업체 상태 변경에 실패했습니다.' };
    }

    // 활동 로그 기록
    const headersList = await headers();

    await logActivity({
      actorType: 'admin',
      actorId: String(user.userId),
      actorName: 'Admin',
      action: 'COMPANY_STATUS_CHANGE',
      resourceType: 'company',
      resourceId: String(companyId),
      details: {
        companyName: result.company?.company_name,
        previousStatus: result.previousStatus,
        newStatus: status,
        autoApproved: status === 'active',
      },
      ipAddress: headersList.get('x-forwarded-for') || 'unknown',
      userAgent: headersList.get('user-agent') || 'unknown',
    });

    // 페이지 캐시 무효화
    revalidatePath('/admin/companies');
    revalidatePath(`/admin/companies/${companyId}`);

    return { success: true };
  } catch (error) {
    companiesLogger.error('Update company status error:', error);
    return { success: false, error: '서버 오류가 발생했습니다.' };
  }
}

/**
 * 업체 웹하드 접근 권한 토글 서버 액션
 */
export async function toggleWebhardAccess(
  companyId: number,
  allowed: boolean
): Promise<VoidActionResult> {
  try {
    // 관리자 권한 검사
    const isAuthenticated = await verifySession();
    const user = await getSessionUser();

    if (!isAuthenticated || user?.userType !== 'admin') {
      companiesLogger.warn('Unauthorized attempt to toggle webhard access', { companyId });
      return { success: false, error: '관리자 권한이 필요합니다.' };
    }

    // NestJS API 경유로 웹하드 접근 토글
    const result = await serverToggleWebhardAccess(companyId, allowed);

    if (!result.success) {
      companiesLogger.error('Error updating webhard access:', result.error);
      return { success: false, error: result.error || '웹하드 접근 변경에 실패했습니다.' };
    }

    // 활동 로그 기록
    const headersList = await headers();

    await logActivity({
      actorType: 'admin',
      actorId: String(user.userId),
      actorName: 'Admin',
      action: 'PERMISSION_CHANGE',
      resourceType: 'company',
      resourceId: String(companyId),
      details: {
        permissionType: 'webhard_access',
        previousValue: result.previousAccess,
        newValue: allowed,
      },
      ipAddress: headersList.get('x-forwarded-for') || 'unknown',
      userAgent: headersList.get('user-agent') || 'unknown',
    });

    // 페이지 캐시 무효화
    revalidatePath('/admin/companies');
    revalidatePath(`/admin/companies/${companyId}`);

    return { success: true };
  } catch (error) {
    companiesLogger.error('Toggle webhard access error:', error);
    return { success: false, error: '서버 오류가 발생했습니다.' };
  }
}

/**
 * 업체 레이저 전용 설정 토글 서버 액션
 */
export async function toggleLaserOnly(
  companyId: number,
  laserOnly: boolean
): Promise<VoidActionResult> {
  try {
    // 관리자 권한 검사
    const isAuthenticated = await verifySession();
    const user = await getSessionUser();

    if (!isAuthenticated || user?.userType !== 'admin') {
      companiesLogger.warn('Unauthorized attempt to toggle laser only', { companyId });
      return { success: false, error: '관리자 권한이 필요합니다.' };
    }

    // NestJS API 경유로 레이저 전용 토글
    const result = await serverToggleLaserOnly(companyId, laserOnly);

    if (!result.success) {
      companiesLogger.error('Error toggling laser only:', result.error);
      return { success: false, error: result.error || '레이저 전용 설정 변경에 실패했습니다.' };
    }

    // 활동 로그 기록
    const headersList = await headers();

    await logActivity({
      actorType: 'admin',
      actorId: String(user.userId),
      actorName: 'Admin',
      action: 'PERMISSION_CHANGE',
      resourceType: 'company',
      resourceId: String(companyId),
      details: {
        permissionType: 'laser_only',
        previousValue: result.previousLaserOnly,
        newValue: laserOnly,
      },
      ipAddress: headersList.get('x-forwarded-for') || 'unknown',
      userAgent: headersList.get('user-agent') || 'unknown',
    });

    // 페이지 캐시 무효화
    revalidatePath('/admin/companies');
    revalidatePath(`/admin/companies/${companyId}`);

    return { success: true };
  } catch (error) {
    companiesLogger.error('Toggle laser only error:', error);
    return { success: false, error: '서버 오류가 발생했습니다.' };
  }
}

/**
 * 업체 승인 서버 액션
 * 관리자가 신규 업체를 승인하여 로그인을 허용합니다.
 */
export async function approveCompany(companyId: number): Promise<VoidActionResult> {
  try {
    // 관리자 권한 검사
    const isAuthenticated = await verifySession();
    const user = await getSessionUser();

    if (!isAuthenticated || user?.userType !== 'admin') {
      companiesLogger.warn('Unauthorized attempt to approve company', { companyId });
      return { success: false, error: '관리자 권한이 필요합니다.' };
    }

    // NestJS API 경유로 업체 승인
    const result = await serverApproveCompany(companyId, String(user.userId));

    if (!result.success) {
      companiesLogger.error('Error approving company:', result.error);
      return { success: false, error: result.error || '업체 승인에 실패했습니다.' };
    }

    if (result.alreadyApproved) {
      return { success: false, error: '이미 승인된 업체입니다.' };
    }

    // 활동 로그 기록
    const headersList = await headers();

    await logActivity({
      actorType: 'admin',
      actorId: String(user.userId),
      actorName: 'Admin',
      action: 'COMPANY_STATUS_CHANGE',
      resourceType: 'company',
      resourceId: String(companyId),
      details: {
        companyName: result.company?.company_name,
        previousStatus: result.previousStatus,
        newStatus: 'active',
        action: 'approve',
      },
      ipAddress: headersList.get('x-forwarded-for') || 'unknown',
      userAgent: headersList.get('user-agent') || 'unknown',
    });

    companiesLogger.info('Company approved', {
      companyId,
      companyName: result.company?.company_name,
    });

    // 페이지 캐시 무효화
    revalidatePath('/admin/companies');
    revalidatePath(`/admin/companies/${companyId}`);

    return { success: true };
  } catch (error) {
    companiesLogger.error('Approve company error:', error);
    return { success: false, error: '서버 오류가 발생했습니다.' };
  }
}

/**
 * 업체 승인 거절 서버 액션
 */
export async function rejectCompany(companyId: number, reason?: string): Promise<VoidActionResult> {
  try {
    // 관리자 권한 검사
    const isAuthenticated = await verifySession();
    const user = await getSessionUser();

    if (!isAuthenticated || user?.userType !== 'admin') {
      companiesLogger.warn('Unauthorized attempt to reject company', { companyId });
      return { success: false, error: '관리자 권한이 필요합니다.' };
    }

    // NestJS API 경유로 업체 거절 (상태를 inactive로 변경)
    const result = await serverUpdateCompanyStatus(companyId, 'inactive');

    if (!result.success) {
      companiesLogger.error('Error rejecting company:', result.error);
      return { success: false, error: result.error || '업체 거절에 실패했습니다.' };
    }

    // 활동 로그 기록
    const headersList = await headers();

    await logActivity({
      actorType: 'admin',
      actorId: String(user.userId),
      actorName: 'Admin',
      action: 'COMPANY_STATUS_CHANGE',
      resourceType: 'company',
      resourceId: String(companyId),
      details: {
        companyName: result.company?.company_name,
        previousStatus: result.previousStatus,
        newStatus: 'inactive',
        action: 'reject',
        reason: reason || 'No reason provided',
      },
      ipAddress: headersList.get('x-forwarded-for') || 'unknown',
      userAgent: headersList.get('user-agent') || 'unknown',
    });

    companiesLogger.info('Company rejected', {
      companyId,
      companyName: result.company?.company_name,
      reason,
    });

    // 페이지 캐시 무효화
    revalidatePath('/admin/companies');
    revalidatePath(`/admin/companies/${companyId}`);

    return { success: true };
  } catch (error) {
    companiesLogger.error('Reject company error:', error);
    return { success: false, error: '서버 오류가 발생했습니다.' };
  }
}

/**
 * 업체 삭제 대기 처리 서버 액션
 */
export async function deleteCompany(companyId: number): Promise<VoidActionResult> {
  try {
    const isAuthenticated = await verifySession();
    const user = await getSessionUser();

    if (!isAuthenticated || user?.userType !== 'admin') {
      companiesLogger.warn('Unauthorized attempt to delete company', { companyId });
      return { success: false, error: '관리자 권한이 필요합니다.' };
    }

    const result = await serverDeleteCompany(companyId);

    if (!result.success) {
      companiesLogger.error('Error deleting company:', result.error);
      return { success: false, error: result.error || '업체 삭제 처리에 실패했습니다.' };
    }

    if (result.alreadyDeleted) {
      return { success: false, error: '이미 삭제 대기 상태인 업체입니다.' };
    }

    const headersList = await headers();

    await logActivity({
      actorType: 'admin',
      actorId: String(user.userId),
      actorName: 'Admin',
      action: 'COMPANY_DELETE',
      resourceType: 'company',
      resourceId: String(companyId),
      details: {
        companyName: result.company?.company_name,
        foldersDeleted: result.foldersDeleted,
        filesDeleted: result.filesDeleted,
        restoreDeadlineAt: result.restoreDeadlineAt,
      },
      ipAddress: headersList.get('x-forwarded-for') || 'unknown',
      userAgent: headersList.get('user-agent') || 'unknown',
    });

    revalidatePath('/admin/companies');
    revalidatePath(`/admin/companies/${companyId}`);
    revalidatePath('/webhard');

    return { success: true };
  } catch (error) {
    companiesLogger.error('Delete company error:', error);
    return { success: false, error: '서버 오류가 발생했습니다.' };
  }
}

/**
 * 삭제 대기 업체 복구 서버 액션
 */
export async function restoreCompany(companyId: number): Promise<VoidActionResult> {
  try {
    const isAuthenticated = await verifySession();
    const user = await getSessionUser();

    if (!isAuthenticated || user?.userType !== 'admin') {
      companiesLogger.warn('Unauthorized attempt to restore company', { companyId });
      return { success: false, error: '관리자 권한이 필요합니다.' };
    }

    const result = await serverRestoreCompany(companyId);

    if (!result.success) {
      companiesLogger.error('Error restoring company:', result.error);
      return { success: false, error: result.error || '업체 복구에 실패했습니다.' };
    }

    if (result.alreadyRestored) {
      return { success: false, error: '이미 복구된 업체입니다.' };
    }

    const headersList = await headers();

    await logActivity({
      actorType: 'admin',
      actorId: String(user.userId),
      actorName: 'Admin',
      action: 'COMPANY_RESTORE',
      resourceType: 'company',
      resourceId: String(companyId),
      details: {
        companyName: result.company?.company_name,
        foldersRestored: result.foldersRestored,
        filesRestored: result.filesRestored,
      },
      ipAddress: headersList.get('x-forwarded-for') || 'unknown',
      userAgent: headersList.get('user-agent') || 'unknown',
    });

    revalidatePath('/admin/companies');
    revalidatePath(`/admin/companies/${companyId}`);
    revalidatePath('/webhard');

    return { success: true };
  } catch (error) {
    companiesLogger.error('Restore company error:', error);
    return { success: false, error: '서버 오류가 발생했습니다.' };
  }
}

export async function updateCompanyProfile(formData: FormData): Promise<VoidActionResult> {
  try {
    // 세션 확인
    const isAuthenticated = await verifySession();
    if (!isAuthenticated) {
      return { success: false, error: '인증이 필요합니다.' };
    }

    const user = await getSessionUser();
    if (!user?.userId || user?.userType !== 'company') {
      return { success: false, error: '권한이 없습니다.' };
    }

    // NestJS API 경유로 업체 정보 조회
    const currentCompany = await serverGetCompany(Number(user.userId));

    if (!currentCompany) {
      return { success: false, error: '업체 정보를 찾을 수 없습니다.' };
    }

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
      return { success: false, error: '필수 항목을 모두 입력해주세요.' };
    }

    if (!managerName || !managerPosition || !managerPhone || !managerEmail) {
      return { success: false, error: '실무담당자 정보를 모두 입력해주세요.' };
    }

    // 비밀번호 변경 검증
    if (newPassword || newPasswordConfirm) {
      if (newPassword !== newPasswordConfirm) {
        return { success: false, error: '비밀번호와 비밀번호 확인이 일치하지 않습니다.' };
      }
      if (newPassword.length < 8) {
        return { success: false, error: '비밀번호는 최소 8자 이상이어야 합니다.' };
      }
    }

    // 사업자등록번호 중복 확인 (본인 제외) - NestJS API 경유
    if (businessRegistrationNumber !== currentCompany.business_registration_number) {
      const duplicateCheck = await serverCheckDuplicateBusinessNumber(
        businessRegistrationNumber,
        Number(user.userId)
      );

      if (duplicateCheck.exists) {
        return { success: false, error: '이미 등록된 사업자등록번호입니다.' };
      }
    }

    // 사업자등록증 파일 업로드
    const businessRegistrationFileUrl = currentCompany.business_registration_file_url;
    const businessRegistrationFileName = currentCompany.business_registration_file_name;

    if (businessRegistrationFile && businessRegistrationFile.size > 10 * 1024 * 1024) {
      return { success: false, error: '파일 크기는 10MB 이하여야 합니다.' };
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

    // NestJS API 경유로 데이터베이스 업데이트
    const updateResult = await serverUpdateCompany(Number(user.userId), {
      companyName: updateData.company_name,
      businessRegistrationNumber: updateData.business_registration_number,
      representativeName: updateData.representative_name,
      businessType: updateData.business_type,
      businessCategory: updateData.business_category,
      businessAddress: updateData.business_address,
      businessRegistrationFileUrl: updateData.business_registration_file_url,
      businessRegistrationFileName: updateData.business_registration_file_name,
      managerName: updateData.manager_name,
      managerPosition: updateData.manager_position,
      managerPhone: updateData.manager_phone,
      managerEmail: updateData.manager_email,
      accountantName: updateData.accountant_name,
      accountantPhone: updateData.accountant_phone,
      accountantEmail: updateData.accountant_email,
      accountantFax: updateData.accountant_fax,
      quoteMethodEmail: updateData.quote_method_email,
      quoteMethodFax: updateData.quote_method_fax,
      quoteMethodSms: updateData.quote_method_sms,
      passwordHash: updateData.password_hash,
    });

    if (!updateResult.success) {
      companiesLogger.error('Error updating company profile:', updateResult.error);
      return { success: false, error: '정보 수정에 실패했습니다.' };
    }

    if (businessRegistrationFile && businessRegistrationFile.size > 0) {
      const uploadResult = await serverUploadCompanyBusinessRegistrationToDrive(
        Number(user.userId),
        businessRegistrationFile
      );
      if (!uploadResult.success) {
        companiesLogger.error('Business registration Drive upload error:', uploadResult.error);
        return { success: false, error: '파일 업로드에 실패했습니다.' };
      }
    }

    // 페이지 캐시 무효화
    revalidatePath('/company/profile');
    revalidatePath('/company/dashboard');

    return { success: true };
  } catch (error) {
    companiesLogger.error('Error in updateCompanyProfile:', error);
    return { success: false, error: '서버 오류가 발생했습니다.' };
  }
}
