'use client';

import { useEffect, useState } from 'react';
import { RefreshCw, Monitor, Wifi, WifiOff } from 'lucide-react';
import { TEXT_COLOR, BG_COLOR, BORDER_COLOR } from '@/lib/styles';
import { Button } from '@/components/ui/button';
import { usePrograms } from '@/app/(admin)/admin/integration/_lib/hooks';
import { IntegrationNav, ProgramStatusCard } from '@/app/(admin)/admin/integration/_components';

export default function ProgramsPage() {
  const { data: programs = [], isLoading, refetch, dataUpdatedAt } = usePrograms();
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [countdown, setCountdown] = useState(30);

  // 마지막 갱신 시간 추적
  useEffect(() => {
    if (dataUpdatedAt) {
      setLastRefresh(new Date(dataUpdatedAt));
      setCountdown(30);
    }
  }, [dataUpdatedAt]);

  // 카운트다운 타이머
  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) return 30;
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const onlineCount = programs.filter((p) => p.status === 'online').length;
  const offlineCount = programs.filter((p) => p.status === 'offline').length;
  const errorCount = programs.filter((p) => p.status === 'error').length;

  return (
    <div className="space-y-6">
      <IntegrationNav />

      {/* 헤더 */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className={`text-2xl font-bold ${TEXT_COLOR.primary}`}>프로그램 모니터링</h1>
          <p className={`text-sm mt-1 ${TEXT_COLOR.secondary}`}>
            연결된 프로그램들의 실시간 상태를 확인하세요
          </p>
        </div>

        <div className="flex items-center gap-3">
          {lastRefresh && (
            <div className={`flex items-center gap-1.5 text-xs ${TEXT_COLOR.secondary}`}>
              <RefreshCw className="w-3.5 h-3.5" />
              <span>{countdown}초 후 자동 갱신</span>
            </div>
          )}
          <Button
            variant="ghost"
            onClick={() => refetch()}
            disabled={isLoading}
            className="flex items-center gap-2"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            새로고침
          </Button>
        </div>
      </div>

      {/* 요약 카드 */}
      <div className="grid grid-cols-3 gap-4">
        <div
          className={`p-4 rounded-xl border ${BORDER_COLOR.default} ${BG_COLOR.card} text-center`}
        >
          <div className="flex items-center justify-center gap-2 mb-1">
            <Wifi className="w-4 h-4 text-green-500" />
            <span className={`text-xs font-medium ${TEXT_COLOR.success}`}>온라인</span>
          </div>
          <p className={`text-3xl font-bold ${TEXT_COLOR.success}`}>{onlineCount}</p>
        </div>

        <div
          className={`p-4 rounded-xl border ${BORDER_COLOR.default} ${BG_COLOR.card} text-center`}
        >
          <div className="flex items-center justify-center gap-2 mb-1">
            <WifiOff className="w-4 h-4 text-gray-400" />
            <span className={`text-xs font-medium ${TEXT_COLOR.muted}`}>오프라인</span>
          </div>
          <p className={`text-3xl font-bold ${TEXT_COLOR.muted}`}>{offlineCount}</p>
        </div>

        <div
          className={`p-4 rounded-xl border ${BORDER_COLOR.default} ${BG_COLOR.card} text-center`}
        >
          <div className="flex items-center justify-center gap-2 mb-1">
            <Monitor className="w-4 h-4 text-red-500" />
            <span className={`text-xs font-medium ${TEXT_COLOR.error}`}>오류</span>
          </div>
          <p className={`text-3xl font-bold ${TEXT_COLOR.error}`}>{errorCount}</p>
        </div>
      </div>

      {/* 프로그램 그리드 */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className={`h-40 rounded-xl ${BG_COLOR.light} animate-pulse`} />
          ))}
        </div>
      ) : programs.length === 0 ? (
        <div
          className={`p-16 text-center ${BG_COLOR.card} rounded-xl border ${BORDER_COLOR.default} ${TEXT_COLOR.muted}`}
        >
          <Monitor className="w-12 h-12 mx-auto mb-4 opacity-40" />
          <p className="text-lg font-medium">연결된 프로그램이 없습니다</p>
          <p className="text-sm mt-1">백엔드 서버에 프로그램을 등록하세요</p>
        </div>
      ) : (
        <>
          {/* 온라인 프로그램 */}
          {onlineCount > 0 && (
            <section>
              <h2
                className={`text-sm font-semibold mb-3 flex items-center gap-2 ${TEXT_COLOR.secondary}`}
              >
                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                온라인 ({onlineCount})
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {programs
                  .filter((p) => p.status === 'online')
                  .map((program) => (
                    <ProgramStatusCard key={program.id} program={program} />
                  ))}
              </div>
            </section>
          )}

          {/* 오류 프로그램 */}
          {errorCount > 0 && (
            <section>
              <h2
                className={`text-sm font-semibold mb-3 flex items-center gap-2 ${TEXT_COLOR.error}`}
              >
                <div className="w-2 h-2 rounded-full bg-red-500" />
                오류 ({errorCount})
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {programs
                  .filter((p) => p.status === 'error')
                  .map((program) => (
                    <ProgramStatusCard key={program.id} program={program} />
                  ))}
              </div>
            </section>
          )}

          {/* 오프라인 프로그램 */}
          {offlineCount > 0 && (
            <section>
              <h2
                className={`text-sm font-semibold mb-3 flex items-center gap-2 ${TEXT_COLOR.muted}`}
              >
                <div className="w-2 h-2 rounded-full bg-gray-400" />
                오프라인 ({offlineCount})
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {programs
                  .filter((p) => p.status === 'offline')
                  .map((program) => (
                    <ProgramStatusCard key={program.id} program={program} />
                  ))}
              </div>
            </section>
          )}
        </>
      )}

      {/* 마지막 갱신 시간 */}
      {lastRefresh && (
        <p className={`text-xs text-center ${TEXT_COLOR.muted}`}>
          마지막 갱신: {lastRefresh.toLocaleTimeString('ko-KR')}
        </p>
      )}
    </div>
  );
}
