import { useState } from 'react';
import { useAuthenticator } from '@aws-amplify/ui-react';
import { signUp } from 'aws-amplify/auth';
import { Link, Navigate, useNavigate } from 'react-router-dom';

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    const name = error.name;
    switch (name) {
      case 'UsernameExistsException':
        return 'このメールアドレスは既に登録されています。';
      case 'InvalidPasswordException':
        return 'パスワードは8文字以上で、大文字・小文字・数字を含める必要があります。';
      case 'InvalidParameterException':
        return '入力内容に問題があります。';
      case 'LimitExceededException':
        return 'リクエスト回数の上限に達しました。しばらく待ってから再試行してください。';
      default:
        return error.message || '予期しないエラーが発生しました。';
    }
  }
  return '予期しないエラーが発生しました。';
}

export default function SignUpPage() {
  const { authStatus } = useAuthenticator(context => [context.authStatus]);
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [agreedToPrivacy, setAgreedToPrivacy] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  if (authStatus === 'authenticated') {
    return <Navigate to="/" replace />;
  }

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Validation
    if (password !== confirmPassword) {
      setError('パスワードが一致しません。');
      return;
    }

    if (password.length < 8) {
      setError('パスワードは8文字以上である必要があります。');
      return;
    }

    if (!agreedToTerms || !agreedToPrivacy) {
      setError('利用規約とプライバシーポリシーに同意してください。');
      return;
    }

    setIsLoading(true);

    try {
      const { nextStep } = await signUp({
        username: email,
        password,
        options: {
          userAttributes: {
            email,
          },
        },
      });

      if (nextStep.signUpStep === 'CONFIRM_SIGN_UP') {
        navigate('/confirm-signup', { state: { email } });
      } else if (nextStep.signUpStep === 'DONE') {
        navigate('/login', { state: { message: 'アカウントが作成されました。サインインしてください。' } });
      }
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  };

  const isFormValid = email && password && confirmPassword && agreedToTerms && agreedToPrivacy;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-md p-4">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-brand-600">MailDeck</h1>
          <p className="text-gray-500 mt-2">新規アカウント作成</p>
        </div>

        <div className="bg-white p-8 rounded-lg shadow">
          <form onSubmit={handleSignUp} className="space-y-6">
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
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                placeholder="パスワード"
                required
              />
              <p className="mt-1 text-xs text-gray-500">8文字以上、大文字・小文字・数字を含めてください</p>
            </div>

            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-1">
                パスワード（確認）
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

            {/* Terms and Privacy Agreement */}
            <div className="space-y-3 border-t border-gray-200 pt-4">
              <div className="flex items-start gap-3">
                <input
                  id="terms"
                  type="checkbox"
                  checked={agreedToTerms}
                  onChange={(e) => setAgreedToTerms(e.target.checked)}
                  className="mt-1 h-4 w-4 text-brand-600 focus:ring-brand-500 border-gray-300 rounded"
                />
                <label htmlFor="terms" className="text-sm text-gray-600">
                  <a
                    href="/terms"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-brand-600 hover:text-brand-700 underline"
                  >
                    利用規約
                  </a>
                  に同意します
                </label>
              </div>

              <div className="flex items-start gap-3">
                <input
                  id="privacy"
                  type="checkbox"
                  checked={agreedToPrivacy}
                  onChange={(e) => setAgreedToPrivacy(e.target.checked)}
                  className="mt-1 h-4 w-4 text-brand-600 focus:ring-brand-500 border-gray-300 rounded"
                />
                <label htmlFor="privacy" className="text-sm text-gray-600">
                  <a
                    href="/privacy"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-brand-600 hover:text-brand-700 underline"
                  >
                    プライバシーポリシー
                  </a>
                  に同意します
                </label>
              </div>
            </div>

            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading || !isFormValid}
              className="w-full px-4 py-3 bg-brand-600 text-white rounded-lg hover:bg-brand-700 font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? 'アカウント作成中...' : 'アカウントを作成'}
            </button>
          </form>

          <div className="mt-6 text-center text-sm text-gray-600">
            既にアカウントをお持ちの方は{' '}
            <Link to="/login" className="text-brand-600 hover:text-brand-700 font-medium">
              サインイン
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
