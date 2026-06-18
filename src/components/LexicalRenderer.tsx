// src/components/LexicalRenderer.tsx

'use client';

import { LexicalComposer } from '@lexical/react/LexicalComposer';
import { logger } from '@/lib/utils/logger';

const log = logger.createLogger('LexicalRenderer');
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary';

interface LexicalRendererProps {
  // content는 JSON 객체일 수도 있고, 그것을 문자열로 바꾼 것일 수도 있습니다.
  content: string | object;
}

export default function LexicalRenderer({ content }: LexicalRendererProps) {
  const initialConfig = {
    // 1. 에디터의 상태를 '읽기 전용'으로 설정하는 것이 핵심입니다.
    editable: false,
    // 2. 에디터의 초기 내용을 DB에서 가져온 content로 설정합니다.
    editorState: typeof content === 'string' ? content : JSON.stringify(content),
    namespace: 'LexicalRenderer',
    nodes: [], // 기본 노드
    onError: (error: Error) => {
      log.error('LexicalComposer error:', error);
    },
  };

  return (
    <LexicalComposer initialConfig={initialConfig}>
      <div className="relative">
        {/* 3. 편집 기능이 없는, 순수하게 보여주기만 하는 플러그인들입니다. */}
        <RichTextPlugin
          contentEditable={<ContentEditable className="outline-none" />}
          placeholder={null} // placeholder는 필요 없습니다.
          ErrorBoundary={LexicalErrorBoundary}
        />
      </div>
    </LexicalComposer>
  );
}
