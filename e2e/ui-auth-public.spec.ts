import { test, expect } from '@playwright/test';
import {
  clickFirstVisible,
  clearBrowserState,
  expectOneOfTexts,
  fillStableInput,
  fillInputByName,
  fixtureFile,
  loginAsCompanyA,
  selectByName,
  setFileByName,
} from './helpers/ui-user-actions';

test.describe('UI 사용자 흐름 — 공개/인증', () => {
  test('공개 주요 페이지를 사용자가 이동하며 확인한다', async ({ page }) => {
    const pages: Array<{ path: string; expected: string | RegExp }> = [
      { path: '/', expected: /YJ|유진|Laser|레이저/ },
      { path: '/about', expected: /회사|소개|YJ|유진/ },
      { path: '/portfolio', expected: /포트폴리오|Portfolio|작업/ },
      { path: '/contact', expected: /문의|견적|상담/ },
      { path: '/register', expected: /업체|회원가입|등록/ },
      { path: '/login', expected: /로그인|기업 전용 포털/ },
    ];

    for (const item of pages) {
      await page.goto(item.path, { waitUntil: 'domcontentloaded' });
      await expect(page.locator('body')).toContainText(item.expected, { timeout: 30000 });
    }
  });

  test('로그인 폼을 실제 입력/클릭으로 사용한다', async ({ page }) => {
    await clearBrowserState(page);
    await loginAsCompanyA(page);
    await expect(page).toHaveURL(/\/company\/dashboard/);
    await expectOneOfTexts(page, [/진행상황|문의/]);
  });

  test('아이디 찾기와 비밀번호 찾기 화면을 UI로 전환하고 입력한다', async ({ page }) => {
    await page.goto('/login', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('form[data-login-preferences-ready="true"]')).toBeVisible({
      timeout: 15000,
    });

    await page.getByRole('button', { name: '아이디 찾기' }).click();
    await expect(page.getByRole('heading', { name: '아이디 찾기' })).toBeVisible({
      timeout: 15000,
    });
    await fillStableInput(page, page.locator('#find-id-company'), '테스트거래처A');
    await fillStableInput(page, page.locator('#find-id-email'), 'test_a@example.com');
    await fillStableInput(page, page.locator('#find-id-phone'), '010-1234-5678');

    await page.getByRole('button', { name: '돌아가기' }).click();
    await expect(page.locator('form[data-login-preferences-ready="true"]')).toBeVisible({
      timeout: 15000,
    });
    await page.getByRole('button', { name: '비밀번호 찾기' }).click();
    await expect(page.getByRole('heading', { name: '비밀번호 찾기' })).toBeVisible({
      timeout: 15000,
    });
    await fillStableInput(page, page.locator('#find-pw-username'), 'test_company_a');
    await fillStableInput(page, page.locator('#find-pw-email'), 'test_a@example.com');
  });

  test('업체등록 폼을 사용자가 입력하고 첨부파일까지 선택한다', async ({ page }) => {
    const suffix = Date.now().toString(36);
    const businessDigits = `${Date.now()}${Math.floor(Math.random() * 1000)
      .toString()
      .padStart(3, '0')}`.slice(-10);
    const businessRegistrationNumber = `${businessDigits.slice(0, 3)}-${businessDigits.slice(3, 5)}-${businessDigits.slice(5)}`;
    const username = `ui_company_${suffix}`;
    await page.goto('/register', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);

    await fillInputByName(page, 'username', username);
    await fillInputByName(page, 'password', 'test1234!');
    await fillInputByName(page, 'password_confirm', 'test1234!');
    await fillInputByName(page, 'company_name', `UI테스트업체-${suffix}`);
    await fillInputByName(page, 'representative_name', '유아이대표');
    await fillInputByName(page, 'business_registration_number', businessRegistrationNumber);
    await fillInputByName(page, 'business_type', '제조업');
    await fillInputByName(page, 'business_category', '패키지');
    await fillInputByName(page, 'business_address', '서울특별시 강남구 UI로 1');
    await setFileByName(page, 'business_registration_file', fixtureFile.businessRegistration);
    await fillInputByName(page, 'manager_name', '유아이담당');
    await fillInputByName(page, 'manager_position', '팀장');
    await fillInputByName(page, 'manager_phone', '010-9000-1234');
    await fillInputByName(page, 'manager_email', `ui-company-${suffix}@example.com`);
    await fillInputByName(page, 'accountant_name', '회계담당');
    await fillInputByName(page, 'accountant_phone', '010-9000-5678');
    await fillInputByName(page, 'accountant_email', `ui-account-${suffix}@example.com`);
    await page.getByText('이메일', { exact: true }).click();
    await expect(page.locator('input[name="quote_method"][value="email"]')).toBeChecked();
    await fillInputByName(page, 'username', username);
    await expect(page.locator('#username')).toHaveValue(username);

    await page.getByRole('button', { name: '업체등록 신청' }).click();
    await expect(page.locator('body')).toContainText(
      /승인 대기|등록.*완료|회원가입.*완료|관리자 승인/,
      { timeout: 45000 }
    );
  });

  test('문의 폼에서 필수값 검증과 첨부 UI를 조작한다', async ({ page }) => {
    const inquiryTitle = `UI 문의 ${Date.now()}`;
    await page.goto('/contact', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);

    await clickFirstVisible(page, [/다음|문의하기|제출|견적/]);
    await expectOneOfTexts(page, [/필수|입력|선택|확인/]);

    const fillRequiredContactFields = async () => {
      await fillInputByName(page, 'inquiry_title', inquiryTitle);
      await fillInputByName(page, 'company_name', '테스트거래처A');
      await fillInputByName(page, 'name', '문의담당');
      await fillInputByName(page, 'position', '팀장');
      await fillInputByName(page, 'phone', '010-1234-5678');
      await fillInputByName(page, 'email', 'contact-ui@example.com');
      await selectByName(page, 'referralSource', '구글');
      await expect(page.locator('#inquiry_title')).toHaveValue(inquiryTitle);
      await expect(page.locator('#company_name')).toHaveValue('테스트거래처A');
      await expect(page.locator('#name')).toHaveValue('문의담당');
      await expect(page.locator('#position')).toHaveValue('팀장');
      await expect(page.locator('#phone')).toHaveValue('010-1234-5678');
      await expect(page.locator('#email')).toHaveValue('contact-ui@example.com');
      await expect(page.locator('#referralSource')).toHaveValue('구글');
    };

    const stepTwoHeading = page.getByRole('heading', { name: '도면 및 샘플' });
    for (let attempt = 0; attempt < 2; attempt += 1) {
      await fillRequiredContactFields();
      await page.getByRole('button', { name: '다음 단계' }).click();
      if (await stepTwoHeading.isVisible({ timeout: 5000 }).catch(() => false)) {
        break;
      }
    }
    await expect(stepTwoHeading).toBeVisible({ timeout: 15000 });
    await clickFirstVisible(page, ['모두 준비되었으니, 바로 목형 의뢰할께요.']);
    await clickFirstVisible(page, ['도면의 수정이 필요없습니다']);
    await setFileByName(page, 'drawing_file', fixtureFile.drawing);

    await expect(page.locator('input[name="drawing_file"]')).toHaveJSProperty('files.length', 1);
  });
});
