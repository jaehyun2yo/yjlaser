'use client';

import { useState } from 'react';
import { IntegrationNav } from '@/app/(admin)/admin/integration/_components';
import {
  WorkerList,
  WorkerFormModal,
  AccessLogDashboard,
  WorkerWorkflowMonitor,
} from './_components';
import { BORDER_COLOR, TEXT_COLOR } from '@/lib/styles';
import { UserPlus, Users, Shield, Activity } from 'lucide-react';
import type { Worker } from '@/app/(admin)/admin/erp/_lib/types';

type Tab = 'workers' | 'workflow' | 'security';

export default function WorkersPage() {
  const [activeTab, setActiveTab] = useState<Tab>('workers');
  const [showModal, setShowModal] = useState(false);
  const [editingWorker, setEditingWorker] = useState<Worker | null>(null);

  const handleAdd = () => {
    setEditingWorker(null);
    setShowModal(true);
  };

  const handleEdit = (worker: Worker) => {
    setEditingWorker(worker);
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setEditingWorker(null);
  };

  const tabs: { key: Tab; label: string; icon: typeof Users }[] = [
    { key: 'workers', label: '작업자 목록', icon: Users },
    { key: 'workflow', label: '워크플로우', icon: Activity },
    { key: 'security', label: '보안 로그', icon: Shield },
  ];

  return (
    <div className="space-y-6">
      <IntegrationNav />

      {/* 헤더 */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className={`text-2xl font-bold ${TEXT_COLOR.primary}`}>작업자 관리</h1>
          <p className={`text-sm mt-1 ${TEXT_COLOR.secondary}`}>
            작업자 등록, 워크플로우 모니터링, 보안 로그를 관리합니다
          </p>
        </div>
        {activeTab === 'workers' && (
          <button
            onClick={handleAdd}
            className="px-4 py-2 text-sm bg-[#ED6C00] text-white rounded-lg hover:bg-[#d15f00] transition flex items-center gap-2 self-start sm:self-auto"
          >
            <UserPlus className="w-4 h-4" />
            작업자 추가
          </button>
        )}
      </div>

      {/* 탭 */}
      <div className={`flex gap-1 border-b ${BORDER_COLOR.default}`}>
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition ${
                activeTab === tab.key
                  ? 'border-[#ED6C00] text-[#ED6C00]'
                  : `border-transparent ${TEXT_COLOR.muted} ${TEXT_COLOR.hoverPrimary}`
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* 탭 내용 */}
      {activeTab === 'workers' && <WorkerList onEdit={handleEdit} />}
      {activeTab === 'workflow' && <WorkerWorkflowMonitor />}
      {activeTab === 'security' && <AccessLogDashboard />}

      {/* 추가/수정 모달 */}
      {showModal && <WorkerFormModal worker={editingWorker} onClose={handleCloseModal} />}
    </div>
  );
}
