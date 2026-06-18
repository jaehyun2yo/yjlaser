import { test, expect } from './fixtures/auth';
import { deleteFolderViaAPI, waitForFolderVisible } from './helpers/webhard-helpers';

type CreateFolderBrowserResponse = {
  status: number;
  ok: boolean;
  data: {
    id?: string;
  };
};

test.describe('폴더 API 디버그 테스트', () => {
  test('should create folder directly via browser API call', async ({
    authenticatedPageAtRoot: page,
  }) => {
    // 브라우저 컨텍스트에서 직접 API 호출
    const folderName = `api-direct-test-${Date.now()}`;

    const response = await page.evaluate<CreateFolderBrowserResponse, string>(async (name) => {
      const res = await fetch('/api/webhard/folders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          parentId: null,
          companyId: null,
        }),
      });
      const data = (await res.json()) as { id?: string };
      return {
        status: res.status,
        ok: res.ok,
        data,
      };
    }, folderName);

    expect(response.status).toBe(201);
    expect(response.data.id).toBeDefined();

    try {
      // 폴더가 목록에 나타나는지 확인
      await page.reload({ waitUntil: 'domcontentloaded' });
      await expect(await waitForFolderVisible(page, folderName, 60000)).toBe(true);
    } finally {
      if (response.data.id) {
        await deleteFolderViaAPI(page, response.data.id);
      }
    }
  });
});
