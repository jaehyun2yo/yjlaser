'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { BG_COLOR, TEXT_COLOR, BORDER_COLOR } from '@/lib/styles';
import { Button } from '@/components/ui/button';
import { getFolderStatusMapping, updateFolderStatusMapping } from '@/app/actions/webhard';
import { X, Plus, ArrowRight, Pencil, Check, Loader2 } from 'lucide-react';

interface FolderStatusMapping {
  folderName: string;
  processStage: string;
}

const PROCESS_STAGE_OPTIONS = [
  { value: 'drawing', label: '도면작업' },
  { value: 'sample', label: '샘플제작 및 확인' },
  { value: 'drawing_confirmed', label: '도면 확정 및 목형의뢰' },
  { value: 'laser', label: '레이저 가공' },
  { value: 'cutting', label: '칼 작업' },
  { value: 'creasing', label: '오시작업' },
  { value: 'delivery', label: '납품' },
];

const getStageLabel = (value: string) =>
  PROCESS_STAGE_OPTIONS.find((o) => o.value === value)?.label ?? value;

interface MappingRowProps {
  mapping: FolderStatusMapping;
  saving: boolean;
  onUpdate: (folderName: string, processStage: string) => void;
  onRemove: () => void;
}

function MappingRow({ mapping, saving, onUpdate, onRemove }: MappingRowProps) {
  const [editing, setEditing] = useState(false);
  const [editFolder, setEditFolder] = useState(mapping.folderName);
  const [editStage, setEditStage] = useState(mapping.processStage);
  const inputRef = useRef<HTMLInputElement>(null);

  const startEdit = () => {
    setEditFolder(mapping.folderName);
    setEditStage(mapping.processStage);
    setEditing(true);
  };

  const confirmEdit = () => {
    const trimmed = editFolder.trim();
    if (!trimmed) return;
    onUpdate(trimmed, editStage);
    setEditing(false);
  };

  const cancelEdit = () => setEditing(false);

  useEffect(() => {
    if (editing && inputRef.current) inputRef.current.focus();
  }, [editing]);

  if (editing) {
    return (
      <div
        className={`flex items-center gap-2 px-4 py-2 rounded-lg ${BG_COLOR.card} border-2 border-blue-400`}
      >
        <input
          ref={inputRef}
          type="text"
          value={editFolder}
          onChange={(e) => setEditFolder(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') confirmEdit();
            if (e.key === 'Escape') cancelEdit();
          }}
          className={`w-32 px-2 py-1 text-sm border rounded ${BORDER_COLOR.default} ${BG_COLOR.card} ${TEXT_COLOR.primary} focus:outline-none focus:ring-1 focus:ring-blue-500`}
        />
        <ArrowRight className="w-4 h-4 shrink-0 text-gray-400" />
        <select
          value={editStage}
          onChange={(e) => setEditStage(e.target.value)}
          className={`flex-1 px-2 py-1 text-sm border rounded ${BORDER_COLOR.default} ${BG_COLOR.card} ${TEXT_COLOR.primary} focus:outline-none focus:ring-1 focus:ring-blue-500`}
        >
          {PROCESS_STAGE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={confirmEdit}
          className={`p-1 rounded text-green-600 ${BG_COLOR.hoverSuccessDark} transition-colors`}
          title="확인"
        >
          <Check className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={cancelEdit}
          className={`p-1 rounded text-gray-400 hover:text-red-500 ${BG_COLOR.hoverErrorDark} transition-colors`}
          title="취소"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    );
  }

  return (
    <div
      className={`flex items-center gap-2 px-4 py-2 rounded-lg ${BG_COLOR.card} border ${BORDER_COLOR.default} group`}
    >
      <span className={`text-sm font-semibold ${TEXT_COLOR.primary}`}>{mapping.folderName}</span>
      <ArrowRight className="w-4 h-4 shrink-0 text-gray-400" />
      <span className={`text-sm ${TEXT_COLOR.secondary}`}>
        {getStageLabel(mapping.processStage)}
      </span>
      <div className="ml-auto flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          type="button"
          onClick={startEdit}
          disabled={saving}
          className={`p-1 rounded text-gray-400 hover:text-blue-500 ${BG_COLOR.hoverInfoDark} transition-colors disabled:opacity-50`}
          title="수정"
        >
          <Pencil className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={onRemove}
          disabled={saving}
          className={`p-1 rounded text-gray-400 hover:text-red-500 ${BG_COLOR.hoverErrorDark} transition-colors disabled:opacity-50`}
          title="삭제"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

export default function FolderStatusMappingSettings() {
  const [mappings, setMappings] = useState<FolderStatusMapping[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [newFolder, setNewFolder] = useState('');
  const [newStage, setNewStage] = useState('drawing');

  const loadMappings = useCallback(async () => {
    const result = await getFolderStatusMapping();
    if (result.success && result.mappings) {
      setMappings(result.mappings);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadMappings();
  }, [loadMappings]);

  const showMessage = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 2000);
  };

  const saveToDb = async (next: FolderStatusMapping[]) => {
    setSaving(true);
    const result = await updateFolderStatusMapping(next);
    if (result.success) {
      setMappings(next);
      showMessage('success', '저장됨');
    } else {
      showMessage('error', result.error || '저장 실패');
    }
    setSaving(false);
  };

  const handleAdd = () => {
    const trimmed = newFolder.trim();
    if (!trimmed) return;
    if (mappings.some((m) => m.folderName === trimmed)) {
      showMessage('error', '이미 등록된 폴더명입니다.');
      return;
    }
    const next = [...mappings, { folderName: trimmed, processStage: newStage }];
    setNewFolder('');
    setNewStage('drawing');
    saveToDb(next);
  };

  const handleUpdate = (index: number, folderName: string, processStage: string) => {
    const next = [...mappings];
    next[index] = { folderName, processStage };
    saveToDb(next);
  };

  const handleRemove = (index: number) => {
    const next = mappings.filter((_, i) => i !== index);
    saveToDb(next);
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
          <h2 className={`text-lg font-bold ${TEXT_COLOR.primary}`}>폴더 → 작업상태 매핑</h2>
          <p className={`text-sm ${TEXT_COLOR.secondary} mt-1`}>
            웹하드 폴더에 파일이 업로드되면 해당 작업상태로 문의가 자동 생성됩니다.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {saving && <Loader2 className="w-4 h-4 animate-spin text-gray-400" />}
          {message && (
            <span
              className={`text-xs ${message.type === 'success' ? TEXT_COLOR.success : TEXT_COLOR.error}`}
            >
              {message.text}
            </span>
          )}
        </div>
      </div>

      {/* 매핑 목록 */}
      <div className={`border rounded-lg p-4 ${BORDER_COLOR.default} ${BG_COLOR.gray} mb-4`}>
        {mappings.length === 0 ? (
          <p className={`text-sm ${TEXT_COLOR.secondary} italic`}>
            매핑이 없습니다. 아래에서 추가하세요.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {mappings.map((mapping, index) => (
              <MappingRow
                key={mapping.folderName}
                mapping={mapping}
                saving={saving}
                onUpdate={(f, s) => handleUpdate(index, f, s)}
                onRemove={() => handleRemove(index)}
              />
            ))}
          </div>
        )}
      </div>

      {/* 추가 폼 */}
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={newFolder}
          onChange={(e) => setNewFolder(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              handleAdd();
            }
          }}
          placeholder="폴더명"
          disabled={saving}
          className={`w-40 px-3 py-1.5 text-sm border rounded ${BORDER_COLOR.default} ${BG_COLOR.card} ${TEXT_COLOR.primary} focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50`}
        />
        <ArrowRight className="w-4 h-4 text-gray-400 shrink-0" />
        <select
          value={newStage}
          onChange={(e) => setNewStage(e.target.value)}
          disabled={saving}
          className={`flex-1 px-3 py-1.5 text-sm border rounded ${BORDER_COLOR.default} ${BG_COLOR.card} ${TEXT_COLOR.primary} focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50`}
        >
          {PROCESS_STAGE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <Button
          variant="secondary"
          size="sm"
          type="button"
          onClick={handleAdd}
          disabled={!newFolder.trim() || saving}
          className="flex items-center gap-1"
        >
          <Plus className="w-3.5 h-3.5" />
          추가
        </Button>
      </div>
    </div>
  );
}
