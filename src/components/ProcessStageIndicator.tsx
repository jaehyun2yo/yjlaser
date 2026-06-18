'use client';

import {
  PROCESS_STAGES_ARRAY,
  getProcessStageInfo,
  getProcessProgress,
  type ProcessStage,
} from '@/lib/utils/processStages';
import { isProcessStarted } from '@/lib/utils/processStages';
import { TEXT_COLOR, BG_COLOR, BORDER_COLOR } from '@/lib/styles';

interface ProcessStageIndicatorProps {
  currentStage: ProcessStage;
  status: string;
}

export function ProcessStageIndicator({ currentStage, status }: ProcessStageIndicatorProps) {
  const isStarted = isProcessStarted(status);

  if (!isStarted) {
    return (
      <div className={`mt-4 pt-4 border-t ${BORDER_COLOR.default}`}>
        <p className={`text-xs ${TEXT_COLOR.muted} mb-3`}>공정 단계</p>
        <p className={`text-sm ${TEXT_COLOR.secondary}`}>공정이 아직 시작되지 않았습니다.</p>
      </div>
    );
  }

  const currentStageInfo = getProcessStageInfo(currentStage);
  const progress = getProcessProgress(currentStage);

  return (
    <div className={`mt-4 pt-4 border-t ${BORDER_COLOR.default}`}>
      <div className="flex items-center justify-between mb-3">
        <p className={`text-xs font-medium ${TEXT_COLOR.muted}`}>공정 단계</p>
        {currentStageInfo && (
          <span
            className={`px-2 py-1 rounded text-xs font-medium ${currentStageInfo.bgColor} ${currentStageInfo.color}`}
          >
            {currentStageInfo.label}
          </span>
        )}
      </div>

      {/* 진행 바 */}
      <div className="mb-4">
        <div className={`w-full ${BG_COLOR.light} rounded-full h-2`}>
          <div
            className="bg-[#ED6C00] h-2 rounded-full transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
        <p className={`text-xs ${TEXT_COLOR.muted} mt-1 text-right`}>{progress}%</p>
      </div>

      {/* 단계별 아이콘 */}
      <div className="flex justify-between items-start relative">
        {/* 연결선 */}
        <div className={`absolute top-3 left-0 w-full h-0.5 ${BG_COLOR.light} -z-10`} />

        {PROCESS_STAGES_ARRAY.map((stage) => {
          const isCompleted = (currentStageInfo?.order || 0) > stage.order;
          const isCurrent = currentStage === stage.id;

          return (
            <div key={stage.id} className="flex flex-col items-center">
              <div
                className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold z-10 transition-colors duration-300 ${
                  isCompleted
                    ? 'bg-green-500 text-white'
                    : isCurrent
                      ? `${stage.bgColor} ${stage.color} border-2 ${stage.borderColor}`
                      : `${BG_COLOR.strong} ${TEXT_COLOR.muted}`
                }`}
              >
                {isCompleted ? '✓' : stage.order}
              </div>
              <span
                className={`text-[10px] mt-1 ${
                  isCompleted
                    ? TEXT_COLOR.muted
                    : isCurrent
                      ? `${stage.color} font-medium`
                      : '${TEXT_COLOR.dim}'
                }`}
              >
                {stage.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
