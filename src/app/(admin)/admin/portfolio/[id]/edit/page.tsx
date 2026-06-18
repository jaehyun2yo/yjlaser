// src/app/(admin)/admin/portfolio/[id]/edit/page.tsx

import { BG_COLOR, BORDER_COLOR, TEXT_COLOR } from '@/lib/styles';
import { createAndUploadVariants } from '@/lib/images/process';
import Image from 'next/image';
import { transparentBlurDataURL } from '@/lib/images/placeholder';
import { redirect } from 'next/navigation';
import { logger } from '@/lib/utils/logger';
import { FileUpload } from '@/components/FileUpload';
import { serverGetPortfolio } from '@/lib/api/nestjs-server-client';

interface UploadedImage {
  original: string;
  thumbnail?: string;
  medium?: string;
}

interface PortfolioItem {
  id: string; // UUID
  title: string;
  field: string;
  purpose: string;
  type: string;
  format: string;
  size: string;
  paper: string;
  printing: string;
  finishing: string;
  description: string;
  images: string[] | UploadedImage[];
  created_at: string;
}

async function updatePortfolio(formData: FormData) {
  'use server';
  const id = String(formData.get('id') || '');
  if (!id) {
    redirect('/admin/portfolio?error=invalid');
  }

  // 기존 이미지 목록
  let existing: string[] = [];
  const existingJson = formData.get('existingImages');
  if (existingJson) {
    try {
      existing = JSON.parse(String(existingJson));
    } catch {}
  }

  // 삭제 선택된 이미지들 (URL 값)
  const removeList = formData.getAll('remove').map((v) => String(v));
  // existing may be string[] or object[]
  const kept = (existing as (string | UploadedImage)[]).filter((item) => {
    if (typeof item === 'string') {
      return !removeList.includes(item);
    }
    // object with variants
    const urls = [item.thumbnail, item.medium, item.original].filter(Boolean) as string[];
    return urls.every((u) => !removeList.includes(u));
  });

  // 새 이미지 업로드
  const newFiles = formData.getAll('newImages');
  const uploaded: UploadedImage[] = [];
  try {
    for (const f of newFiles) {
      if (typeof f === 'object' && 'arrayBuffer' in f) {
        const up = await createAndUploadVariants(f as File);
        uploaded.push(up);
      }
    }
  } catch {
    redirect(`/admin/portfolio/${id}/edit?warn=r2config`);
  }

  const images = [...kept, ...uploaded];

  const payload = {
    title: String(formData.get('title') || '').trim(),
    field: String(formData.get('field') || '').trim(),
    purpose: String(formData.get('purpose') || '').trim(),
    type: String(formData.get('type') || '').trim(),
    format: String(formData.get('format') || '').trim(),
    size: String(formData.get('size') || '').trim(),
    paper: String(formData.get('paper') || '').trim(),
    printing: String(formData.get('printing') || '').trim(),
    finishing: String(formData.get('finishing') || '').trim(),
    description: String(formData.get('description') || '').trim(),
    images,
    updated_at: new Date().toISOString(),
  };

  const portfolioLogger = logger.createLogger('PORTFOLIO_ADMIN');
  try {
    const { nestjsFetch: fetchNestJS } = await import('@/lib/api/nestjs-server-client');
    const response = await fetchNestJS(`/public-data/portfolio/${id}`, {
      method: 'PATCH',
      body: payload,
      useApiKey: true,
    });
    if (!response.ok) {
      portfolioLogger.error('Portfolio update error', { status: response.status });
      redirect(`/admin/portfolio/${id}/edit?error=server`);
    }
    portfolioLogger.debug('Portfolio update success');
    redirect(`/admin/portfolio/${id}/edit?success=1`);
  } catch (error: unknown) {
    if (
      error instanceof Error &&
      (error.message === 'NEXT_REDIRECT' ||
        (error as { digest?: string }).digest?.startsWith('NEXT_REDIRECT'))
    ) {
      throw error;
    }
    portfolioLogger.error('Portfolio update exception', error);
    redirect(`/admin/portfolio/${id}/edit?warn=noconfig`);
  }
}

export default async function EditPortfolioPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ success?: string; error?: string; warn?: string }>;
}) {
  const { id } = await params;
  const sp = (await searchParams) || {};
  const success = sp.success === '1';
  const error = sp.error === 'server';
  const warnNoConfig = sp.warn === 'noconfig';

  let item: PortfolioItem | null = null;
  try {
    const data = await serverGetPortfolio(id);
    item = (data || null) as unknown as PortfolioItem | null;
  } catch {
    // ignore when not configured
  }

  if (!item) {
    return (
      <div className="space-y-4">
        <h1 className={`text-2xl font-bold ${TEXT_COLOR.primary}`}>항목을 찾을 수 없습니다</h1>
        {warnNoConfig && (
          <div
            className={`rounded-md border ${BORDER_COLOR.warning} ${BG_COLOR.warning} p-3 text-sm ${TEXT_COLOR.warningDeep}`}
          >
            서버 연결에 실패했습니다.
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className={`text-3xl font-bold mb-2 ${TEXT_COLOR.primary}`}>포트폴리오 수정</h1>
        <p className={`${TEXT_COLOR.secondary}`}>항목을 수정하고 저장할 수 있습니다.</p>
      </div>

      {success && (
        <div
          className={`rounded-md border ${BORDER_COLOR.success} ${BG_COLOR.success} p-3 text-sm ${TEXT_COLOR.successStrong}`}
        >
          저장되었습니다.
        </div>
      )}
      {error && (
        <div
          className={`rounded-md border ${BORDER_COLOR.error} ${BG_COLOR.error} p-3 text-sm ${TEXT_COLOR.errorStrong}`}
        >
          저장 중 오류가 발생했습니다.
        </div>
      )}
      {warnNoConfig && (
        <div
          className={`rounded-md border ${BORDER_COLOR.warning} ${BG_COLOR.warning} p-3 text-sm ${TEXT_COLOR.warningDeep}`}
        >
          서버 연결에 실패했습니다. 백엔드 서버 상태를 확인해주세요.
        </div>
      )}

      <form
        action={updatePortfolio}
        className={`space-y-6 rounded-lg border ${BORDER_COLOR.default} ${BG_COLOR.card} p-6`}
      >
        <input type="hidden" name="id" value={item.id} />
        <input type="hidden" name="existingImages" value={JSON.stringify(item.images || [])} />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <label className={`block text-sm font-medium ${TEXT_COLOR.primary}`}>제목</label>
            <input
              type="text"
              name="title"
              defaultValue={item.title}
              className={`w-full px-3 py-2 rounded-lg border ${BORDER_COLOR.default} ${BG_COLOR.card} ${TEXT_COLOR.primary}`}
              required
            />
          </div>
          <div className="space-y-2">
            <label className={`block text-sm font-medium ${TEXT_COLOR.primary}`}>분야</label>
            <select
              name="field"
              defaultValue={item.field}
              className={`w-full px-3 py-2 rounded-lg border ${BORDER_COLOR.default} ${BG_COLOR.card} ${TEXT_COLOR.primary}`}
              required
            >
              {['브랜딩', '편집', '패키지', '간판', '웹', '기타'].map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <label className={`block text-sm font-medium ${TEXT_COLOR.primary}`}>목적</label>
            <select
              name="purpose"
              defaultValue={item.purpose}
              className={`w-full px-3 py-2 rounded-lg border ${BORDER_COLOR.default} ${BG_COLOR.card} ${TEXT_COLOR.primary}`}
              required
            >
              {['홍보', '판매', '안내', '행사', '기타'].map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <label className={`block text-sm font-medium ${TEXT_COLOR.primary}`}>종류</label>
            <select
              name="type"
              defaultValue={item.type}
              className={`w-full px-3 py-2 rounded-lg border ${BORDER_COLOR.default} ${BG_COLOR.card} ${TEXT_COLOR.primary}`}
              required
            >
              {['전단', '리플렛', '브로슈어', '포스터', '명함', '카탈로그', '책자', '기타'].map(
                (opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                )
              )}
            </select>
          </div>
          <div className="space-y-2">
            <label className={`block text-sm font-medium ${TEXT_COLOR.primary}`}>형태</label>
            <select
              name="format"
              defaultValue={item.format}
              className={`w-full px-3 py-2 rounded-lg border ${BORDER_COLOR.default} ${BG_COLOR.card} ${TEXT_COLOR.primary}`}
              required
            >
              {['단면', '양면', '2단접지', '3단접지', '책자', '기타'].map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <label className={`block text-sm font-medium ${TEXT_COLOR.primary}`}>장폭고</label>
            <input
              type="text"
              name="size"
              defaultValue={item.size}
              className={`w-full px-3 py-2 rounded-lg border ${BORDER_COLOR.default} ${BG_COLOR.card} ${TEXT_COLOR.primary}`}
              required
            />
          </div>
          <div className="space-y-2">
            <label className={`block text-sm font-medium ${TEXT_COLOR.primary}`}>지류</label>
            <input
              type="text"
              name="paper"
              defaultValue={item.paper}
              className={`w-full px-3 py-2 rounded-lg border ${BORDER_COLOR.default} ${BG_COLOR.card} ${TEXT_COLOR.primary}`}
              required
            />
          </div>
          <div className="space-y-2">
            <label className={`block text-sm font-medium ${TEXT_COLOR.primary}`}>인쇄</label>
            <input
              type="text"
              name="printing"
              defaultValue={item.printing}
              className={`w-full px-3 py-2 rounded-lg border ${BORDER_COLOR.default} ${BG_COLOR.card} ${TEXT_COLOR.primary}`}
              required
            />
          </div>
          <div className="space-y-2">
            <label className={`block text-sm font-medium ${TEXT_COLOR.primary}`}>후가공</label>
            <input
              type="text"
              name="finishing"
              defaultValue={item.finishing}
              className={`w-full px-3 py-2 rounded-lg border ${BORDER_COLOR.default} ${BG_COLOR.card} ${TEXT_COLOR.primary}`}
              required
            />
          </div>
        </div>

        {/* 기존 이미지 목록 및 삭제 선택 */}
        <div className="space-y-2">
          <label className={`block text-sm font-medium ${TEXT_COLOR.primary}`}>기존 이미지</label>
          {Array.isArray(item.images) && item.images.length > 0 ? (
            <ul className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {item.images.map((img: string | UploadedImage, idx: number) => {
                const url = typeof img === 'string' ? img : img.original;
                const thumbnailUrl =
                  typeof img === 'string' ? img : img.thumbnail || img.medium || img.original;
                return (
                  <li
                    key={typeof img === 'string' ? img : img.original || idx}
                    className="space-y-2"
                  >
                    <Image
                      src={thumbnailUrl}
                      alt="image"
                      width={320}
                      height={160}
                      className={`w-full h-28 object-cover rounded-md border ${BORDER_COLOR.default}`}
                      sizes="(max-width: 768px) 50vw, 320px"
                      placeholder="blur"
                      blurDataURL={transparentBlurDataURL}
                    />
                    <label className={`flex items-center gap-2 text-sm ${TEXT_COLOR.primary}`}>
                      <input type="checkbox" name="remove" value={url} />
                      삭제하기
                    </label>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className={`text-sm ${TEXT_COLOR.secondary}`}>등록된 이미지가 없습니다.</p>
          )}
        </div>

        {/* 새 이미지 추가 업로드 */}
        <FileUpload
          name="newImages"
          accept="image/*"
          multiple
          maxSize={10 * 1024 * 1024}
          label="새 이미지 추가"
        />

        <div className="space-y-2">
          <label className={`block text-sm font-medium ${TEXT_COLOR.primary}`}>설명</label>
          <textarea
            name="description"
            rows={6}
            defaultValue={item.description}
            className={`w-full px-3 py-2 rounded-lg border ${BORDER_COLOR.default} ${BG_COLOR.card} ${TEXT_COLOR.primary}`}
            required
          />
        </div>

        <div className="flex gap-3">
          <button
            type="submit"
            className="px-4 py-2 rounded-lg bg-[#ED6C00] text-white hover:bg-[#d15f00] transition-colors"
          >
            저장
          </button>
          <a
            href="/admin/portfolio"
            className={`px-4 py-2 rounded-lg ${BG_COLOR.medium} ${BG_COLOR.hoverStronger} ${TEXT_COLOR.primary} transition-colors`}
          >
            목록으로
          </a>
        </div>
      </form>
    </div>
  );
}
