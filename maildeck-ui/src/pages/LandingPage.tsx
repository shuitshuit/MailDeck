import { Link } from 'react-router-dom';
import { useAuthenticator } from '@aws-amplify/ui-react';
import Logo from '../components/Logo';

export default function LandingPage() {
    const { authStatus } = useAuthenticator(context => [context.authStatus]);
    const isAuthenticated = authStatus === 'authenticated';

    return (
        <div className="min-h-screen bg-gradient-to-br from-brand-50 via-white to-blue-50">
            {/* Header */}
            <header className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-md border-b border-gray-100">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex justify-between items-center h-16">
                        <Logo size="sm" />
                        <nav className="flex items-center gap-4">
                            {isAuthenticated ? (
                                <Link
                                    to="/inbox"
                                    className="px-4 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700 transition-colors font-medium"
                                >
                                    ダッシュボードへ
                                </Link>
                            ) : (
                                <>
                                    <Link
                                        to="/login"
                                        className="px-4 py-2 text-gray-700 hover:text-brand-600 transition-colors font-medium"
                                    >
                                        ログイン
                                    </Link>
                                    <Link
                                        to="/signup"
                                        className="px-4 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700 transition-colors font-medium"
                                    >
                                        無料で始める
                                    </Link>
                                </>
                            )}
                        </nav>
                    </div>
                </div>
            </header>

            {/* Hero Section */}
            <section className="pt-32 pb-20 px-4 sm:px-6 lg:px-8">
                <div className="max-w-7xl mx-auto text-center">
                    <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-gray-900 mb-6">
                        複数のメールを
                        <br />
                        <span className="text-brand-600">ひとつの場所</span>で管理
                    </h1>
                    <p className="text-xl text-gray-600 max-w-2xl mx-auto mb-10">
                        MailDeckは、複数のIMAPメールアカウントを統合管理できるWebメールクライアントです。
                        スマートな自動ラベリングと通知機能で、メール管理を効率化します。
                    </p>
                    <div className="flex flex-col sm:flex-row gap-4 justify-center">
                        <Link
                            to={isAuthenticated ? "/inbox" : "/signup"}
                            className="px-8 py-4 bg-brand-600 text-white rounded-xl hover:bg-brand-700 transition-colors font-semibold text-lg shadow-lg shadow-brand-600/25"
                        >
                            {isAuthenticated ? "ダッシュボードへ" : "無料で始める"}
                        </Link>
                        <a
                            href="#features"
                            className="px-8 py-4 bg-white text-gray-700 rounded-xl hover:bg-gray-50 transition-colors font-semibold text-lg border border-gray-200"
                        >
                            機能を見る
                        </a>
                    </div>
                </div>
            </section>

            {/* Features Section */}
            <section id="features" className="py-20 px-4 sm:px-6 lg:px-8 bg-white">
                <div className="max-w-7xl mx-auto">
                    <div className="text-center mb-16">
                        <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">主な機能</h2>
                        <p className="text-lg text-gray-600">シンプルで強力なメール管理ツール</p>
                    </div>

                    <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
                        {/* Feature 1 */}
                        <div className="p-6 rounded-2xl bg-gradient-to-br from-blue-50 to-white border border-blue-100">
                            <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center mb-4">
                                <svg className="w-6 h-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                                </svg>
                            </div>
                            <h3 className="text-xl font-semibold text-gray-900 mb-2">複数アカウント統合</h3>
                            <p className="text-gray-600">
                                Gmail、Outlook、独自ドメインなど、複数のIMAPメールアカウントを一つの画面で管理。
                                アカウントを切り替える手間がなくなります。
                            </p>
                        </div>

                        {/* Feature 2 */}
                        <div className="p-6 rounded-2xl bg-gradient-to-br from-purple-50 to-white border border-purple-100">
                            <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center mb-4">
                                <svg className="w-6 h-6 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                                </svg>
                            </div>
                            <h3 className="text-xl font-semibold text-gray-900 mb-2">自動ラベリング</h3>
                            <p className="text-gray-600">
                                送信元、件名、本文の条件に基づいて、メールに自動でラベルを付与。
                                重要なメールを見逃しません。
                            </p>
                        </div>

                        {/* Feature 3 */}
                        <div className="p-6 rounded-2xl bg-gradient-to-br from-green-50 to-white border border-green-100">
                            <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center mb-4">
                                <svg className="w-6 h-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                                </svg>
                            </div>
                            <h3 className="text-xl font-semibold text-gray-900 mb-2">スマート通知</h3>
                            <p className="text-gray-600">
                                ラベルごとに通知のオン/オフを設定可能。
                                必要なメールだけ通知を受け取り、集中を妨げません。
                            </p>
                        </div>

                        {/* Feature 4 */}
                        <div className="p-6 rounded-2xl bg-gradient-to-br from-orange-50 to-white border border-orange-100">
                            <div className="w-12 h-12 bg-orange-100 rounded-xl flex items-center justify-center mb-4">
                                <svg className="w-6 h-6 text-orange-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                </svg>
                            </div>
                            <h3 className="text-xl font-semibold text-gray-900 mb-2">カスタムアクション</h3>
                            <p className="text-gray-600">
                                認証コードの自動抽出など、メールに対するカスタムアクションを設定。
                                OTPコードをワンクリックでコピー。
                            </p>
                        </div>

                        {/* Feature 5 */}
                        <div className="p-6 rounded-2xl bg-gradient-to-br from-red-50 to-white border border-red-100">
                            <div className="w-12 h-12 bg-red-100 rounded-xl flex items-center justify-center mb-4">
                                <svg className="w-6 h-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                                </svg>
                            </div>
                            <h3 className="text-xl font-semibold text-gray-900 mb-2">非表示ラベル</h3>
                            <p className="text-gray-600">
                                特定のラベルが付いたメールを受信トレイから非表示に。
                                通知も抑制でき、ノイズを減らせます。
                            </p>
                        </div>

                        {/* Feature 6 */}
                        <div className="p-6 rounded-2xl bg-gradient-to-br from-cyan-50 to-white border border-cyan-100">
                            <div className="w-12 h-12 bg-cyan-100 rounded-xl flex items-center justify-center mb-4">
                                <svg className="w-6 h-6 text-cyan-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                                </svg>
                            </div>
                            <h3 className="text-xl font-semibold text-gray-900 mb-2">セキュアな認証</h3>
                            <p className="text-gray-600">
                                AWS Cognitoによる安全な認証。
                                パスキー対応で、パスワードレスログインも可能です。
                            </p>
                        </div>
                    </div>
                </div>
            </section>

            {/* How it works */}
            <section className="py-20 px-4 sm:px-6 lg:px-8 bg-gray-50">
                <div className="max-w-7xl mx-auto">
                    <div className="text-center mb-16">
                        <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">使い方</h2>
                        <p className="text-lg text-gray-600">3ステップで簡単スタート</p>
                    </div>

                    <div className="grid md:grid-cols-3 gap-8">
                        <div className="text-center">
                            <div className="w-16 h-16 bg-brand-100 rounded-full flex items-center justify-center mx-auto mb-4 text-2xl font-bold text-brand-600">
                                1
                            </div>
                            <h3 className="text-xl font-semibold text-gray-900 mb-2">アカウント作成</h3>
                            <p className="text-gray-600">
                                メールアドレスまたはパスキーで
                                簡単にアカウントを作成
                            </p>
                        </div>

                        <div className="text-center">
                            <div className="w-16 h-16 bg-brand-100 rounded-full flex items-center justify-center mx-auto mb-4 text-2xl font-bold text-brand-600">
                                2
                            </div>
                            <h3 className="text-xl font-semibold text-gray-900 mb-2">メールアカウント追加</h3>
                            <p className="text-gray-600">
                                IMAPサーバー情報を入力して
                                メールアカウントを接続
                            </p>
                        </div>

                        <div className="text-center">
                            <div className="w-16 h-16 bg-brand-100 rounded-full flex items-center justify-center mx-auto mb-4 text-2xl font-bold text-brand-600">
                                3
                            </div>
                            <h3 className="text-xl font-semibold text-gray-900 mb-2">メール管理開始</h3>
                            <p className="text-gray-600">
                                すべてのメールを一つの画面で
                                効率的に管理
                            </p>
                        </div>
                    </div>
                </div>
            </section>

            {/* CTA Section */}
            <section className="py-20 px-4 sm:px-6 lg:px-8 bg-brand-600">
                <div className="max-w-4xl mx-auto text-center">
                    <h2 className="text-3xl sm:text-4xl font-bold text-white mb-6">
                        今すぐMailDeckを始めましょう
                    </h2>
                    <p className="text-xl text-brand-100 mb-10">
                        複数のメールアカウントを一つの場所で管理して、生産性を向上させましょう。
                    </p>
                    <Link
                        to={isAuthenticated ? "/inbox" : "/signup"}
                        className="inline-block px-8 py-4 bg-white text-brand-600 rounded-xl hover:bg-brand-50 transition-colors font-semibold text-lg shadow-lg"
                    >
                        {isAuthenticated ? "ダッシュボードへ" : "無料で始める"}
                    </Link>
                </div>
            </section>

            {/* Footer */}
            <footer className="py-12 px-4 sm:px-6 lg:px-8 bg-gray-900">
                <div className="max-w-7xl mx-auto">
                    <div className="flex flex-col md:flex-row justify-between items-center">
                        <div className="flex items-center gap-2 mb-4 md:mb-0">
                            <Logo size="sm" showText={false} />
                            <span className="text-xl font-bold text-white">MailDeck</span>
                        </div>
                        <p className="text-gray-400 text-sm">
                            &copy; {new Date().getFullYear()} MailDeck. All rights reserved.
                        </p>
                    </div>
                </div>
            </footer>
        </div>
    );
}
