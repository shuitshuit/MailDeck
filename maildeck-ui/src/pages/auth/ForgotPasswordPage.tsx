import { useState } from 'react';
import { useAuthenticator } from '@aws-amplify/ui-react';
import { resetPassword, confirmResetPassword } from 'aws-amplify/auth';
import { Link, Navigate, useNavigate } from 'react-router-dom';

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    const name = error.name;
    switch (name) {
      case 'UserNotFoundException':
        return 'このメールアドレスは登録されていません。';
      case 'CodeMismatchException':
        return '確認コードが正しくありません。';
      case 'ExpiredCodeException':
        return '確認コードの有効期限が切れています。コードを再送信してください。';
      case 'InvalidPasswordException':
        return 'パスワードは8文字以上で、大文字・小文字・数字を含める必要があります。';
      case 'LimitExceededException':
        return 'リクエスト回数の上限に達しました。しばらく待ってから再試行してください。';
      case 'InvalidParameterException':
        return '入力内容に問題があります。';
      default:
        return error.message || '予期しないエラーが発生しました。';
    }
  }
  return '予期しないエラーが発生しました。';
}

type Step = 'request' | 'confirm';

export default function ForgotPasswordPage() {
  const { authStatus } = useAuthenticator(context => [context.authStatus]);
  const navigate = useNavigate();

  const [step, setStep] = useState<Step>('request');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  if (authStatus === 'authenticated') {
    return <Navigate to="/" replace />;
  }

  const handleRequestReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const output = await resetPassword({ username: email });

      if (output.nextStep.resetPasswordStep === 'CONFIRM_RESET_PASSWORD_WITH_CODE') {
        setStep('confirm');
      } else if (output.nextStep.resetPasswordStep === 'DONE') {
        navigate('/login', { state: { message: 'パスワードがリセットされました。新しいパスワードでサインインしてください。' } });
      }
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfirmReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (newPassword !== confirmPassword) {
      setError('パスワードが一致しません。');
      return;
    }

    if (newPassword.length < 8) {
      setError('パスワードは8文字以上である必要があります。');
      return;
    }

    setIsLoading(true);

    try {
      await confirmResetPassword({
        username: email,
        confirmationCode: code,
        newPassword,
      });

      navigate('/login', { state: { message: 'パスワードがリセットされました。新しいパスワードでサインインしてください。' } });
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendCode = async () => {
    setError('');
    setIsLoading(true);

    try {
      await resetPassword({ username: email });
      setError(''); // Clear any previous error
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  };

  // Request reset code step
  if (step === 'request') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-full max-w-md p-4">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-brand-600">MailDeck</h1>
            <p className="text-gray-500 mt-2">パスワードをリセット</p>
          </div>

          <div className="bg-white p-8 rounded-lg shadow">
            <div className="mb-6 text-center">
              <div className="w-16 h-16 mx-auto mb-4 bg-brand-100 rounded-full flex items-center justify-center">
                <svg className="w-8 h-8 text-brand-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                </svg>
              </div>
              <p className="text-sm text-gray-600">
                パスワードリセット用の確認コードをメールで送信します。
              </p>
            </div>

            <form onSubmit={handleRequestReset} className="space-y-6">
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                  メールアドレス
                </label>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                  placeholder="you@example.com"
                  required
                />
              </div>

              {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={isLoading || !email}
                className="w-full px-4 py-3 bg-brand-600 text-white rounded-lg hover:bg-brand-700 font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? '送信中...' : '確認コードを送信'}
              </button>
            </form>

            <div className="mt-6 text-center text-sm text-gray-600">
              <Link to="/login" className="text-brand-600 hover:text-brand-700 font-medium">
                サインインに戻る
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Confirm reset step
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-md p-4">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-brand-600">MailDeck</h1>
          <p className="text-gray-500 mt-2">新しいパスワードを設定</p>
        </div>

        <div className="bg-white p-8 rounded-lg shadow">
          <div className="mb-6 text-center text-sm text-gray-600 bg-gray-50 py-2 px-4 rounded-lg">
            <span className="font-medium">{email}</span> に確認コードを送信しました
          </div>

          <form onSubmit={handleConfirmReset} className="space-y-6">
            <div>
              <label htmlFor="code" className="block text-sm font-medium text-gray-700 mb-1">
                確認コード
              </label>
              <input
                id="code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500 text-center text-2xl tracking-widest"
                placeholder="123456"
                maxLength={6}
                required
              />
            </div>

            <div>
              <label htmlFor="newPassword" className="block text-sm font-medium text-gray-700 mb-1">
                新しいパスワード
              </label>
              <input
                id="newPassword"
                type="password"
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                placeholder="新しいパスワード"
                required
              />
              <p className="mt-1 text-xs text-gray-500">8文字以上、大文字・小文字・数字を含めてください</p>
            </div>

            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-1">
                新しいパスワード（確認）
              </label>
              <input
                id="confirmPassword"
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                placeholder="パスワードを再入力"
                required
              />
            </div>

            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading || !code || !newPassword || !confirmPassword}
              className="w-full px-4 py-3 bg-brand-600 text-white rounded-lg hover:bg-brand-700 font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? 'リセット中...' : 'パスワードをリセット'}
            </button>
          </form>

          <div className="mt-6 text-center">
            <button
              type="button"
              onClick={handleResendCode}
              disabled={isLoading}
              className="text-sm text-brand-600 hover:text-brand-700 disabled:opacity-50"
            >
              コードを再送信
            </button>
          </div>

          <div className="mt-4 text-center text-sm text-gray-600">
            <button
              type="button"
              onClick={() => setStep('request')}
              className="text-brand-600 hover:text-brand-700 font-medium"
            >
              メールアドレスを変更
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
