'use client';

import { useState, useEffect, useCallback } from 'react';
import { BG_COLOR, TEXT_COLOR, BORDER_COLOR } from '@/lib/styles';
import { Button } from '@/components/ui/button';
import {
  getAutoContactExcludedFolders,
  updateAutoContactExcludedFolders,
} from '@/app/actions/webhard';
import { X, Plus, Loader2 } from 'lucide-react';

export default function AutoContactExcludedFoldersSettings() {
  const [folders, setFolders] = useState<string[]>([]);
  const [newFolder, setNewFolder] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const loadFolders = useCallback(async () => {
    const result = await getAutoContactExcludedFolders();
    if (result.success && result.folders) {
      setFolders(result.folders);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadFolders();
  }, [loadFolders]);

  const showMessage = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 2000);
  };

  const saveToDb = async (next: string[]) => {
    setSaving(true);
    const result = await updateAutoContactExcludedFolders(next);
    if (result.success) {
      setFolders(next);
      showMessage('success', '저장됨');
    } else {
      showMessage('error', result.error || '저장 실패');
    }
    setSaving(false);
  };

  const handleAdd = () => {
    const trimmed = newFolder.trim();
    if (!trimmed) return;
    if (folders.includes(trimmed)) {
      showMessage('error', '이미 존재하는 폴더명입니다.');
      return;
    }
    setNewFolder('');
    saveToDb([...folders, trimmed]);
  };

  const handleRemove = (index: number) => {
    saveToDb(folders.filter((_, i) => i !== index));
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
          <h2 className={`text-lg font-bold ${TEXT_COLOR.primary}`}>문의 자동생성 제외 설정</h2>
          <p className={`text-sm ${TEXT_COLOR.secondary} mt-1`}>
            아래 이름과 일치하는 폴더에 업로드된 파일은 문의가 자동 생성되지 않습니다.
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

      {/* 폴더 태그 */}
      <div className={`border rounded-lg p-4 ${BORDER_COLOR.default} ${BG_COLOR.gray} mb-4`}>
        {folders.length === 0 ? (
          <p className={`text-sm ${TEXT_COLOR.secondary} italic`}>
            제외 폴더가 없습니다. 아래에서 추가하세요.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {folders.map((folder, index) => (
              <span
                key={index}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium ${BG_COLOR.card} border ${BORDER_COLOR.default} ${TEXT_COLOR.primary}`}
              >
                {folder}
                <button
                  type="button"
                  onClick={() => handleRemove(index)}
                  disabled={saving}
                  className={`p-0.5 rounded-full text-gray-400 hover:text-red-500 ${BG_COLOR.hoverErrorDark} transition-colors disabled:opacity-50`}
                  title="제거"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* 추가 */}
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
          placeholder="폴더명 입력"
          disabled={saving}
          className={`flex-1 px-3 py-1.5 text-sm border rounded ${BORDER_COLOR.default} ${BG_COLOR.card} ${TEXT_COLOR.primary} focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50`}
        />
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
