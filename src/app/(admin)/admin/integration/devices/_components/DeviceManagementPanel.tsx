'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import {
  Modal,
  ModalBody,
  ModalContent,
  ModalDescription,
  ModalFooter,
  ModalHeader,
  ModalTitle,
} from '@/components/ui/modal';
import {
  approveManagedDevice,
  listManagedDevices,
  requestManagedDeviceCredentialRotation,
  revokeManagedDevice,
  type DeviceRotationSummary,
  type ManagedDeviceSummary,
} from '@/app/(admin)/admin/integration/devices/_lib/device-enrollment-api';

const PROGRAM_LABELS: Record<ManagedDeviceSummary['programType'], string> = {
  external_webhard_sync: '외부웹하드동기화프로그램',
  management_program: '유진레이저목형 관리프로그램',
  nesting_program: '레이저네스팅프로그램',
};

const STATE_LABELS: Record<ManagedDeviceSummary['state'], string> = {
  pending_approval: '승인 대기',
  active: '활성',
  revoked: '해제됨',
};

const LIST_LOAD_ERROR = '장치 목록을 불러오지 못했습니다. 목록 새로고침을 시도하세요.';
const ACTION_ERROR = '장치 상태 변경에 실패했습니다. 관리자 세션을 확인한 뒤 다시 시도하세요.';
const FRESH_LIST_ERROR =
  '장치 상태는 변경되었지만 최신 목록을 불러오지 못했습니다. 목록 새로고침을 시도하세요.';

interface RevokeConfirmation {
  readonly deviceId: string;
  readonly displayName: string;
}

interface RotationConfirmation {
  readonly deviceId: string;
  readonly displayName: string;
}

interface RotationResult {
  readonly displayName: string;
  readonly summary: DeviceRotationSummary;
}

type ListLoadPurpose = 'initial' | 'manual' | 'action';
type ListLoadResult = 'loaded' | 'failed' | 'ignored';

function formatTimestamp(value: string): string {
  return new Intl.DateTimeFormat('ko-KR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function statusBadgeVariant(state: ManagedDeviceSummary['state']): 'success' | 'warning' | 'gray' {
  if (state === 'active') return 'success';
  if (state === 'pending_approval') return 'warning';

  return 'gray';
}

export function DeviceManagementPanel() {
  const [devices, setDevices] = useState<readonly ManagedDeviceSummary[]>([]);
  const [isListLoading, setIsListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isActionPending, setIsActionPending] = useState(false);
  const [revokeConfirmation, setRevokeConfirmation] = useState<RevokeConfirmation | null>(null);
  const [rotationConfirmation, setRotationConfirmation] = useState<RotationConfirmation | null>(
    null
  );
  const [rotationResult, setRotationResult] = useState<RotationResult | null>(null);
  const activeListAbortControllerRef = useRef<AbortController | null>(null);
  const listGenerationRef = useRef(0);
  const isMountedRef = useRef(false);
  const actionPendingRef = useRef(false);

  const loadDevices = useCallback(async (purpose: ListLoadPurpose): Promise<ListLoadResult> => {
    const generation = listGenerationRef.current + 1;
    listGenerationRef.current = generation;
    activeListAbortControllerRef.current?.abort();

    const controller = new AbortController();
    activeListAbortControllerRef.current = controller;
    if (isMountedRef.current) {
      setIsListLoading(true);
      setListError(null);
    }

    try {
      const nextDevices = await listManagedDevices({ signal: controller.signal });
      if (
        !isMountedRef.current ||
        controller.signal.aborted ||
        generation !== listGenerationRef.current
      ) {
        return 'ignored';
      }

      setDevices(nextDevices);
      return 'loaded';
    } catch {
      if (
        !isMountedRef.current ||
        controller.signal.aborted ||
        generation !== listGenerationRef.current
      ) {
        return 'ignored';
      }

      setListError(purpose === 'action' ? FRESH_LIST_ERROR : LIST_LOAD_ERROR);
      return 'failed';
    } finally {
      if (activeListAbortControllerRef.current === controller) {
        activeListAbortControllerRef.current = null;
      }
      if (
        isMountedRef.current &&
        !controller.signal.aborted &&
        generation === listGenerationRef.current
      ) {
        setIsListLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    void loadDevices('initial');

    return () => {
      isMountedRef.current = false;
      listGenerationRef.current += 1;
      activeListAbortControllerRef.current?.abort();
      activeListAbortControllerRef.current = null;
    };
  }, [loadDevices]);

  const runAction = async <T,>(action: () => Promise<T>, onSuccess?: (result: T) => void) => {
    if (actionPendingRef.current) return;

    actionPendingRef.current = true;
    setActionError(null);
    setListError(null);
    setIsActionPending(true);

    try {
      const result = await action();
      if (!isMountedRef.current) return;

      onSuccess?.(result);
      setRevokeConfirmation(null);
      setRotationConfirmation(null);
      await loadDevices('action');
    } catch {
      if (isMountedRef.current) {
        setActionError(ACTION_ERROR);
      }
    } finally {
      actionPendingRef.current = false;
      if (isMountedRef.current) {
        setIsActionPending(false);
      }
    }
  };

  const handleApprove = (deviceId: string) => {
    void runAction(() => approveManagedDevice(deviceId));
  };

  const openRevokeConfirmation = (device: ManagedDeviceSummary) => {
    if (actionPendingRef.current) return;

    setActionError(null);
    setRotationResult(null);
    setRevokeConfirmation({ deviceId: device.deviceId, displayName: device.displayName });
  };

  const closeRevokeConfirmation = () => {
    if (actionPendingRef.current) return;

    setActionError(null);
    setRevokeConfirmation(null);
  };

  const confirmRevoke = () => {
    if (!revokeConfirmation) return;

    void runAction(() => revokeManagedDevice(revokeConfirmation.deviceId));
  };

  const openRotationConfirmation = (device: ManagedDeviceSummary) => {
    if (
      actionPendingRef.current ||
      device.state !== 'active' ||
      device.capabilityProfile !== 'standard'
    ) {
      return;
    }

    setActionError(null);
    setRotationResult(null);
    setRotationConfirmation({ deviceId: device.deviceId, displayName: device.displayName });
  };

  const closeRotationConfirmation = () => {
    if (actionPendingRef.current) return;

    setActionError(null);
    setRotationConfirmation(null);
  };

  const confirmRotation = () => {
    if (!rotationConfirmation) return;

    const confirmation = rotationConfirmation;
    void runAction(
      () => requestManagedDeviceCredentialRotation(confirmation.deviceId),
      (summary) => setRotationResult({ displayName: confirmation.displayName, summary })
    );
  };

  return (
    <>
      <Card>
        <CardHeader className="gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold text-foreground">등록 장치 관리</h2>
            <p className="text-sm text-muted-foreground">
              승인 대기 장치를 검토하고, 더 이상 사용하지 않는 장치의 연동을 해제합니다.
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              void loadDevices('manual');
            }}
            disabled={isListLoading}
          >
            {isListLoading ? '목록 불러오는 중…' : '목록 새로고침'}
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <div aria-live="polite" aria-atomic="true" className="space-y-3">
            {rotationResult ? (
              <Alert variant="success">
                <AlertTitle>키 재발급 요청 완료</AlertTitle>
                <AlertDescription>
                  {rotationResult.displayName} 장치가 다음 인증 시 새 키로 전환하도록 요청했습니다.
                  완료 기한: {formatTimestamp(rotationResult.summary.deadlineAt)}
                </AlertDescription>
              </Alert>
            ) : null}
            {actionError && !revokeConfirmation && !rotationConfirmation && (
              <Alert variant="error">
                <AlertTitle>상태 변경 실패</AlertTitle>
                <AlertDescription>{actionError}</AlertDescription>
              </Alert>
            )}
            {listError && (
              <Alert variant="error">
                <AlertTitle>목록 갱신 필요</AlertTitle>
                <AlertDescription>{listError}</AlertDescription>
              </Alert>
            )}
          </div>

          {isListLoading && devices.length === 0 ? (
            <p className="text-sm text-muted-foreground">등록 장치 목록을 불러오는 중입니다.</p>
          ) : null}

          {!isListLoading && devices.length === 0 && !listError ? (
            <p className="text-sm text-muted-foreground">표시할 등록 장치가 없습니다.</p>
          ) : null}

          {devices.length > 0 ? (
            <ul className="space-y-3" aria-label="등록 장치 목록">
              {devices.map((device) => (
                <li key={device.deviceId}>
                  <div className="rounded-lg border border-border p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-medium text-foreground">{device.displayName}</h3>
                          <Badge variant={statusBadgeVariant(device.state)} size="sm">
                            {STATE_LABELS[device.state]}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {PROGRAM_LABELS[device.programType]}
                        </p>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        {device.state === 'pending_approval' ? (
                          <Button
                            type="button"
                            size="sm"
                            onClick={() => handleApprove(device.deviceId)}
                            disabled={isActionPending}
                          >
                            승인
                          </Button>
                        ) : null}
                        {device.state === 'active' && device.capabilityProfile === 'standard' ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => openRotationConfirmation(device)}
                            disabled={isActionPending}
                          >
                            키 재발급
                          </Button>
                        ) : null}
                        {device.state !== 'revoked' ? (
                          <Button
                            type="button"
                            variant="danger"
                            size="sm"
                            onClick={() => openRevokeConfirmation(device)}
                            disabled={isActionPending}
                          >
                            연동 해제
                          </Button>
                        ) : null}
                      </div>
                    </div>

                    <dl className="mt-4 grid gap-x-4 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
                      <div>
                        <dt className="text-muted-foreground">환경</dt>
                        <dd className="font-medium text-foreground">{device.environment}</dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">권한 프로필</dt>
                        <dd className="font-medium text-foreground">{device.capabilityProfile}</dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">인증 버전</dt>
                        <dd className="font-medium text-foreground">{device.credentialVersion}</dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">등록 시각</dt>
                        <dd className="font-medium text-foreground">
                          {formatTimestamp(device.enrolledAt)}
                        </dd>
                      </div>
                      {device.appVersion ? (
                        <div>
                          <dt className="text-muted-foreground">앱 버전</dt>
                          <dd className="font-medium text-foreground">{device.appVersion}</dd>
                        </div>
                      ) : null}
                      {device.approvedAt ? (
                        <div>
                          <dt className="text-muted-foreground">승인 시각</dt>
                          <dd className="font-medium text-foreground">
                            {formatTimestamp(device.approvedAt)}
                          </dd>
                        </div>
                      ) : null}
                      {device.lastHeartbeatAt ? (
                        <div>
                          <dt className="text-muted-foreground">마지막 연결 확인</dt>
                          <dd className="font-medium text-foreground">
                            {formatTimestamp(device.lastHeartbeatAt)}
                          </dd>
                        </div>
                      ) : null}
                      {device.revokedAt ? (
                        <div>
                          <dt className="text-muted-foreground">해제 시각</dt>
                          <dd className="font-medium text-foreground">
                            {formatTimestamp(device.revokedAt)}
                          </dd>
                        </div>
                      ) : null}
                    </dl>
                  </div>
                </li>
              ))}
            </ul>
          ) : null}
        </CardContent>
      </Card>

      {revokeConfirmation ? (
        <Modal
          open
          onOpenChange={(isOpen) => {
            if (!isOpen) closeRevokeConfirmation();
          }}
        >
          <ModalContent
            showCloseButton={false}
            onEscapeKeyDown={(event) => {
              if (isActionPending) event.preventDefault();
            }}
            onPointerDownOutside={(event) => {
              if (isActionPending) event.preventDefault();
            }}
          >
            <ModalHeader>
              <ModalTitle>장치 연동 해제</ModalTitle>
              <ModalDescription>해제할 장치의 표시명을 확인한 뒤 진행하세요.</ModalDescription>
            </ModalHeader>
            <ModalBody className="space-y-3">
              <p className="text-sm text-foreground">
                <strong>&ldquo;{revokeConfirmation.displayName}&rdquo;</strong> 장치의 연동을
                해제하시겠습니까?
              </p>
              <p className="text-sm text-muted-foreground">
                해제 요청은 장치의 다음 인증 요청과 운영 상태에 따라 적용됩니다.
              </p>
              {actionError ? (
                <div aria-live="polite" aria-atomic="true">
                  <Alert variant="error">
                    <AlertTitle>상태 변경 실패</AlertTitle>
                    <AlertDescription>{actionError}</AlertDescription>
                  </Alert>
                </div>
              ) : null}
            </ModalBody>
            <ModalFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={closeRevokeConfirmation}
                disabled={isActionPending}
              >
                취소
              </Button>
              <Button
                type="button"
                variant="danger"
                onClick={confirmRevoke}
                disabled={isActionPending}
              >
                {isActionPending ? '해제 중…' : '해제 확인'}
              </Button>
            </ModalFooter>
          </ModalContent>
        </Modal>
      ) : null}

      {rotationConfirmation ? (
        <Modal
          open
          onOpenChange={(isOpen) => {
            if (!isOpen) closeRotationConfirmation();
          }}
        >
          <ModalContent
            showCloseButton={false}
            onEscapeKeyDown={(event) => {
              if (isActionPending) event.preventDefault();
            }}
            onPointerDownOutside={(event) => {
              if (isActionPending) event.preventDefault();
            }}
          >
            <ModalHeader>
              <ModalTitle>장치 인증키 재발급</ModalTitle>
              <ModalDescription>재발급할 장치의 표시명을 확인한 뒤 진행하세요.</ModalDescription>
            </ModalHeader>
            <ModalBody className="space-y-3">
              <p className="text-sm text-foreground">
                <strong>&ldquo;{rotationConfirmation.displayName}&rdquo;</strong> 장치에 새 인증키
                전환을 요청하시겠습니까?
              </p>
              <p className="text-sm text-muted-foreground">
                장치가 다음 인증을 수행할 때 기존 키를 안전하게 교체합니다.
              </p>
              {actionError ? (
                <div aria-live="polite" aria-atomic="true">
                  <Alert variant="error">
                    <AlertTitle>재발급 요청 실패</AlertTitle>
                    <AlertDescription>{actionError}</AlertDescription>
                  </Alert>
                </div>
              ) : null}
            </ModalBody>
            <ModalFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={closeRotationConfirmation}
                disabled={isActionPending}
              >
                취소
              </Button>
              <Button type="button" onClick={confirmRotation} disabled={isActionPending}>
                {isActionPending ? '요청 중…' : '재발급 요청'}
              </Button>
            </ModalFooter>
          </ModalContent>
        </Modal>
      ) : null}
    </>
  );
}
