'use client';

import { type FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { BG_COLOR, BORDER_COLOR, TEXT_COLOR } from '@/lib/styles';

interface ResetPasswordFormProps {
  token: string;
}

interface ResetPasswordResult {
  type: 'success' | 'error';
  message: string;
}

interface ResetPasswordResponse {
  success?: boolean;
  message?: string;
}

const PASSWORD_POLICY_MESSAGE =
  '8자 이상이며 대문자, 소문자, 숫자, 특수문자 중 3가지 이상을 포함해야 합니다.';

function meetsPasswordPolicy(password: string): boolean {
  if (password.length < 8) return false;
  const classes = [
    /[a-z]/.test(password),
    /[A-Z]/.test(password),
    /\d/.test(password),
    /[^A-Za-z0-9]/.test(password),
  ].filter(Boolean).length;
  return classes >= 3;
}

export function ResetPasswordForm({ token }: ResetPasswordFormProps) {
  const [resetToken, setResetToken] = useState(() => token.trim());
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<ResetPasswordResult | null>(null);

  useEffect(() => {
    if (resetToken) {
      window.history.replaceState(null, '', '/reset-password');
      return;
    }

    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const hashToken = hashParams.get('token')?.trim() || '';
    if (hashToken) {
      setResetToken(hashToken);
      window.history.replaceState(null, '', '/reset-password');
    }
  }, [resetToken]);

  if (!resetToken) {
    return (
      <Card className="w-full max-w-md" padding="lg">
        <CardHeader>
          <h1 className={`text-2xl font-bold ${TEXT_COLOR.primary}`}>비밀번호 재설정</h1>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className={`rounded-lg border ${BORDER_COLOR.error} ${BG_COLOR.error} p-4`}>
            <p className={TEXT_COLOR.error}>재설정 링크가 올바르지 않습니다.</p>
          </div>
          <Button asChild className="w-full" size="lg">
            <Link href="/login">로그인으로 돌아가기</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setResult(null);

    if (password !== passwordConfirm) {
      setResult({ type: 'error', message: '비밀번호가 일치하지 않습니다.' });
      return;
    }

    if (!meetsPasswordPolicy(password)) {
      setResult({ type: 'error', message: PASSWORD_POLICY_MESSAGE });
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: resetToken, password, passwordConfirm }),
      });
      const data = (await response.json()) as ResetPasswordResponse;

      if (response.ok && data.success) {
        setResult({
          type: 'success',
          message: data.message || '비밀번호가 재설정되었습니다.',
        });
        setPassword('');
        setPasswordConfirm('');
      } else {
        setResult({
          type: 'error',
          message: data.message || '비밀번호 재설정에 실패했습니다.',
        });
      }
    } catch {
      setResult({ type: 'error', message: '서버 오류가 발생했습니다.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card className="w-full max-w-md" padding="lg">
      <CardHeader>
        <h1 className={`text-2xl font-bold ${TEXT_COLOR.primary}`}>비밀번호 재설정</h1>
        <p className={`text-sm ${TEXT_COLOR.secondary}`}>
          새 비밀번호를 설정하면 기존 비밀번호는 즉시 사용할 수 없습니다.
        </p>
      </CardHeader>
      <CardContent>
        {result && (
          <div
            className={`mb-5 rounded-lg border p-4 ${
              result.type === 'success'
                ? `${BORDER_COLOR.success} ${BG_COLOR.success}`
                : `${BORDER_COLOR.error} ${BG_COLOR.error}`
            }`}
            role="status"
            aria-live="polite"
          >
            <p className={result.type === 'success' ? TEXT_COLOR.success : TEXT_COLOR.error}>
              {result.message}
            </p>
          </div>
        )}

        {result?.type === 'success' ? (
          <Button asChild className="w-full" size="lg">
            <Link href="/login">로그인하러 가기</Link>
          </Button>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="new-password" className={`mb-2 block text-sm ${TEXT_COLOR.primary}`}>
                새 비밀번호
              </label>
              <Input
                id="new-password"
                type="password"
                autoComplete="new-password"
                inputSize="lg"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                disabled={isSubmitting}
                required
              />
              <p className={`mt-2 text-xs ${TEXT_COLOR.secondary}`}>{PASSWORD_POLICY_MESSAGE}</p>
            </div>

            <div>
              <label
                htmlFor="new-password-confirm"
                className={`mb-2 block text-sm ${TEXT_COLOR.primary}`}
              >
                새 비밀번호 확인
              </label>
              <Input
                id="new-password-confirm"
                type="password"
                autoComplete="new-password"
                inputSize="lg"
                value={passwordConfirm}
                onChange={(event) => setPasswordConfirm(event.target.value)}
                disabled={isSubmitting}
                required
              />
            </div>

            <Button type="submit" className="w-full" size="lg" disabled={isSubmitting}>
              {isSubmitting ? '재설정 중...' : '비밀번호 재설정'}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
