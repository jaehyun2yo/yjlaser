/**
 * @jest-environment jsdom
 */

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import DevicesPage from '@/app/(admin)/admin/integration/devices/page';
import {
  approveManagedDevice,
  createDeviceEnrollmentCode,
  getDeviceAuthRuntimeEnvironment,
  listManagedDevices,
  requestManagedDeviceCredentialRotation,
  revokeManagedDevice,
  type DeviceEnrollmentStatus,
  type DeviceRotationSummary,
  type ManagedDeviceSummary,
} from '@/app/(admin)/admin/integration/devices/_lib/device-enrollment-api';

jest.mock('next/navigation', () => ({
  usePathname: () => '/admin/integration/devices',
}));

jest.mock('@/app/(admin)/admin/integration/devices/_lib/device-enrollment-api', () => ({
  approveManagedDevice: jest.fn(),
  createDeviceEnrollmentCode: jest.fn(),
  getDeviceAuthRuntimeEnvironment: jest.fn(),
  listManagedDevices: jest.fn(),
  requestManagedDeviceCredentialRotation: jest.fn(),
  revokeManagedDevice: jest.fn(),
}));

const approveManagedDeviceMock = jest.mocked(approveManagedDevice);
const createDeviceEnrollmentCodeMock = jest.mocked(createDeviceEnrollmentCode);
const getDeviceAuthRuntimeEnvironmentMock = jest.mocked(getDeviceAuthRuntimeEnvironment);
const listManagedDevicesMock = jest.mocked(listManagedDevices);
const requestManagedDeviceCredentialRotationMock = jest.mocked(
  requestManagedDeviceCredentialRotation
);
const revokeManagedDeviceMock = jest.mocked(revokeManagedDevice);

const pendingDevice: ManagedDeviceSummary = {
  deviceId: 'b7dfcfe3-1a80-4ee2-92c9-5be9925c12a3',
  environment: 'dev',
  programType: 'management_program',
  capabilityProfile: 'safe_canary',
  displayName: '관리 프로그램 사무실 PC',
  appVersion: '1.2.3',
  state: 'pending_approval',
  credentialVersion: 1,
  enrolledAt: '2026-07-20T12:00:00.000Z',
};

const activeDevice: ManagedDeviceSummary = {
  deviceId: '8763d3d9-4b84-4dc1-8526-18175a8ced20',
  environment: 'dev',
  programType: 'nesting_program',
  capabilityProfile: 'standard',
  displayName: '네스팅 작업 PC',
  appVersion: '2.0.0',
  state: 'active',
  credentialVersion: 2,
  enrolledAt: '2026-07-19T12:00:00.000Z',
  approvedAt: '2026-07-19T12:05:00.000Z',
};

const activeSafeCanaryDevice: ManagedDeviceSummary = {
  ...activeDevice,
  deviceId: 'a2f8ec25-a888-4a9e-8792-9ffed2bbd283',
  displayName: '네스팅 시험 PC',
  capabilityProfile: 'safe_canary',
};

const approvedStatus: DeviceEnrollmentStatus = {
  deviceId: pendingDevice.deviceId,
  environment: 'dev',
  programType: 'management_program',
  capabilityProfile: 'safe_canary',
  state: 'active',
  credentialVersion: 1,
};

const requestedRotation: DeviceRotationSummary = {
  id: 'd978ca90-3dc7-47eb-b719-f58d68ad3aa4',
  deviceId: activeDevice.deviceId,
  status: 'requested',
  deadlineAt: '2026-07-20T12:15:00.000Z',
  credentialVersion: 3,
};

function createDeferred<T>() {
  let resolve: ((value: T) => void) | undefined;
  let reject: ((reason?: unknown) => void) | undefined;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });

  return {
    promise,
    resolve: (value: T) => resolve?.(value),
    reject: (reason?: unknown) => reject?.(reason),
  };
}

describe('Device enrollment page', () => {
  const clipboardWriteText = jest.fn<Promise<void>, [string]>();
  const originalExpectedEnvironment = process.env.NEXT_PUBLIC_DEVICE_AUTH_ENVIRONMENT;

  beforeEach(() => {
    approveManagedDeviceMock.mockReset();
    createDeviceEnrollmentCodeMock.mockReset();
    getDeviceAuthRuntimeEnvironmentMock.mockReset();
    listManagedDevicesMock.mockReset();
    requestManagedDeviceCredentialRotationMock.mockReset();
    revokeManagedDeviceMock.mockReset();
    clipboardWriteText.mockReset();
    clipboardWriteText.mockResolvedValue(undefined);
    process.env.NEXT_PUBLIC_DEVICE_AUTH_ENVIRONMENT = 'dev';
    getDeviceAuthRuntimeEnvironmentMock.mockResolvedValue('dev');
    listManagedDevicesMock.mockResolvedValue([]);
    Object.assign(navigator, {
      clipboard: { writeText: clipboardWriteText },
    });
  });

  afterAll(() => {
    if (originalExpectedEnvironment === undefined) {
      delete process.env.NEXT_PUBLIC_DEVICE_AUTH_ENVIRONMENT;
    } else {
      process.env.NEXT_PUBLIC_DEVICE_AUTH_ENVIRONMENT = originalExpectedEnvironment;
    }
  });

  function expectDeviceControlsBlocked(): void {
    expect(screen.queryByRole('heading', { name: '등록 코드 발급' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '등록 장치 관리' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '등록 코드 발급' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '승인' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '연동 해제' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '키 재발급' })).not.toBeInTheDocument();
  }

  function expectDeviceMutationsNotCalled(): void {
    expect(listManagedDevicesMock).not.toHaveBeenCalled();
    expect(createDeviceEnrollmentCodeMock).not.toHaveBeenCalled();
    expect(approveManagedDeviceMock).not.toHaveBeenCalled();
    expect(revokeManagedDeviceMock).not.toHaveBeenCalled();
    expect(requestManagedDeviceCredentialRotationMock).not.toHaveBeenCalled();
  }

  it('shows the development environment and enables controls only when dev matches dev', async () => {
    render(<DevicesPage />);

    expect(await screen.findByText('개발 환경 (dev)')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '등록 코드 발급' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '등록 장치 관리' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '등록 코드 발급' })).toBeEnabled();
  });

  it('blocks every device action when the frontend and backend environments differ', async () => {
    getDeviceAuthRuntimeEnvironmentMock.mockResolvedValue('prd');
    listManagedDevicesMock.mockResolvedValue([pendingDevice, activeDevice]);

    render(<DevicesPage />);

    const mismatchTitle = await screen.findByText('환경 연결 불일치');
    const mismatchAlert = mismatchTitle.closest('[role="alert"]');
    expect(mismatchAlert).toHaveTextContent('개발 환경 (dev)');
    expect(mismatchAlert).toHaveTextContent('운영 환경 (prd)');
    expectDeviceControlsBlocked();
    expectDeviceMutationsNotCalled();
  });

  it('blocks every device action without calling the backend when expected environment is missing', () => {
    delete process.env.NEXT_PUBLIC_DEVICE_AUTH_ENVIRONMENT;
    listManagedDevicesMock.mockResolvedValue([pendingDevice, activeDevice]);

    render(<DevicesPage />);

    expect(screen.getByText('환경 설정 누락')).toBeInTheDocument();
    expect(getDeviceAuthRuntimeEnvironmentMock).not.toHaveBeenCalled();
    expectDeviceControlsBlocked();
    expectDeviceMutationsNotCalled();
  });

  it('keeps controls blocked through request failure and mismatch until a retry returns the expected environment', async () => {
    getDeviceAuthRuntimeEnvironmentMock
      .mockRejectedValueOnce(new Error('runtime unavailable'))
      .mockResolvedValueOnce('prd')
      .mockResolvedValueOnce('dev');
    listManagedDevicesMock.mockResolvedValue([pendingDevice, activeDevice]);

    render(<DevicesPage />);

    expect(await screen.findByText('환경 확인 실패')).toBeInTheDocument();
    expectDeviceControlsBlocked();
    expectDeviceMutationsNotCalled();

    fireEvent.click(screen.getByRole('button', { name: '환경 다시 확인' }));
    expect(await screen.findByText('환경 연결 불일치')).toBeInTheDocument();
    expectDeviceControlsBlocked();
    expectDeviceMutationsNotCalled();

    fireEvent.click(screen.getByRole('button', { name: '환경 다시 확인' }));
    expect(await screen.findByText('개발 환경 (dev)')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '등록 코드 발급' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '등록 장치 관리' })).toBeInTheDocument();
    await waitFor(() => {
      expect(listManagedDevicesMock).toHaveBeenCalledTimes(1);
    });
    expect(createDeviceEnrollmentCodeMock).not.toHaveBeenCalled();
    expect(approveManagedDeviceMock).not.toHaveBeenCalled();
    expect(revokeManagedDeviceMock).not.toHaveBeenCalled();
    expect(requestManagedDeviceCredentialRotationMock).not.toHaveBeenCalled();
  });

  it('issues an enrollment code for only the supported desktop programs', async () => {
    createDeviceEnrollmentCodeMock.mockResolvedValue({
      enrollmentCode: 'enrollment-code-raw-value',
      enrollmentId: 'enrollment-1',
      environment: 'dev',
      programType: 'management_program',
      capabilityProfile: 'safe_canary',
      expiresAt: '2026-07-20T12:10:00.000Z',
    });

    render(<DevicesPage />);

    expect(screen.getByRole('link', { name: /장치 인증/ })).toHaveAttribute(
      'href',
      '/admin/integration/devices'
    );
    expect(screen.getByRole('heading', { name: '장치 인증' })).toBeInTheDocument();
    expect(
      await screen.findByRole('option', { name: '외부웹하드동기화프로그램' })
    ).toBeInTheDocument();
    expect(screen.getByRole('option', { name: '유진레이저목형 관리프로그램' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: '레이저네스팅프로그램' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /computeroff/i })).toBeNull();

    fireEvent.change(screen.getByLabelText('연동 프로그램'), {
      target: { value: 'management_program' },
    });
    fireEvent.change(screen.getByLabelText('권한 프로필'), {
      target: { value: 'safe_canary' },
    });
    fireEvent.change(screen.getByLabelText('PC 표시명'), {
      target: { value: '관리 프로그램 - 사무실 PC' },
    });
    fireEvent.click(screen.getByRole('button', { name: '등록 코드 발급' }));

    await waitFor(() => {
      expect(createDeviceEnrollmentCodeMock).toHaveBeenCalledWith(
        {
          programType: 'management_program',
          capabilityProfile: 'safe_canary',
          expectedDisplayName: '관리 프로그램 - 사무실 PC',
        },
        'dev'
      );
    });
    expect(screen.getByTestId('device-enrollment-code')).toHaveTextContent(
      'enrollment-code-raw-value'
    );
  });

  it('allows one successful copy and clears the raw code when the reveal is closed', async () => {
    createDeviceEnrollmentCodeMock.mockResolvedValue({
      enrollmentCode: 'enrollment-code-raw-value',
      enrollmentId: 'enrollment-1',
      environment: 'dev',
      programType: 'external_webhard_sync',
      capabilityProfile: 'standard',
      expiresAt: '2026-07-20T12:10:00.000Z',
    });

    render(<DevicesPage />);
    fireEvent.change(await screen.findByLabelText('PC 표시명'), {
      target: { value: '동기화 PC 1' },
    });
    fireEvent.click(screen.getByRole('button', { name: '등록 코드 발급' }));

    await screen.findByTestId('device-enrollment-code');
    fireEvent.click(screen.getByRole('button', { name: '코드 복사' }));

    await waitFor(() => {
      expect(clipboardWriteText).toHaveBeenCalledWith('enrollment-code-raw-value');
    });
    await waitFor(() => {
      expect(screen.getByRole('button', { name: '복사 완료' })).toBeDisabled();
      expect(screen.getByText('복사되었습니다.')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: '닫기' }));

    expect(screen.queryByTestId('device-enrollment-code')).toBeNull();
    expect(screen.queryByText('enrollment-code-raw-value')).toBeNull();
  });

  it('shows safe device summaries, allows approval only for pending devices, and refreshes after approval', async () => {
    listManagedDevicesMock
      .mockResolvedValueOnce([pendingDevice, activeDevice])
      .mockResolvedValueOnce([
        { ...pendingDevice, state: 'active', approvedAt: '2026-07-20T12:05:00.000Z' },
        activeDevice,
      ]);
    approveManagedDeviceMock.mockResolvedValue(approvedStatus);

    render(<DevicesPage />);

    await screen.findByText(pendingDevice.displayName);
    expect(screen.getByText(activeDevice.displayName)).toBeInTheDocument();
    expect(screen.queryByText(/computeroff/i)).toBeNull();
    expect(screen.getAllByRole('button', { name: '승인' })).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: '승인' }));

    await waitFor(() => {
      expect(approveManagedDeviceMock).toHaveBeenCalledWith(pendingDevice.deviceId, 'dev');
    });
    await waitFor(() => {
      expect(listManagedDevicesMock).toHaveBeenCalledTimes(2);
    });
    expect(screen.getAllByText('활성')).toHaveLength(2);
  });

  it('requires a local display-name-only confirmation before revoking and refreshes after confirmation', async () => {
    const pendingRevoke = createDeferred<ManagedDeviceSummary>();
    listManagedDevicesMock
      .mockResolvedValueOnce([activeDevice])
      .mockResolvedValueOnce([{ ...activeDevice, state: 'revoked' }]);
    revokeManagedDeviceMock.mockReturnValue(pendingRevoke.promise);

    render(<DevicesPage />);

    await screen.findByText(activeDevice.displayName);
    fireEvent.click(screen.getByRole('button', { name: '연동 해제' }));

    const confirmation = await screen.findByRole('dialog');
    expect(confirmation).toHaveTextContent(activeDevice.displayName);
    expect(confirmation).not.toHaveTextContent(activeDevice.deviceId);
    expect(confirmation).not.toHaveTextContent(activeDevice.appVersion ?? '');
    expect(screen.queryByRole('button', { name: 'Close' })).toBeNull();
    expect(revokeManagedDeviceMock).not.toHaveBeenCalled();

    const confirmButton = screen.getByRole('button', { name: '해제 확인' });
    fireEvent.click(confirmButton);
    fireEvent.click(confirmButton);

    await waitFor(() => {
      expect(revokeManagedDeviceMock).toHaveBeenCalledWith(activeDevice.deviceId, 'dev');
    });
    expect(revokeManagedDeviceMock).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: '취소' })).toBeDisabled();
    fireEvent.keyDown(confirmation, { key: 'Escape' });
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    pendingRevoke.resolve({ ...activeDevice, state: 'revoked' });

    await waitFor(() => {
      expect(listManagedDevicesMock).toHaveBeenCalledTimes(2);
    });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('requests remote credential reissue only for an active device after local confirmation', async () => {
    listManagedDevicesMock
      .mockResolvedValueOnce([pendingDevice, activeDevice, activeSafeCanaryDevice])
      .mockResolvedValueOnce([pendingDevice, activeDevice, activeSafeCanaryDevice]);
    requestManagedDeviceCredentialRotationMock.mockResolvedValue(requestedRotation);

    render(<DevicesPage />);

    await screen.findByText(activeDevice.displayName);
    expect(screen.getByText(activeSafeCanaryDevice.displayName)).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: '키 재발급' })).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: '키 재발급' }));

    const confirmation = await screen.findByRole('dialog');
    expect(confirmation).toHaveTextContent(activeDevice.displayName);
    expect(confirmation).not.toHaveTextContent(activeDevice.deviceId);
    expect(requestManagedDeviceCredentialRotationMock).not.toHaveBeenCalled();

    fireEvent.click(within(confirmation).getByRole('button', { name: '재발급 요청' }));

    await waitFor(() => {
      expect(requestManagedDeviceCredentialRotationMock).toHaveBeenCalledWith(
        activeDevice.deviceId,
        'dev'
      );
    });
    await waitFor(() => {
      expect(listManagedDevicesMock).toHaveBeenCalledTimes(2);
    });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByText('키 재발급 요청 완료')).toBeInTheDocument();
    expect(screen.getByText(/다음 인증 시 새 키로 전환/)).toBeInTheDocument();
  });

  it('keeps an action refresh when an earlier list refresh resolves afterwards', async () => {
    const staleRefresh = createDeferred<readonly ManagedDeviceSummary[]>();
    listManagedDevicesMock
      .mockResolvedValueOnce([pendingDevice])
      .mockReturnValueOnce(staleRefresh.promise)
      .mockResolvedValueOnce([{ ...pendingDevice, state: 'active' }]);
    approveManagedDeviceMock.mockResolvedValue(approvedStatus);

    render(<DevicesPage />);

    await screen.findByText(pendingDevice.displayName);
    fireEvent.click(screen.getByRole('button', { name: '목록 새로고침' }));
    fireEvent.click(screen.getByRole('button', { name: '승인' }));

    await waitFor(() => {
      expect(listManagedDevicesMock).toHaveBeenCalledTimes(3);
    });
    await screen.findByText('활성');

    staleRefresh.resolve([pendingDevice]);

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: '승인' })).toBeNull();
    });
    expect(
      screen.queryByText('장치 목록을 불러오지 못했습니다. 목록 새로고침을 시도하세요.')
    ).toBeNull();
  });

  it('reports a fresh-list failure after a successful action without retrying the action', async () => {
    listManagedDevicesMock
      .mockResolvedValueOnce([pendingDevice])
      .mockRejectedValueOnce(new Error('network unavailable'));
    approveManagedDeviceMock.mockResolvedValue(approvedStatus);

    render(<DevicesPage />);

    await screen.findByText(pendingDevice.displayName);
    fireEvent.click(screen.getByRole('button', { name: '승인' }));

    const feedback = await screen.findByText(
      '장치 상태는 변경되었지만 최신 목록을 불러오지 못했습니다. 목록 새로고침을 시도하세요.'
    );
    expect(feedback.closest('[aria-live]')).not.toBeNull();
    expect(approveManagedDeviceMock).toHaveBeenCalledTimes(1);
    expect(listManagedDevicesMock).toHaveBeenCalledTimes(2);
  });

  it('keeps a failed revoke confirmation open and announces only a generic error inside the dialog', async () => {
    listManagedDevicesMock.mockResolvedValue([activeDevice]);
    revokeManagedDeviceMock.mockRejectedValue(
      new Error('raw server detail must not be rendered to an administrator')
    );

    render(<DevicesPage />);

    await screen.findByText(activeDevice.displayName);
    fireEvent.click(screen.getByRole('button', { name: '연동 해제' }));
    const confirmation = await screen.findByRole('dialog');
    fireEvent.click(within(confirmation).getByRole('button', { name: '해제 확인' }));

    const error = await within(confirmation).findByText(
      '장치 상태 변경에 실패했습니다. 관리자 세션을 확인한 뒤 다시 시도하세요.'
    );
    expect(error.closest('[aria-live]')).not.toBeNull();
    expect(confirmation).not.toHaveTextContent('raw server detail');
    expect(revokeManagedDeviceMock).toHaveBeenCalledTimes(1);
  });

  it('aborts an unmounted list request without surfacing its cancellation as an error', async () => {
    const pendingList = createDeferred<readonly ManagedDeviceSummary[]>();
    let requestSignal: AbortSignal | undefined;
    listManagedDevicesMock.mockImplementation((options) => {
      requestSignal = options?.signal;
      return pendingList.promise;
    });

    const { unmount } = render(<DevicesPage />);

    await waitFor(() => {
      expect(listManagedDevicesMock).toHaveBeenCalledTimes(1);
    });
    unmount();

    expect(requestSignal).toBeDefined();
    expect(requestSignal?.aborted).toBe(true);
    pendingList.reject(new Error('aborted list request'));
    await Promise.resolve();
  });
});
