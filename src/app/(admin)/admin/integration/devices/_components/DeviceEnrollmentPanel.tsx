'use client';

import { useState, type FormEvent } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Modal,
  ModalBody,
  ModalContent,
  ModalDescription,
  ModalFooter,
  ModalHeader,
  ModalTitle,
} from '@/components/ui/modal';
import { NativeSelect } from '@/components/ui/select';
import {
  createDeviceEnrollmentCode,
  type DeviceEnrollmentCapabilityProfile,
  type DeviceEnrollmentCodeResponse,
  type DeviceEnrollmentProgramType,
} from '../_lib/device-enrollment-api';

const PROGRAM_OPTIONS: ReadonlyArray<{
  readonly value: DeviceEnrollmentProgramType;
  readonly label: string;
}> = [
  { value: 'external_webhard_sync', label: '외부웹하드동기화프로그램' },
  { value: 'management_program', label: '유진레이저목형 관리프로그램' },
  { value: 'nesting_program', label: '레이저네스팅프로그램' },
];

const CAPABILITY_OPTIONS: ReadonlyArray<{
  readonly value: DeviceEnrollmentCapabilityProfile;
  readonly label: string;
  readonly description: string;
}> = [
  { value: 'standard', label: 'standard', description: '기본 연동 권한으로 등록합니다.' },
  {
    value: 'safe_canary',
    label: 'safe_canary',
    description: '단계적 전환 검증용 최소 권한으로 등록합니다.',
  },
];

const DISPLAY_NAME_CONTROL_CHARACTER_PATTERN = /[\u0000-\u001F\u007F]/;

function formatExpiresAt(value: string): string {
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) return '서버 응답 시간 확인 필요';

  return new Intl.DateTimeFormat('ko-KR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(timestamp));
}

export function DeviceEnrollmentPanel() {
  const [programType, setProgramType] =
    useState<DeviceEnrollmentProgramType>('external_webhard_sync');
  const [capabilityProfile, setCapabilityProfile] =
    useState<DeviceEnrollmentCapabilityProfile>('standard');
  const [expectedDisplayName, setExpectedDisplayName] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [reveal, setReveal] = useState<DeviceEnrollmentCodeResponse | null>(null);
  const [hasCopied, setHasCopied] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);

  const selectedCapability = CAPABILITY_OPTIONS.find(
    (option) => option.value === capabilityProfile
  );

  const clearReveal = () => {
    setReveal(null);
    setHasCopied(false);
    setCopyError(null);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const trimmedDisplayName = expectedDisplayName.trim();
    if (!trimmedDisplayName) {
      setValidationError('PC 표시명을 입력하세요.');
      return;
    }
    if (trimmedDisplayName.length > 100) {
      setValidationError('PC 표시명은 100자 이하여야 합니다.');
      return;
    }
    if (DISPLAY_NAME_CONTROL_CHARACTER_PATTERN.test(trimmedDisplayName)) {
      setValidationError('PC 표시명에는 제어 문자를 사용할 수 없습니다.');
      return;
    }

    setValidationError(null);
    setRequestError(null);
    setIsSubmitting(true);

    try {
      const issuedCode = await createDeviceEnrollmentCode({
        programType,
        capabilityProfile,
        expectedDisplayName: trimmedDisplayName,
      });
      setReveal(issuedCode);
      setExpectedDisplayName('');
    } catch {
      setRequestError(
        '등록 코드 발급에 실패했습니다. 관리자 세션과 CSRF 쿠키를 확인한 뒤 다시 시도하세요.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCopy = async () => {
    if (!reveal || hasCopied) return;

    if (!navigator.clipboard?.writeText) {
      setCopyError(
        '이 브라우저에서는 자동 복사를 지원하지 않습니다. 코드를 안전한 방식으로 전달하세요.'
      );
      return;
    }

    try {
      await navigator.clipboard.writeText(reveal.enrollmentCode);
      setHasCopied(true);
      setCopyError(null);
    } catch {
      setCopyError('복사에 실패했습니다. 브라우저 권한을 확인한 뒤 다시 시도하세요.');
    }
  };

  return (
    <>
      <Card>
        <CardHeader>
          <h2 className="text-lg font-semibold text-foreground">등록 코드 발급</h2>
          <p className="text-sm text-muted-foreground">
            PC 표시명만 입력합니다. 호스트명, 사용자 정보, 경로, 하드웨어 식별값은 수집하지
            않습니다.
          </p>
        </CardHeader>
        <CardContent>
          <form className="space-y-5" onSubmit={handleSubmit} noValidate>
            <div className="grid gap-5 md:grid-cols-2">
              <div className="space-y-2">
                <label
                  className="text-sm font-medium text-foreground"
                  htmlFor="device-auth-program"
                >
                  연동 프로그램
                </label>
                <NativeSelect
                  id="device-auth-program"
                  value={programType}
                  onChange={(event) =>
                    setProgramType(event.target.value as DeviceEnrollmentProgramType)
                  }
                  disabled={isSubmitting || reveal !== null}
                  className="w-full"
                >
                  {PROGRAM_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </NativeSelect>
              </div>

              <div className="space-y-2">
                <label
                  className="text-sm font-medium text-foreground"
                  htmlFor="device-auth-capability"
                >
                  권한 프로필
                </label>
                <NativeSelect
                  id="device-auth-capability"
                  value={capabilityProfile}
                  onChange={(event) =>
                    setCapabilityProfile(event.target.value as DeviceEnrollmentCapabilityProfile)
                  }
                  disabled={isSubmitting || reveal !== null}
                  className="w-full"
                >
                  {CAPABILITY_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </NativeSelect>
                <p className="text-xs text-muted-foreground">{selectedCapability?.description}</p>
              </div>
            </div>

            <div className="space-y-2">
              <label
                className="text-sm font-medium text-foreground"
                htmlFor="device-auth-display-name"
              >
                PC 표시명
              </label>
              <Input
                id="device-auth-display-name"
                value={expectedDisplayName}
                onChange={(event) => {
                  setExpectedDisplayName(event.target.value);
                  setValidationError(null);
                }}
                disabled={isSubmitting || reveal !== null}
                maxLength={100}
                placeholder="예: 사무실 관리 PC"
                autoComplete="off"
                aria-describedby="device-auth-display-name-description"
              />
              <p
                id="device-auth-display-name-description"
                className="text-xs text-muted-foreground"
              >
                설치된 PC에서 동일한 표시명을 입력해야 합니다.
              </p>
            </div>

            {validationError && <Alert variant="warning">{validationError}</Alert>}
            {requestError && (
              <Alert variant="error">
                <AlertTitle>발급 실패</AlertTitle>
                <AlertDescription>{requestError}</AlertDescription>
              </Alert>
            )}

            <div className="flex justify-end">
              <Button type="submit" disabled={isSubmitting || reveal !== null}>
                {isSubmitting ? '발급 중…' : '등록 코드 발급'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {reveal && (
        <Modal
          open
          onOpenChange={(isOpen) => {
            if (!isOpen) clearReveal();
          }}
        >
          <ModalContent showCloseButton={false}>
            <>
              <ModalHeader>
                <ModalTitle>등록 코드가 발급되었습니다</ModalTitle>
                <ModalDescription>
                  이 코드는 지금 한 번만 확인할 수 있습니다. 복사한 뒤 대상 PC의 등록 화면에
                  안전하게 입력하세요.
                </ModalDescription>
              </ModalHeader>
              <ModalBody className="space-y-4">
                <div className="rounded-lg border border-warning bg-warning-light p-3 text-sm text-foreground">
                  코드 창을 닫으면 브라우저 메모리에서 즉시 삭제되며 다시 표시할 수 없습니다.
                </div>
                <div className="rounded-lg border border-border bg-muted p-4">
                  <code
                    data-testid="device-enrollment-code"
                    className="block break-all font-mono text-sm text-foreground"
                  >
                    {reveal.enrollmentCode}
                  </code>
                </div>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                  <div>
                    <dt className="text-muted-foreground">환경</dt>
                    <dd className="font-medium text-foreground">{reveal.environment}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">만료</dt>
                    <dd className="font-medium text-foreground">
                      {formatExpiresAt(reveal.expiresAt)}
                    </dd>
                  </div>
                </dl>
                {hasCopied && <p className="text-sm text-success">복사되었습니다.</p>}
                {copyError && <Alert variant="error">{copyError}</Alert>}
              </ModalBody>
              <ModalFooter>
                <Button type="button" variant="ghost" onClick={clearReveal}>
                  닫기
                </Button>
                <Button type="button" onClick={handleCopy} disabled={hasCopied}>
                  {hasCopied ? '복사 완료' : '코드 복사'}
                </Button>
              </ModalFooter>
            </>
          </ModalContent>
        </Modal>
      )}
    </>
  );
}
