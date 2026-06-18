'use client';

import { useState, useEffect, useCallback } from 'react';
import { BG_COLOR, TEXT_COLOR, BORDER_COLOR } from '@/lib/styles';
import { Button } from '@/components/ui/button';
import { getFolderTemplate, updateFolderTemplate } from '@/app/actions/webhard';

interface FolderTemplateNode {
  name: string;
  children?: FolderTemplateNode[];
}

function deepClone(nodes: FolderTemplateNode[]): FolderTemplateNode[] {
  return JSON.parse(JSON.stringify(nodes));
}

interface FolderNodeEditorProps {
  node: FolderTemplateNode;
  depth: number;
  onRename: (newName: string) => void;
  onDelete: () => void;
  onAddChild: () => void;
}

function FolderNodeEditor({ node, depth, onRename, onDelete, onAddChild }: FolderNodeEditorProps) {
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(node.name);

  const handleRename = () => {
    const trimmed = editName.trim();
    if (trimmed && trimmed !== node.name) {
      onRename(trimmed);
    } else {
      setEditName(node.name);
    }
    setEditing(false);
  };

  return (
    <div style={{ paddingLeft: `${depth * 24}px` }}>
      <div className="flex items-center gap-2 py-1.5">
        <span className={`${TEXT_COLOR.secondary} text-sm`}>📁</span>
        {editing ? (
          <input
            type="text"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            onBlur={handleRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleRename();
              if (e.key === 'Escape') {
                setEditName(node.name);
                setEditing(false);
              }
            }}
            className={`px-2 py-0.5 text-sm border rounded ${BORDER_COLOR.default} ${BG_COLOR.card} ${TEXT_COLOR.primary} focus:outline-none focus:ring-1 focus:ring-blue-500`}
            autoFocus
          />
        ) : (
          <span className={`text-sm font-medium ${TEXT_COLOR.primary}`}>{node.name}</span>
        )}
        <div className="flex items-center gap-1 ml-auto">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-xs px-2 py-0.5"
            onClick={() => {
              setEditName(node.name);
              setEditing(true);
            }}
          >
            이름변경
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-xs px-2 py-0.5"
            onClick={onAddChild}
          >
            {' '}
            하위 추가{' '}
          </Button>{' '}
          <Button
            type="button"
            variant="danger"
            size="sm"
            className="text-xs px-2 py-0.5"
            onClick={onDelete}
          >
            {' '}
            삭제{' '}
          </Button>{' '}
        </div>{' '}
      </div>{' '}
    </div>
  );
}
function renderTree(
  nodes: FolderTemplateNode[],
  depth: number,
  path: number[],
  onUpdate: (newNodes: FolderTemplateNode[]) => void
): React.ReactNode[] {
  return nodes.map((node, index) => {
    const currentPath = [...path, index];
    const handleRename = (newName: string) => {
      const updated = deepClone(nodes);
      updated[index].name = newName;
      onUpdate(updated);
    };
    const handleDelete = () => {
      const updated = deepClone(nodes);
      updated.splice(index, 1);
      onUpdate(updated);
    };
    const handleAddChild = () => {
      const updated = deepClone(nodes);
      if (!updated[index].children) {
        updated[index].children = [];
      }
      updated[index].children!.push({ name: '새 폴더' });
      onUpdate(updated);
    };
    const handleChildrenUpdate = (newChildren: FolderTemplateNode[]) => {
      const updated = deepClone(nodes);
      updated[index].children = newChildren;
      onUpdate(updated);
    };
    return (
      <div key={currentPath.join('-')}>
        {' '}
        <FolderNodeEditor
          node={node}
          depth={depth}
          onRename={handleRename}
          onDelete={handleDelete}
          onAddChild={handleAddChild}
        />{' '}
        {node.children &&
          node.children.length > 0 &&
          renderTree(node.children, depth + 1, currentPath, handleChildrenUpdate)}{' '}
      </div>
    );
  });
}
export default function FolderTemplateSettings() {
  const [template, setTemplate] = useState<FolderTemplateNode[]>([]);
  const [originalTemplate, setOriginalTemplate] = useState<FolderTemplateNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const loadTemplate = useCallback(async () => {
    const result = await getFolderTemplate();
    if (result.success && result.template) {
      setTemplate(result.template);
      setOriginalTemplate(result.template);
    }
    setLoading(false);
  }, []);
  useEffect(() => {
    loadTemplate();
  }, [loadTemplate]);
  const hasChanges = JSON.stringify(template) !== JSON.stringify(originalTemplate);
  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    const result = await updateFolderTemplate(template);
    if (result.success) {
      setOriginalTemplate(deepClone(template));
      setMessage({ type: 'success', text: '폴더 템플릿이 저장되었습니다.' });
    } else {
      setMessage({ type: 'error', text: result.error || '저장에 실패했습니다.' });
    }
    setSaving(false);
    setTimeout(() => setMessage(null), 3000);
  };
  const handleReset = () => {
    setTemplate(deepClone(originalTemplate));
  };
  const handleAddRoot = () => {
    setTemplate([...deepClone(template), { name: '새 폴더' }]);
  };
  if (loading) {
    return (
      <div className={`${BG_COLOR.card} p-6 rounded-xl shadow-md border ${BORDER_COLOR.default}`}>
        <p className={TEXT_COLOR.secondary}>로딩 중...</p>
      </div>
    );
  }

  return (
    <div className={`${BG_COLOR.card} p-6 rounded-xl shadow-md border ${BORDER_COLOR.default}`}>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className={`text-lg font-bold ${TEXT_COLOR.primary}`}>기본 폴더 설정</h2>
          <p className={`text-sm ${TEXT_COLOR.secondary} mt-1`}>
            새 업체 등록 시 자동 생성되는 폴더 구조를 설정합니다.
          </p>
        </div>
      </div>

      <div className={`border rounded-lg p-4 ${BORDER_COLOR.default} ${BG_COLOR.gray} mb-4`}>
        <div className={`text-sm font-medium ${TEXT_COLOR.secondary} mb-2`}>📂 {'{업체명}'}</div>
        <div className="ml-6">
          {template.length === 0 ? (
            <p className={`text-sm ${TEXT_COLOR.secondary} italic`}>
              폴더가 없습니다. 아래 버튼으로 추가하세요.
            </p>
          ) : (
            renderTree(template, 0, [], setTemplate)
          )}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="text-sm px-3 py-1.5"
          onClick={handleAddRoot}
        >
          + 폴더 추가
        </Button>

        <div className="ml-auto flex items-center gap-2">
          {message && (
            <span
              className={`text-sm ${message.type === 'success' ? TEXT_COLOR.success : TEXT_COLOR.error}`}
            >
              {message.text}
            </span>
          )}

          {hasChanges && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-sm px-3 py-1.5"
              onClick={handleReset}
            >
              초기화
            </Button>
          )}

          <Button
            type="button"
            size="sm"
            className="text-sm px-4 py-1.5"
            onClick={handleSave}
            disabled={!hasChanges || saving}
          >
            {saving ? '저장 중...' : '저장'}
          </Button>
        </div>
      </div>
    </div>
  );
}
