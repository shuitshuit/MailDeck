import { useState, useEffect, useCallback } from 'react';
import {
  associateWebAuthnCredential,
  listWebAuthnCredentials,
  deleteWebAuthnCredential,
} from 'aws-amplify/auth';
import { useToast } from '../contexts/ToastContext';

interface WebAuthnCredential {
  credentialId?: string;
  friendlyCredentialName?: string;
  relyingPartyId?: string;
  createdAt?: Date;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    const name = error.name;
    switch (name) {
      case 'InvalidStateError':
        return 'このパスキーは既に登録されています。';
      case 'NotAllowedError':
        return 'パスキーの登録がキャンセルされました。';
      case 'SecurityError':
        return 'セキュリティエラーが発生しました。';
      case 'AbortError':
        return '操作がキャンセルされました。';
      default:
        return error.message || '予期しないエラーが発生しました。';
    }
  }
  return '予期しないエラーが発生しました。';
}

export default function PasskeySettings() {
  const toast = useToast();
  const [credentials, setCredentials] = useState<WebAuthnCredential[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRegistering, setIsRegistering] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const isWebAuthnSupported = typeof window !== 'undefined' && window.PublicKeyCredential !== undefined;

  const loadCredentials = useCallback(async () => {
    setIsLoading(true);
    setError('');

    try {
      const result = await listWebAuthnCredentials();
      setCredentials(result.credentials || []);
    } catch (err) {
      console.error('Failed to load passkeys:', err);
      setError('パスキーの読み込みに失敗しました。');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isWebAuthnSupported) {
      loadCredentials();
    } else {
      setIsLoading(false);
    }
  }, [isWebAuthnSupported, loadCredentials]);

  const handleRegisterPasskey = async () => {
    setError('');
    setIsRegistering(true);

    try {
      await associateWebAuthnCredential();
      toast.success('パスキーが登録されました');
      await loadCredentials();
    } catch (err) {
      const message = getErrorMessage(err);
      setError(message);
      toast.error(message);
    } finally {
      setIsRegistering(false);
    }
  };

  const handleDeletePasskey = async (credentialId: string | undefined) => {
    if (!credentialId) {
      return;
    }

    if (!confirm('このパスキーを削除しますか？削除後はこのパスキーでログインできなくなります。')) {
      return;
    }

    setError('');
    setDeletingId(credentialId);

    try {
      await deleteWebAuthnCredential({ credentialId });
      toast.success('パスキーが削除されました');
      await loadCredentials();
    } catch (err) {
      const message = getErrorMessage(err);
      setError(message);
      toast.error(message);
    } finally {
      setDeletingId(null);
    }
  };

  const formatDate = (date: Date | undefined) => {
    if (!date) return '不明';
    return new Date(date).toLocaleDateString('ja-JP', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  if (!isWebAuthnSupported) {
    return (
      <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
        <div className="flex items-start gap-3">
          <svg className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <div>
            <h3 className="font-medium text-yellow-800">パスキーは利用できません</h3>
            <p className="text-sm text-yellow-700 mt-1">
              お使いのブラウザはパスキー（WebAuthn）に対応していません。
              最新のChrome、Firefox、Safari、またはEdgeをお使いください。
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-gray-800">パスキー</h2>
        <p className="text-sm text-gray-500 mt-1">
          パスキーを使用すると、Face ID、Touch ID、Windows Helloなどの生体認証で安全にログインできます。
        </p>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
          {error}
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600"></div>
        </div>
      ) : (
        <>
          {/* Registered Passkeys */}
          {credentials.length > 0 ? (
            <div className="space-y-3 mb-6">
              {credentials.map((credential) => (
                <div
                  key={credential.credentialId}
                  className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:border-brand-300 transition-all"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                      <svg className="w-6 h-6 text-green-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900">
                        {credential.friendlyCredentialName || 'パスキー'}
                      </h3>
                      <p className="text-sm text-gray-500">
                        登録日: {formatDate(credential.createdAt)}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => handleDeletePasskey(credential.credentialId)}
                    disabled={deletingId === credential.credentialId}
                    className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                    title="削除"
                  >
                    {deletingId === credential.credentialId ? (
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-red-600"></div>
                    ) : (
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                      </svg>
                    )}
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 bg-gray-50 rounded-lg border border-dashed border-gray-300 mb-6">
              <svg className="w-12 h-12 mx-auto text-gray-400 mb-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <p className="text-gray-600 mb-2">パスキーが登録されていません</p>
              <p className="text-sm text-gray-500">パスキーを追加して、より安全で便利なログインを体験しましょう</p>
            </div>
          )}

          {/* Add Passkey Button */}
          <button
            onClick={handleRegisterPasskey}
            disabled={isRegistering}
            className="w-full px-4 py-3 bg-brand-600 text-white rounded-lg hover:bg-brand-700 font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isRegistering ? (
              <>
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                登録中...
              </>
            ) : (
              <>
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
                パスキーを追加
              </>
            )}
          </button>

          {/* Info */}
          <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <h4 className="font-medium text-blue-800 mb-2">パスキーとは？</h4>
            <ul className="text-sm text-blue-700 space-y-1">
              <li>• パスワードの代わりに生体認証でログインできます</li>
              <li>• Face ID、Touch ID、Windows Hello、セキュリティキーに対応</li>
              <li>• フィッシング攻撃に強い、より安全な認証方法です</li>
              <li>• 複数のデバイスにパスキーを登録できます</li>
            </ul>
          </div>
        </>
      )}
    </div>
  );
}
