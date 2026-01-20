import { useState } from 'react';
import { useAuthenticator } from '@aws-amplify/ui-react';
import { confirmSignUp, resendSignUpCode, autoSignIn } from 'aws-amplify/auth';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    const name = error.name;
    switch (name) {
      case 'CodeMismatchException':
        return '確認コードが正しくありません。';
      case 'ExpiredCodeException':
        return '確認コードの有効期限が切れています。コードを再送信してください。';
      case 'LimitExceededException':
        return 'リクエスト回数の上限に達しました。しばらく待ってから再試行してください。';
      case 'UserNotFoundException':
        return 'ユーザーが見つかりません。';
      case 'NotAuthorizedException':
        return 'このアカウントは既に確認済みです。';
      default:
        return error.message || '予期しないエラーが発生しました。';
    }
  }
  return '予期しないエラーが発生しました。';
}

export default function ConfirmSignUpPage() {
  const { authStatus } = useAuthenticator(context => [context.authStatus]);
  const navigate = useNavigate();
  const location = useLocation();

  const emailFromState = (location.state as { email?: string })?.email || '';

  const [email, setEmail] = useState(emailFromState);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isResending, setIsResending] = useState(false);

  if (authStatus === 'authenticated') {
    return <Navigate to="/" replace />;
  }

  const handleConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMessage('');
    setIsLoading(true);

    try {
      const { nextStep } = await confirmSignUp({
        username: email,
        confirmationCode: code,
      });

      if (nextStep.signUpStep === 'DONE') {
        // Try auto sign-in if available
        try {
          await autoSignIn();
          navigate('/');
        } catch {
          // Auto sign-in not available, redirect to login
          navigate('/login', { state: { message: 'メールアドレスが確認されました。サインインしてください。' } });
        }
      } else if (nextStep.signUpStep === 'COMPLETE_AUTO_SIGN_IN') {
        await autoSignIn();
        navigate('/');
      }
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendCode = async () => {
    if (!email) {
      setError('メールアドレスを入力してください。');
      return;
    }

    setError('');
    setSuccessMessage('');
    setIsResending(true);

    try {
      await resendSignUpCode({
        username: email,
      });
      setSuccessMessage('確認コードを再送信しました。メールをご確認ください。');
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setIsResending(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-md p-4">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-brand-600">MailDeck</h1>
          <p className="text-gray-500 mt-2">メールアドレスの確認</p>
        </div>

        <div className="bg-white p-8 rounded-lg shadow">
          <div className="mb-6 text-center">
            <div className="w-16 h-16 mx-auto mb-4 bg-brand-100 rounded-full flex items-center justify-center">
              <svg className="w-8 h-8 text-brand-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
            <p className="text-sm text-gray-600">
              確認コードをメールで送信しました。<br />
              コードを入力してアカウントを有効化してください。
            </p>
          </div>

          <form onSubmit={handleConfirm} className="space-y-6">
            {!emailFromState && (
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
            )}

            {emailFromState && (
              <div className="text-center text-sm text-gray-600 bg-gray-50 py-2 px-4 rounded-lg">
                <span className="font-medium">{emailFromState}</span> に送信しました
              </div>
            )}

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

            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
                {error}
              </div>
            )}

            {successMessage && (
              <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-green-600 text-sm">
                {successMessage}
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading || !code}
              className="w-full px-4 py-3 bg-brand-600 text-white rounded-lg hover:bg-brand-700 font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? '確認中...' : 'アカウントを確認'}
            </button>
          </form>

          <div className="mt-6 text-center">
            <button
              type="button"
              onClick={handleResendCode}
              disabled={isResending}
              className="text-sm text-brand-600 hover:text-brand-700 disabled:opacity-50"
            >
              {isResending ? '送信中...' : 'コードを再送信'}
            </button>
          </div>

          <div className="mt-4 text-center text-sm text-gray-600">
            <Link to="/login" className="text-brand-600 hover:text-brand-700 font-medium">
              サインインに戻る
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
