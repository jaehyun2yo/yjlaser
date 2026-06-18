// src/components/Editor.tsx

'use client';

import React from 'react';
import { LexicalComposer } from '@lexical/react/LexicalComposer';
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin';
import { OnChangePlugin } from '@lexical/react/LexicalOnChangePlugin';
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary';
import { EditorState } from 'lexical';

// 1. 에디터에 적용할 기본 테마와 노드(Node) 설정
const editorConfig = {
  namespace: 'MyEditor',
  theme: {
    // 여기에 에디터 스타일을 정의할 수 있습니다.
    ltr: 'text-left',
    rtl: 'text-right',
    paragraph: 'mb-4',
  },
  // 에디터가 처리할 수 있는 기본 노드들
  nodes: [],
  onError(error: Error) {
    throw error;
  },
};

interface EditorProps {
  onChange: (editorState: EditorState) => void;
}

export default function Editor({ onChange }: EditorProps) {
  return (
    // 2. Lexical의 핵심인 Composer로 전체를 감싸줍니다.
    <LexicalComposer initialConfig={editorConfig}>
      <div className="relative bg-white border border-gray-300 rounded-md">
        {/* 3. 실제 글을 쓰는 영역입니다. */}
        <RichTextPlugin
          contentEditable={<ContentEditable className="p-4 min-h-[200px] outline-none" />}
          placeholder={
            <div className="text-gray-400 absolute top-4 left-4 pointer-events-none">
              내용을 입력하세요...
            </div>
          }
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ErrorBoundary={LexicalErrorBoundary as any}
        />
        {/* 4. 'undo', 'redo' 같은 히스토리 기능을 추가합니다. */}
        <HistoryPlugin />
        {/* 5. 에디터 내용이 바뀔 때마다 onChange 함수를 호출합니다. */}
        <OnChangePlugin onChange={onChange} />
      </div>
    </LexicalComposer>
  );
}
