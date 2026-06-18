// src/app/(admin)/admin/posts/new/page.tsx

'use client';

import { BG_COLOR, BORDER_COLOR, TEXT_COLOR } from '@/lib/styles';
import { useState } from 'react';
import { EditorState } from 'lexical';
import dynamic from 'next/dynamic';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { createPost } from '@/app/(admin)/admin/posts/_actions';
import { toast } from 'sonner';

// Editor 컴포넌트를 동적으로 가져옵니다.
const Editor = dynamic(() => import('@/components/Editor'), { ssr: false });

// Zod 스키마 정의
const postSchema = z.object({
  title: z
    .string()
    .min(1, '제목은 필수입니다')
    .max(100, '제목은 100자 이하여야 합니다')
    .refine((val) => val.trim().length > 0, '제목에는 공백만 입력할 수 없습니다'),
  content: z.string().min(1, '내용은 필수입니다'),
});

type PostFormData = z.infer<typeof postSchema>;

export default function NewPostPage() {
  const [editorState, setEditorState] = useState<EditorState | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<PostFormData>({
    resolver: zodResolver(postSchema),
    mode: 'onChange',
  });

  const handleEditorChange = (currentEditorState: EditorState) => {
    setEditorState(currentEditorState);

    // 에디터 내용을 폼에 반영
    const content = JSON.stringify(currentEditorState.toJSON());
    setValue('content', content, { shouldValidate: true });
  };

  async function onSubmit(data: PostFormData) {
    if (!editorState || isSubmitting) {
      return;
    }

    setIsSubmitting(true);

    try {
      const result = await createPost(data.title, data.content);

      if (result && !result.success) {
        toast.error('게시물 생성 실패', {
          description: '다시 시도해주세요.',
        });
      } else {
        toast.success('게시물이 생성되었습니다!');
      }
    } catch {
      toast.error('오류가 발생했습니다', {
        description: '잠시 후 다시 시도해주세요.',
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className={`text-3xl font-bold mb-2 ${TEXT_COLOR.primary}`}>새 게시물 작성</h1>
        <p className={TEXT_COLOR.secondary}>새로운 게시물을 작성할 수 있습니다</p>
      </div>

      <form
        onSubmit={handleSubmit(onSubmit)}
        className={`${BG_COLOR.card} p-8 rounded-xl shadow-md border-2 ${BORDER_COLOR.default} space-y-6`}
      >
        <div>
          <label
            htmlFor="title"
            className={`block text-sm font-medium ${TEXT_COLOR.secondary} mb-2`}
          >
            제목 <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            id="title"
            {...register('title')}
            placeholder="게시물 제목을 입력하세요"
            className={`mt-1 block w-full px-4 py-3 border-2 rounded-lg ${BG_COLOR.card} ${TEXT_COLOR.primary} placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all duration-300 ${
              errors.title ? 'border-red-500' : BORDER_COLOR.default
            }`}
          />
          {errors.title && (
            <p className={`${TEXT_COLOR.errorMid} text-sm mt-2`}>{errors.title.message}</p>
          )}
        </div>

        <div>
          <label className={`block text-sm font-medium ${TEXT_COLOR.secondary} mb-2`}>
            내용 <span className="text-red-500">*</span>
          </label>
          <div className={errors.content ? 'border-2 border-red-500 rounded-lg' : ''}>
            <Editor onChange={handleEditorChange} />
          </div>
          {errors.content && (
            <p className={`${TEXT_COLOR.errorMid} text-sm mt-2`}>{errors.content.message}</p>
          )}
        </div>

        <div className="flex gap-3 pt-4">
          <button
            type="submit"
            disabled={isSubmitting}
            className="bg-gradient-to-r from-orange-500 to-orange-600 text-white py-2 px-6 rounded-lg hover:from-orange-600 hover:to-orange-700 disabled:from-gray-400 disabled:to-gray-500 disabled:cursor-not-allowed transition-all duration-300 shadow-md hover:shadow-lg font-medium"
          >
            {isSubmitting ? '작성 중...' : '작성하기'}
          </button>

          <button
            type="button"
            onClick={() => window.history.back()}
            className={`${BG_COLOR.medium} ${TEXT_COLOR.secondary} py-2 px-6 rounded-lg ${BG_COLOR.hoverStronger} transition-all duration-300 font-medium`}
          >
            취소
          </button>
        </div>
      </form>
    </div>
  );
}
