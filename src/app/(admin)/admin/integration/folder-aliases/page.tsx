import { redirect } from 'next/navigation';

/**
 * task 26: 폴더 별칭 관리 UI 는 `/admin/integration/companies` 로 통합되었음.
 *
 * 옛 URL 호환을 위한 6개월 redirect (2026-04 ~ 2026-10).
 * 2026-10 별도 task 로 본 페이지 자체 삭제 예정.
 */
export default function FolderAliasesRedirectPage() {
  redirect('/admin/integration/companies');
}
