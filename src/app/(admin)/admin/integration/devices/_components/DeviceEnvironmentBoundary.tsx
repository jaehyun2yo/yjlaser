'use client';

import { useEffect, useState } from 'react';
import { DeviceEnrollmentPanel } from '@/app/(admin)/admin/integration/devices/_components/DeviceEnrollmentPanel';
import { DeviceManagementPanel } from '@/app/(admin)/admin/integration/devices/_components/DeviceManagementPanel';
import {
  DEVICE_AUTH_ENVIRONMENT_LABELS,
  type DeviceAuthEnvironment,
} from '@/app/(admin)/admin/integration/devices/_lib/device-auth-environment';
import { getDeviceAuthRuntimeEnvironment } from '@/app/(admin)/admin/integration/devices/_lib/device-enrollment-api';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

interface DeviceEnvironmentBoundaryProps {
  readonly expectedEnvironment: DeviceAuthEnvironment | null;
}

type RuntimeEnvironmentState =
  | { readonly status: 'loading' }
  | { readonly status: 'failed' }
  | { readonly status: 'loaded'; readonly environment: DeviceAuthEnvironment };

export function DeviceEnvironmentBoundary({ expectedEnvironment }: DeviceEnvironmentBoundaryProps) {
  const [checkGeneration, setCheckGeneration] = useState(0);
  const [runtimeState, setRuntimeState] = useState<RuntimeEnvironmentState>({
    status: 'loading',
  });

  useEffect(() => {
    if (expectedEnvironment === null) {
      return undefined;
    }

    const controller = new AbortController();
    let active = true;
    setRuntimeState({ status: 'loading' });

    void getDeviceAuthRuntimeEnvironment({ signal: controller.signal })
      .then((environment) => {
        if (active) {
          setRuntimeState({ status: 'loaded', environment });
        }
      })
      .catch(() => {
        if (active && !controller.signal.aborted) {
          setRuntimeState({ status: 'failed' });
        }
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [checkGeneration, expectedEnvironment]);

  if (expectedEnvironment === null) {
    return (
      <Alert variant="error">
        <AlertTitle>환경 설정 누락</AlertTitle>
        <AlertDescription>
          이 관리자 화면의 장치 인증 환경이 지정되지 않아 모든 장치 제어를 차단했습니다.
        </AlertDescription>
      </Alert>
    );
  }

  if (runtimeState.status === 'loading') {
    return (
      <Alert>
        <AlertTitle>환경 확인 중</AlertTitle>
        <AlertDescription>
          연결된 장치 인증 서버의 환경을 확인한 뒤 제어 화면을 엽니다.
        </AlertDescription>
      </Alert>
    );
  }

  if (runtimeState.status === 'failed') {
    return (
      <Alert variant="error">
        <AlertTitle>환경 확인 실패</AlertTitle>
        <AlertDescription className="space-y-3">
          <p>연결된 장치 인증 서버의 환경을 확인할 수 없어 모든 장치 제어를 차단했습니다.</p>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setCheckGeneration((generation) => generation + 1)}
          >
            환경 다시 확인
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  if (runtimeState.environment !== expectedEnvironment) {
    return (
      <Alert variant="error">
        <AlertTitle>환경 연결 불일치</AlertTitle>
        <AlertDescription className="space-y-3">
          <p>
            화면 설정은 {DEVICE_AUTH_ENVIRONMENT_LABELS[expectedEnvironment]}이지만 연결된 서버는{' '}
            {DEVICE_AUTH_ENVIRONMENT_LABELS[runtimeState.environment]}입니다. 모든 장치 제어를
            차단했습니다.
          </p>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setCheckGeneration((generation) => generation + 1)}
          >
            환경 다시 확인
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <>
      <Alert variant="success">
        <AlertTitle>{DEVICE_AUTH_ENVIRONMENT_LABELS[runtimeState.environment]}</AlertTitle>
        <AlertDescription>
          화면 설정과 장치 인증 서버 환경이 일치합니다. 아래 작업은 이 환경의 장치에만 적용됩니다.
        </AlertDescription>
      </Alert>
      <DeviceEnrollmentPanel environment={expectedEnvironment} />
      <DeviceManagementPanel environment={expectedEnvironment} />
    </>
  );
}
