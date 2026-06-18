'use client';

import { useReducer, useEffect, useCallback } from 'react';
import { useFormStatus } from 'react-dom';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { FaSpinner, FaArrowRight, FaArrowLeft } from 'react-icons/fa';
import { BG_COLOR, BORDER_COLOR, TEXT_COLOR } from '@/lib/styles';

type ViewType = 'login' | 'find-id' | 'find-password';

const REMEMBERED_USERNAME_STORAGE_KEY = 'yjlaser-login-remembered-username';
const AUTO_LOGIN_PREFERENCE_STORAGE_KEY = 'yjlaser-login-auto-login';

function LoginSubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className={`w-full py-4 bg-brand text-white font-semibold text-base rounded-xl
        hover:bg-brand-hover transition-colors duration-200
        ${pending ? 'opacity-70 cursor-not-allowed' : ''}`}
    >
      {pending ? (
        <span className="flex items-center justify-center gap-2">
          <FaSpinner className="animate-spin text-lg" />
          로그인 중...
        </span>
      ) : (
        '로그인'
      )}
    </button>
  );
}

// useReducer로 11개 useState 통합
interface FormState {
  isSubmitting: boolean;
  showPassword: boolean;
  currentView: ViewType;
  isLoading: boolean;
  isLoginPreferenceReady: boolean;
  result: { type: 'success' | 'error'; message: string } | null;
  username: string;
  rememberUsername: boolean;
  autoLogin: boolean;
  companyName: string;
  email: string;
  phone: string;
  findPwUsername: string;
  pwEmail: string;
}

type FormStringField =
  | 'username'
  | 'companyName'
  | 'email'
  | 'phone'
  | 'findPwUsername'
  | 'pwEmail';
type FormBooleanField = 'rememberUsername' | 'autoLogin';

type FormAction =
  | { type: 'SET_VIEW'; view: ViewType }
  | { type: 'RESET_FORM' }
  | { type: 'SET_FIELD'; field: FormStringField; value: string }
  | { type: 'SET_BOOLEAN'; field: FormBooleanField; value: boolean }
  | { type: 'SET_RESULT'; result: FormState['result'] }
  | { type: 'SET_LOADING'; isLoading: boolean }
  | { type: 'SET_SUBMITTING'; isSubmitting: boolean }
  | { type: 'SET_LOGIN_PREFERENCE_READY' }
  | { type: 'TOGGLE_PASSWORD' };

const initialState: FormState = {
  isSubmitting: false,
  showPassword: false,
  currentView: 'login',
  isLoading: false,
  isLoginPreferenceReady: false,
  result: null,
  username: '',
  rememberUsername: false,
  autoLogin: false,
  companyName: '',
  email: '',
  phone: '',
  findPwUsername: '',
  pwEmail: '',
};

function formReducer(state: FormState, action: FormAction): FormState {
  switch (action.type) {
    case 'SET_VIEW':
      return {
        ...state,
        currentView: action.view,
        result: null,
        companyName: '',
        email: '',
        phone: '',
        findPwUsername: '',
        pwEmail: '',
      };
    case 'RESET_FORM':
      return {
        ...state,
        result: null,
        companyName: '',
        email: '',
        phone: '',
        findPwUsername: '',
        pwEmail: '',
      };
    case 'SET_FIELD':
      return { ...state, [action.field]: action.value };
    case 'SET_BOOLEAN':
      return { ...state, [action.field]: action.value };
    case 'SET_RESULT':
      return { ...state, result: action.result };
    case 'SET_LOADING':
      return { ...state, isLoading: action.isLoading };
    case 'SET_SUBMITTING':
      return { ...state, isSubmitting: action.isSubmitting };
    case 'SET_LOGIN_PREFERENCE_READY':
      return { ...state, isLoginPreferenceReady: true };
    case 'TOGGLE_PASSWORD':
      return { ...state, showPassword: !state.showPassword };
    default:
      return state;
  }
}

interface LoginFormProps {
  loginAction: (formData: FormData) => Promise<void>;
  errorMessage?: string;
  nextPath?: string;
}

function getLoginContext(nextPath?: string): {
  eyebrow: string;
  title: string;
  description: string;
} {
  if (nextPath?.startsWith('/admin')) {
    return {
      eyebrow: 'Admin Access',
      title: '관리자 대시보드 접근',
      description: '관리자 업무 화면은 관리자 계정으로 로그인한 뒤 이용할 수 있습니다.',
    };
  }

  if (nextPath?.startsWith('/webhard')) {
    return {
      eyebrow: 'Webhard Access',
      title: '웹하드 접근',
      description: '파일 확인과 업로드를 위해 관리자 또는 승인된 업체 계정으로 로그인해주세요.',
    };
  }

  if (nextPath?.startsWith('/company')) {
    return {
      eyebrow: 'Company Access',
      title: '업체 대시보드 접근',
      description: '주문 현황과 웹하드 연결은 승인된 업체 계정으로 로그인 후 확인할 수 있습니다.',
    };
  }

  return {
    eyebrow: 'Enterprise Portal',
    title: '기업 전용 포털',
    description: '주문 현황, 정산 내역, 웹하드까지 모든 업무를 한 곳에서 관리하세요.',
  };
}

function readLoginPreferences() {
  if (typeof window === 'undefined') {
    return { rememberedUsername: '', autoLogin: false };
  }

  try {
    return {
      rememberedUsername: window.localStorage.getItem(REMEMBERED_USERNAME_STORAGE_KEY) ?? '',
      autoLogin: window.localStorage.getItem(AUTO_LOGIN_PREFERENCE_STORAGE_KEY) === 'true',
    };
  } catch {
    return { rememberedUsername: '', autoLogin: false };
  }
}

function writeLoginPreferences(username: string, rememberUsername: boolean, autoLogin: boolean) {
  if (typeof window === 'undefined') return;

  try {
    if (rememberUsername && username) {
      window.localStorage.setItem(REMEMBERED_USERNAME_STORAGE_KEY, username);
    } else {
      window.localStorage.removeItem(REMEMBERED_USERNAME_STORAGE_KEY);
    }

    if (autoLogin) {
      window.localStorage.setItem(AUTO_LOGIN_PREFERENCE_STORAGE_KEY, 'true');
    } else {
      window.localStorage.removeItem(AUTO_LOGIN_PREFERENCE_STORAGE_KEY);
    }
  } catch {
    // localStorage는 편의 기능일 뿐이며 로그인 인증 흐름에는 영향을 주지 않는다.
  }
}

export function LoginForm({ loginAction, errorMessage, nextPath }: LoginFormProps) {
  const searchParams = useSearchParams();
  const [state, dispatch] = useReducer(formReducer, initialState);
  const loginContext = getLoginContext(nextPath);

  const {
    isSubmitting,
    showPassword,
    currentView,
    isLoading,
    isLoginPreferenceReady,
    result,
    username,
    rememberUsername,
    autoLogin,
    companyName,
    email,
    phone,
    findPwUsername,
    pwEmail,
  } = state;

  const handleSubmit = async (formData: FormData) => {
    dispatch({ type: 'SET_SUBMITTING', isSubmitting: true });
    const submittedUsername = String(formData.get('username') ?? '').trim();
    writeLoginPreferences(submittedUsername, rememberUsername, autoLogin);

    try {
      await loginAction(formData);
    } finally {
      dispatch({ type: 'SET_SUBMITTING', isSubmitting: false });
    }
  };

  const handleFindId = async (e: React.FormEvent) => {
    e.preventDefault();
    dispatch({ type: 'SET_LOADING', isLoading: true });
    dispatch({ type: 'SET_RESULT', result: null });

    try {
      const response = await fetch('/api/auth/find-id', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyName, email, phone }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        dispatch({
          type: 'SET_RESULT',
          result: {
            type: 'success',
            message:
              data.message ||
              '입력하신 정보와 일치하는 계정이 있으면 등록 이메일로 아이디 안내를 보냈습니다.',
          },
        });
      } else {
        dispatch({
          type: 'SET_RESULT',
          result: {
            type: 'error',
            message: data.message || '아이디 안내 메일 요청에 실패했습니다.',
          },
        });
      }
    } catch {
      dispatch({
        type: 'SET_RESULT',
        result: { type: 'error', message: '서버 오류가 발생했습니다.' },
      });
    } finally {
      dispatch({ type: 'SET_LOADING', isLoading: false });
    }
  };

  const handleFindPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    dispatch({ type: 'SET_LOADING', isLoading: true });
    dispatch({ type: 'SET_RESULT', result: null });

    try {
      const response = await fetch('/api/auth/find-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: findPwUsername, email: pwEmail }),
      });

      const data = (await response.json()) as { success?: boolean; message?: string };

      if (response.ok && data.success) {
        dispatch({
          type: 'SET_RESULT',
          result: {
            type: 'success',
            message: data.message || '비밀번호 재설정 링크가 이메일로 전송되었습니다.',
          },
        });
      } else {
        dispatch({
          type: 'SET_RESULT',
          result: { type: 'error', message: data.message || '일치하는 계정을 찾을 수 없습니다.' },
        });
      }
    } catch {
      dispatch({
        type: 'SET_RESULT',
        result: { type: 'error', message: '서버 오류가 발생했습니다.' },
      });
    } finally {
      dispatch({ type: 'SET_LOADING', isLoading: false });
    }
  };

  const handleViewChange = useCallback(
    (view: ViewType) => {
      dispatch({ type: 'SET_VIEW', view });
      // Next.js 네비게이션 대신 history.replaceState로 URL만 업데이트
      const params = new URLSearchParams();
      if (view !== 'login') params.set('view', view);
      if (nextPath) params.set('next', nextPath);
      const query = params.toString();
      const url = query ? `/login?${query}` : '/login';
      window.history.replaceState(null, '', url);
    },
    [nextPath]
  );

  useEffect(() => {
    const preferences = readLoginPreferences();
    if (preferences.rememberedUsername) {
      dispatch({ type: 'SET_FIELD', field: 'username', value: preferences.rememberedUsername });
      dispatch({ type: 'SET_BOOLEAN', field: 'rememberUsername', value: true });
    }
    dispatch({ type: 'SET_BOOLEAN', field: 'autoLogin', value: preferences.autoLogin });
    dispatch({ type: 'SET_LOGIN_PREFERENCE_READY' });
  }, []);

  // URL 파라미터에서 view 읽기 (브라우저 뒤로가기 지원)
  useEffect(() => {
    const view = searchParams.get('view') as ViewType | null;
    if (view && ['find-id', 'find-password'].includes(view)) {
      dispatch({ type: 'SET_VIEW', view });
    } else {
      dispatch({ type: 'SET_VIEW', view: 'login' });
    }
  }, [searchParams]);

  return (
    <div
      className={`min-h-screen w-full ${BG_COLOR.loginPage} flex transition-colors duration-200`}
    >
      {/* 왼쪽: 브랜딩 영역 - 화면의 50% */}
      <div className="hidden lg:flex w-1/2 min-h-screen flex-col justify-center items-center relative">
        {/* 배경 그라디언트 */}
        <div className="absolute inset-0 bg-gradient-to-br from-brand/10 via-transparent to-transparent pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-brand/5 rounded-full blur-[120px] pointer-events-none" />

        <div className="relative z-10 w-full max-w-md px-12 xl:px-16">
          <p className="text-brand text-sm font-medium tracking-widest uppercase mb-6 animate-[fadeInUp_0.4s_ease-out_0.1s_both]">
            {loginContext.eyebrow}
          </p>
          <h1
            className={`text-4xl xl:text-5xl font-extrabold ${TEXT_COLOR.strong} leading-tight mb-6 animate-[fadeInUp_0.4s_ease-out_0.2s_both]`}
          >
            {loginContext.title.includes(' ') ? (
              <>
                {loginContext.title.split(' ').slice(0, -1).join(' ')}
                <br />
                <span className="text-brand">{loginContext.title.split(' ').at(-1)}</span>
              </>
            ) : (
              loginContext.title
            )}
          </h1>
          <p
            className={`${TEXT_COLOR.strong}/80 text-base xl:text-lg leading-relaxed animate-[fadeInUp_0.4s_ease-out_0.3s_both]`}
          >
            {loginContext.description}
          </p>

          <div className="mt-12 animate-[fadeIn_0.4s_ease-out_0.5s_both]">
            <Link
              href="/"
              className={`group inline-flex items-center gap-1.5 ${TEXT_COLOR.strong}/80 hover:text-brand transition-colors text-base`}
            >
              <div className="flex items-center justify-center gap-1.5">
                <FaArrowLeft className="text-xs group-hover:-translate-x-1 transition-transform duration-200" />
                <span className="leading-none">홈으로 돌아가기</span>
              </div>
            </Link>
          </div>
        </div>

        {/* 세로 구분선 - 오른쪽 끝에 배치 */}
        <div className="absolute right-0 top-1/2 -translate-y-1/2 h-[60%] w-px bg-gradient-to-b from-transparent via-border to-transparent" />
      </div>

      {/* 오른쪽: 폼 영역 - 화면의 50% */}
      <div className="w-full lg:w-1/2 min-h-screen flex items-center justify-center px-6 py-12 sm:px-12 lg:px-16 xl:px-20">
        <div className="w-full max-w-md">
          {/* 모바일 홈 링크 */}
          <div className="lg:hidden mb-8">
            <Link
              href="/"
              className={`group inline-flex items-center gap-1.5 ${TEXT_COLOR.strong}/80 hover:text-brand transition-colors`}
            >
              <div className="flex items-center justify-center gap-1.5">
                <FaArrowLeft className="text-xs group-hover:-translate-x-1 transition-transform duration-200" />
                <span className="leading-none">홈으로 돌아가기</span>
              </div>
            </Link>
          </div>

          {/* 모바일 타이틀 */}
          <div className="lg:hidden mb-10">
            <p className="text-brand text-sm font-medium tracking-widest uppercase mb-3">
              {loginContext.eyebrow}
            </p>
            <h1 className={`text-3xl font-extrabold ${TEXT_COLOR.strong}`}>{loginContext.title}</h1>
            <p className={`${TEXT_COLOR.subtle} mt-4 text-base leading-relaxed`}>
              {loginContext.description}
            </p>
          </div>

          {/* CSS 트랜지션 기반 뷰 전환 (framer-motion 대체) */}
          <div className="relative">
            {currentView === 'login' && (
              <div key="login" className="animate-[fadeInSlide_0.2s_ease-out_both]">
                <div className="mb-8">
                  <h2 className={`text-2xl xl:text-3xl font-bold ${TEXT_COLOR.strong} mb-2`}>
                    로그인
                  </h2>
                  <p className={`${TEXT_COLOR.dimAlphaLight} text-base`}>
                    {nextPath
                      ? '요청한 화면으로 이동하려면 계정 정보를 입력해주세요'
                      : '계정 정보를 입력해주세요'}
                  </p>
                </div>

                {errorMessage && (
                  <div
                    className={`mb-6 p-4 ${BG_COLOR.errorAlpha} border ${BORDER_COLOR.errorAlpha} rounded-lg`}
                  >
                    <p className={TEXT_COLOR.error}>{errorMessage}</p>
                  </div>
                )}

                <form
                  action={handleSubmit}
                  className="space-y-5"
                  data-login-preferences-ready={isLoginPreferenceReady ? 'true' : 'false'}
                >
                  {nextPath ? <input type="hidden" name="next" value={nextPath} /> : null}
                  <div>
                    <label
                      htmlFor="login-username"
                      className={`block ${TEXT_COLOR.alphaLight} text-base mb-2`}
                    >
                      아이디
                    </label>
                    <input
                      type="text"
                      id="login-username"
                      name="username"
                      required
                      aria-required="true"
                      autoComplete="username"
                      value={username}
                      onChange={(e) =>
                        dispatch({ type: 'SET_FIELD', field: 'username', value: e.target.value })
                      }
                      disabled={isSubmitting}
                      className={`w-full px-5 py-4 ${BG_COLOR.whiteAlpha} border ${BORDER_COLOR.whiteAlpha} rounded-xl ${TEXT_COLOR.strong} placeholder:text-muted-foreground/50 text-base focus:outline-none focus:border-brand/50 focus:ring-2 focus:ring-brand/20 transition-all duration-200 disabled:opacity-50`}
                      placeholder="아이디를 입력하세요"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="login-password"
                      className={`block ${TEXT_COLOR.alphaLight} text-base mb-2`}
                    >
                      비밀번호
                    </label>
                    <div className="relative">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        id="login-password"
                        name="password"
                        required
                        aria-required="true"
                        autoComplete="current-password"
                        disabled={isSubmitting}
                        className={`w-full px-5 py-4 ${BG_COLOR.whiteAlpha} border ${BORDER_COLOR.whiteAlpha} rounded-xl ${TEXT_COLOR.strong} placeholder:text-muted-foreground/50 text-base focus:outline-none focus:border-brand/50 focus:ring-2 focus:ring-brand/20 transition-all duration-200 disabled:opacity-50`}
                        placeholder="비밀번호를 입력하세요"
                      />
                      <button
                        type="button"
                        onClick={() => dispatch({ type: 'TOGGLE_PASSWORD' })}
                        className={`absolute right-4 top-1/2 -translate-y-1/2 ${TEXT_COLOR.dimAlpha} ${TEXT_COLOR.hoverSoftWhite} transition-colors text-sm`}
                        aria-label={showPassword ? '비밀번호 숨기기' : '비밀번호 표시'}
                        aria-pressed={showPassword}
                      >
                        {showPassword ? '숨김' : '표시'}
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-4 pt-1">
                    <label
                      htmlFor="login-remember-username"
                      className={`inline-flex items-center gap-2 text-sm ${TEXT_COLOR.alphaLight} cursor-pointer select-none`}
                    >
                      <input
                        type="checkbox"
                        id="login-remember-username"
                        name="rememberUsername"
                        checked={rememberUsername}
                        onChange={(e) =>
                          dispatch({
                            type: 'SET_BOOLEAN',
                            field: 'rememberUsername',
                            value: e.target.checked,
                          })
                        }
                        disabled={isSubmitting}
                        className="h-4 w-4 rounded border-border text-brand focus:ring-brand/30 disabled:opacity-50"
                      />
                      <span>아이디 저장</span>
                    </label>

                    <label
                      htmlFor="login-auto-login"
                      className={`inline-flex items-center gap-2 text-sm ${TEXT_COLOR.alphaLight} cursor-pointer select-none`}
                    >
                      <input
                        type="checkbox"
                        id="login-auto-login"
                        name="autoLogin"
                        checked={autoLogin}
                        onChange={(e) =>
                          dispatch({
                            type: 'SET_BOOLEAN',
                            field: 'autoLogin',
                            value: e.target.checked,
                          })
                        }
                        disabled={isSubmitting}
                        className="h-4 w-4 rounded border-border text-brand focus:ring-brand/30 disabled:opacity-50"
                      />
                      <span>자동로그인</span>
                    </label>
                  </div>

                  <div className="pt-2">
                    <LoginSubmitButton />
                  </div>
                </form>

                <div className="mt-6 flex items-center justify-center gap-5 text-base">
                  <button
                    onClick={() => handleViewChange('find-id')}
                    className={`${TEXT_COLOR.dimAlpha} ${TEXT_COLOR.hoverSoftWhite} transition-colors`}
                  >
                    아이디 찾기
                  </button>
                  <span className={TEXT_COLOR.separator}>|</span>
                  <button
                    onClick={() => handleViewChange('find-password')}
                    className={`${TEXT_COLOR.dimAlpha} ${TEXT_COLOR.hoverSoftWhite} transition-colors`}
                  >
                    비밀번호 찾기
                  </button>
                </div>

                <div className={`mt-10 pt-6 border-t ${BORDER_COLOR.whiteAlpha}`}>
                  <p className={`${TEXT_COLOR.dimAlpha} text-base text-center mb-4`}>
                    아직 계정이 없으신가요?
                  </p>
                  <Link
                    href="/register"
                    className={`group inline-flex items-center justify-center gap-1.5 w-full py-4 text-center rounded-xl
                      ${TEXT_COLOR.softWhite} text-base hover:text-brand transition-all duration-200`}
                  >
                    <span className="group-hover:underline leading-none">업체 등록 신청</span>
                    <FaArrowRight className="text-xs relative -top-px group-hover:translate-x-1 transition-transform duration-200" />
                  </Link>
                </div>
              </div>
            )}

            {currentView === 'find-id' && (
              <div key="find-id" className="animate-[fadeInSlide_0.2s_ease-out_both]">
                <button
                  onClick={() => handleViewChange('login')}
                  className={`group inline-flex items-center gap-1.5 ${TEXT_COLOR.strong}/80 hover:text-brand transition-colors text-base mb-8`}
                >
                  <FaArrowLeft className="text-xs relative -top-px group-hover:-translate-x-1 transition-transform duration-200" />
                  <span className="leading-none">돌아가기</span>
                </button>

                <div className="mb-8">
                  <h2 className={`text-2xl xl:text-3xl font-bold ${TEXT_COLOR.strong} mb-2`}>
                    아이디 찾기
                  </h2>
                  <p className={`${TEXT_COLOR.dimAlphaLight} text-base`}>
                    가입 시 등록한 정보를 입력해주세요
                  </p>
                </div>

                {result && (
                  <div
                    className={`mb-6 p-4 rounded-xl border ${
                      result.type === 'success'
                        ? `${BG_COLOR.successAlpha} ${BORDER_COLOR.successAlpha}`
                        : `${BG_COLOR.errorAlpha} ${BORDER_COLOR.errorAlpha}`
                    }`}
                    role="status"
                    aria-live="polite"
                  >
                    <p
                      className={`text-base ${result.type === 'success' ? TEXT_COLOR.success : TEXT_COLOR.error}`}
                    >
                      {result.message}
                    </p>
                  </div>
                )}

                <form onSubmit={handleFindId} className="space-y-5">
                  <div>
                    <label
                      htmlFor="find-id-company"
                      className={`block ${TEXT_COLOR.alphaLight} text-base mb-2`}
                    >
                      업체명
                    </label>
                    <input
                      type="text"
                      id="find-id-company"
                      value={companyName}
                      onChange={(e) =>
                        dispatch({ type: 'SET_FIELD', field: 'companyName', value: e.target.value })
                      }
                      required
                      disabled={isLoading}
                      className={`w-full px-5 py-4 ${BG_COLOR.whiteAlpha} border ${BORDER_COLOR.whiteAlpha} rounded-xl ${TEXT_COLOR.strong} placeholder:text-muted-foreground/50 text-base focus:outline-none focus:border-brand/50 focus:ring-2 focus:ring-brand/20 transition-all duration-200 disabled:opacity-50`}
                      placeholder="업체명"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="find-id-email"
                      className={`block ${TEXT_COLOR.alphaLight} text-base mb-2`}
                    >
                      이메일
                    </label>
                    <input
                      type="email"
                      id="find-id-email"
                      value={email}
                      onChange={(e) =>
                        dispatch({ type: 'SET_FIELD', field: 'email', value: e.target.value })
                      }
                      required
                      disabled={isLoading}
                      className={`w-full px-5 py-4 ${BG_COLOR.whiteAlpha} border ${BORDER_COLOR.whiteAlpha} rounded-xl ${TEXT_COLOR.strong} placeholder:text-muted-foreground/50 text-base focus:outline-none focus:border-brand/50 focus:ring-2 focus:ring-brand/20 transition-all duration-200 disabled:opacity-50`}
                      placeholder="이메일"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="find-id-phone"
                      className={`block ${TEXT_COLOR.alphaLight} text-base mb-2`}
                    >
                      연락처
                    </label>
                    <input
                      type="tel"
                      id="find-id-phone"
                      value={phone}
                      onChange={(e) =>
                        dispatch({ type: 'SET_FIELD', field: 'phone', value: e.target.value })
                      }
                      required
                      disabled={isLoading}
                      className={`w-full px-5 py-4 ${BG_COLOR.whiteAlpha} border ${BORDER_COLOR.whiteAlpha} rounded-xl ${TEXT_COLOR.strong} placeholder:text-muted-foreground/50 text-base focus:outline-none focus:border-brand/50 focus:ring-2 focus:ring-brand/20 transition-all duration-200 disabled:opacity-50`}
                      placeholder="010-1234-5678"
                    />
                  </div>

                  <div className="pt-2">
                    <button
                      type="submit"
                      disabled={isLoading}
                      className="w-full py-4 bg-brand text-white font-semibold text-base rounded-xl hover:bg-brand-hover transition-colors duration-200 disabled:opacity-70"
                    >
                      {isLoading ? (
                        <span className="flex items-center justify-center gap-2">
                          <FaSpinner className="animate-spin text-lg" />
                          찾는 중...
                        </span>
                      ) : (
                        '아이디 찾기'
                      )}
                    </button>
                  </div>
                </form>

                {result?.type === 'success' && (
                  <button
                    onClick={() => handleViewChange('login')}
                    className={`w-full mt-4 py-4 border ${BORDER_COLOR.whiteAlphaLight} rounded-xl ${TEXT_COLOR.softWhite} text-base ${BG_COLOR.hoverWhiteAlpha} ${TEXT_COLOR.hoverStrongest} transition-all duration-200`}
                  >
                    로그인하러 가기
                  </button>
                )}
              </div>
            )}

            {currentView === 'find-password' && (
              <div key="find-password" className="animate-[fadeInSlide_0.2s_ease-out_both]">
                <button
                  onClick={() => handleViewChange('login')}
                  className={`group inline-flex items-center gap-1.5 ${TEXT_COLOR.strong}/80 hover:text-brand transition-colors text-base mb-8`}
                >
                  <FaArrowLeft className="text-xs relative -top-px group-hover:-translate-x-1 transition-transform duration-200" />
                  <span className="leading-none">돌아가기</span>
                </button>

                <div className="mb-8">
                  <h2 className={`text-2xl xl:text-3xl font-bold ${TEXT_COLOR.strong} mb-2`}>
                    비밀번호 찾기
                  </h2>
                  <p className={`${TEXT_COLOR.dimAlphaLight} text-base`}>
                    비밀번호 재설정 링크를 이메일로 보내드립니다
                  </p>
                </div>

                {result && (
                  <div
                    className={`mb-6 p-4 rounded-xl border ${
                      result.type === 'success'
                        ? `${BG_COLOR.successAlpha} ${BORDER_COLOR.successAlpha}`
                        : `${BG_COLOR.errorAlpha} ${BORDER_COLOR.errorAlpha}`
                    }`}
                  >
                    <p
                      className={`text-base ${result.type === 'success' ? TEXT_COLOR.success : TEXT_COLOR.error}`}
                    >
                      {result.message}
                    </p>
                  </div>
                )}

                <form onSubmit={handleFindPassword} className="space-y-5">
                  <div>
                    <label
                      htmlFor="find-pw-username"
                      className={`block ${TEXT_COLOR.alphaLight} text-base mb-2`}
                    >
                      아이디
                    </label>
                    <input
                      type="text"
                      id="find-pw-username"
                      value={findPwUsername}
                      onChange={(e) =>
                        dispatch({
                          type: 'SET_FIELD',
                          field: 'findPwUsername',
                          value: e.target.value,
                        })
                      }
                      required
                      disabled={isLoading}
                      className={`w-full px-5 py-4 ${BG_COLOR.whiteAlpha} border ${BORDER_COLOR.whiteAlpha} rounded-xl ${TEXT_COLOR.strong} placeholder:text-muted-foreground/50 text-base focus:outline-none focus:border-brand/50 focus:ring-2 focus:ring-brand/20 transition-all duration-200 disabled:opacity-50`}
                      placeholder="아이디"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="find-pw-email"
                      className={`block ${TEXT_COLOR.alphaLight} text-base mb-2`}
                    >
                      가입 시 등록한 이메일
                    </label>
                    <input
                      type="email"
                      id="find-pw-email"
                      value={pwEmail}
                      onChange={(e) =>
                        dispatch({ type: 'SET_FIELD', field: 'pwEmail', value: e.target.value })
                      }
                      required
                      disabled={isLoading}
                      className={`w-full px-5 py-4 ${BG_COLOR.whiteAlpha} border ${BORDER_COLOR.whiteAlpha} rounded-xl ${TEXT_COLOR.strong} placeholder:text-muted-foreground/50 text-base focus:outline-none focus:border-brand/50 focus:ring-2 focus:ring-brand/20 transition-all duration-200 disabled:opacity-50`}
                      placeholder="이메일"
                    />
                  </div>

                  <div className="pt-2">
                    <button
                      type="submit"
                      disabled={isLoading}
                      className="w-full py-4 bg-brand text-white font-semibold text-base rounded-xl hover:bg-brand-hover transition-colors duration-200 disabled:opacity-70"
                    >
                      {isLoading ? (
                        <span className="flex items-center justify-center gap-2">
                          <FaSpinner className="animate-spin text-lg" />
                          전송 중...
                        </span>
                      ) : (
                        '재설정 링크 받기'
                      )}
                    </button>
                  </div>
                </form>

                {result?.type === 'success' && (
                  <button
                    onClick={() => handleViewChange('login')}
                    className={`w-full mt-4 py-4 border ${BORDER_COLOR.whiteAlphaLight} rounded-xl ${TEXT_COLOR.softWhite} text-base ${BG_COLOR.hoverWhiteAlpha} ${TEXT_COLOR.hoverStrongest} transition-all duration-200`}
                  >
                    로그인하러 가기
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
