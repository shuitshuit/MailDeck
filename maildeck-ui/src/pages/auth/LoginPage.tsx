import { useState } from 'react';
import { useAuthenticator } from '@aws-amplify/ui-react';
import { signIn, confirmSignIn } from 'aws-amplify/auth';
import type { SignInOutput } from 'aws-amplify/auth';
import { Link, Navigate, useNavigate } from 'react-router-dom';

type SignInStep =
  | 'CONTINUE_SIGN_IN_WITH_MFA_SELECTION'
  | 'CONFIRM_SIGN_IN_WITH_SMS_CODE'
  | 'CONFIRM_SIGN_IN_WITH_TOTP_CODE'
  | 'CONFIRM_SIGN_IN_WITH_EMAIL_CODE'
  | 'CONTINUE_SIGN_IN_WITH_TOTP_SETUP'
  | 'CONTINUE_SIGN_IN_WITH_EMAIL_SETUP'
  | 'CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED'
  | 'DONE';

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    const name = error.name;
    switch (name) {
      case 'UserNotFoundException':
        return 'ユーザーが見つかりません。';
      case 'NotAuthorizedException':
        return 'メールアドレスまたはパスワードが正しくありません。';
      case 'UserNotConfirmedException':
        return 'メールアドレスの確認が必要です。確認コードをご確認ください。';
      case 'PasswordResetRequiredException':
        return 'パスワードのリセットが必要です。';
      case 'InvalidParameterException':
        return '入力内容に問題があります。';
      case 'CodeMismatchException':
        return '確認コードが正しくありません。';
      case 'ExpiredCodeException':
        return '確認コードの有効期限が切れています。';
      case 'LimitExceededException':
        return 'リクエスト回数の上限に達しました。しばらく待ってから再試行してください。';
      default:
        return error.message || '予期しないエラーが発生しました。';
    }
  }
  return '予期しないエラーが発生しました。';
}

export default function LoginPage() {
  const { authStatus } = useAuthenticator(context => [context.authStatus]);
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mfaCode, setMfaCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [currentStep, setCurrentStep] = useState<SignInStep | null>(null);
  const [mfaType, setMfaType] = useState<'SMS' | 'TOTP' | 'EMAIL' | null>(null);

  const isWebAuthnSupported = typeof window !== 'undefined' && window.PublicKeyCredential !== undefined;

  if (authStatus === 'authenticated') {
    return <Navigate to="/" replace />;
  }

  const handleNextStep = async (output: SignInOutput) => {
    const { nextStep } = output;

    switch (nextStep.signInStep) {
      case 'DONE':
        navigate('/');
        break;
      case 'CONFIRM_SIGN_IN_WITH_SMS_CODE':
        setCurrentStep('CONFIRM_SIGN_IN_WITH_SMS_CODE');
        setMfaType('SMS');
        break;
      case 'CONFIRM_SIGN_IN_WITH_TOTP_CODE':
        setCurrentStep('CONFIRM_SIGN_IN_WITH_TOTP_CODE');
        setMfaType('TOTP');
        break;
      case 'CONFIRM_SIGN_IN_WITH_EMAIL_CODE':
        setCurrentStep('CONFIRM_SIGN_IN_WITH_EMAIL_CODE');
        setMfaType('EMAIL');
        break;
      case 'CONTINUE_SIGN_IN_WITH_MFA_SELECTION':
        setCurrentStep('CONTINUE_SIGN_IN_WITH_MFA_SELECTION');
        break;
      case 'CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED':
        setCurrentStep('CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED');
        break;
      default:
        setError('サポートされていない認証ステップです。');
    }
  };

  const handlePasswordSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const output = await signIn({
        username: email,
        password,
      });
      await handleNextStep(output);
    } catch (err) {
      setError(getErrorMessage(err));
      // ユーザーが未確認の場合、確認ページに遷移
      if (err instanceof Error && err.name === 'UserNotConfirmedException') {
        navigate('/confirm-signup', { state: { email } });
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handlePasskeySignIn = async () => {
    if (!email) {
      setError('パスキーでログインするにはメールアドレスを入力してください。');
      return;
    }

    setError('');
    setIsLoading(true);

    try {
      const output = await signIn({
        username: email,
        options: {
          authFlowType: 'USER_AUTH',
          preferredChallenge: 'WEB_AUTHN',
        },
      });
      await handleNextStep(output);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  };

  const handleMfaSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const output = await confirmSignIn({
        challengeResponse: mfaCode,
      });
      await handleNextStep(output);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  };

  const handleNewPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const output = await confirmSignIn({
        challengeResponse: newPassword,
      });
      await handleNextStep(output);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  };

  const handleMfaSelection = async (type: 'SMS' | 'TOTP' | 'EMAIL') => {
    setError('');
    setIsLoading(true);

    try {
      const output = await confirmSignIn({
        challengeResponse: type === 'SMS' ? 'SMS_MFA' : type === 'EMAIL' ? 'EMAIL_OTP' : 'TOTP',
      });
      await handleNextStep(output);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  };

  // MFA コード入力画面
  if (currentStep === 'CONFIRM_SIGN_IN_WITH_SMS_CODE' ||
      currentStep === 'CONFIRM_SIGN_IN_WITH_TOTP_CODE' ||
      currentStep === 'CONFIRM_SIGN_IN_WITH_EMAIL_CODE') {
    const mfaLabels = {
      SMS: 'SMSに送信された確認コード',
      TOTP: '認証アプリの確認コード',
      EMAIL: 'メールに送信された確認コード',
    };

    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-full max-w-md p-4">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-brand-600">MailDeck</h1>
            <p className="text-gray-500 mt-2">二要素認証</p>
          </div>

          <div className="bg-white p-8 rounded-lg shadow">
            <form onSubmit={handleMfaSubmit} className="space-y-6">
              <div>
                <label htmlFor="mfaCode" className="block text-sm font-medium text-gray-700 mb-1">
                  {mfaType && mfaLabels[mfaType]}
                </label>
                <input
                  id="mfaCode"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={mfaCode}
                  onChange={(e) => setMfaCode(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                  placeholder="123456"
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
                disabled={isLoading}
                className="w-full px-4 py-3 bg-brand-600 text-white rounded-lg hover:bg-brand-700 font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? '確認中...' : '確認'}
              </button>

              <button
                type="button"
                onClick={() => {
                  setCurrentStep(null);
                  setMfaCode('');
                  setMfaType(null);
                }}
                className="w-full text-sm text-gray-600 hover:text-gray-900"
              >
                ログインに戻る
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  // MFA 選択画面
  if (currentStep === 'CONTINUE_SIGN_IN_WITH_MFA_SELECTION') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-full max-w-md p-4">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-brand-600">MailDeck</h1>
            <p className="text-gray-500 mt-2">認証方法を選択</p>
          </div>

          <div className="bg-white p-8 rounded-lg shadow space-y-4">
            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
                {error}
              </div>
            )}

            <button
              onClick={() => handleMfaSelection('SMS')}
              disabled={isLoading}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg hover:bg-gray-50 font-medium transition-colors disabled:opacity-50 flex items-center gap-3"
            >
              <svg className="w-5 h-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
              </svg>
              SMSで確認コードを受け取る
            </button>

            <button
              onClick={() => handleMfaSelection('TOTP')}
              disabled={isLoading}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg hover:bg-gray-50 font-medium transition-colors disabled:opacity-50 flex items-center gap-3"
            >
              <svg className="w-5 h-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              認証アプリを使用
            </button>

            <button
              onClick={() => handleMfaSelection('EMAIL')}
              disabled={isLoading}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg hover:bg-gray-50 font-medium transition-colors disabled:opacity-50 flex items-center gap-3"
            >
              <svg className="w-5 h-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              メールで確認コードを受け取る
            </button>

            <button
              type="button"
              onClick={() => setCurrentStep(null)}
              className="w-full text-sm text-gray-600 hover:text-gray-900 mt-4"
            >
              ログインに戻る
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 新しいパスワード設定画面
  if (currentStep === 'CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-full max-w-md p-4">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-brand-600">MailDeck</h1>
            <p className="text-gray-500 mt-2">新しいパスワードを設定</p>
          </div>

          <div className="bg-white p-8 rounded-lg shadow">
            <form onSubmit={handleNewPasswordSubmit} className="space-y-6">
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

              {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={isLoading}
                className="w-full px-4 py-3 bg-brand-600 text-white rounded-lg hover:bg-brand-700 font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? '設定中...' : 'パスワードを設定'}
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  // メインログイン画面
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-md p-4">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-brand-600">MailDeck</h1>
          <p className="text-gray-500 mt-2">アカウントにサインイン</p>
        </div>

        <div className="bg-white p-8 rounded-lg shadow">
          <form onSubmit={handlePasswordSignIn} className="space-y-6">
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

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                パスワード
              </label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                placeholder="パスワード"
                required
              />
            </div>

            <div className="flex justify-end">
              <Link
                to="/forgot-password"
                className="text-sm text-brand-600 hover:text-brand-700"
              >
                パスワードをお忘れですか？
              </Link>
            </div>

            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full px-4 py-3 bg-brand-600 text-white rounded-lg hover:bg-brand-700 font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? 'サインイン中...' : 'サインイン'}
            </button>
          </form>

          {/* Passkey login button */}
          {isWebAuthnSupported && (
            <>
              <div className="relative my-6">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-300" />
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-2 bg-white text-gray-500">または</span>
                </div>
              </div>

              <button
                type="button"
                onClick={handlePasskeySignIn}
                disabled={isLoading}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg hover:bg-gray-50 font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                パスキーでサインイン
              </button>
            </>
          )}

          <div className="mt-6 text-center text-sm text-gray-600">
            アカウントをお持ちでない方は{' '}
            <Link to="/signup" className="text-brand-600 hover:text-brand-700 font-medium">
              新規登録
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
