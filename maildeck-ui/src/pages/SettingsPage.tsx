import { useEffect, useState } from 'react';
import { addServerConfig, deleteServerConfig, getServerConfigs, updateServerConfig } from '../lib/api';
import ServerConfigModal from '../components/ServerConfigModal';

interface ServerConfig {
    id: string;
    accountName: string;
    imapHost: string;
    imapPort: number;
    imapSslEnabled: boolean;
    imapUsername: string;
    imapPassword: string;
    smtpHost: string;
    smtpPort: number;
    smtpSslEnabled: boolean;
    smtpUsername: string;
    smtpPassword: string;
}

export default function SettingsPage() {
    const [accounts, setAccounts] = useState<ServerConfig[]>([]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingAccount, setEditingAccount] = useState<ServerConfig | null>(null);
    const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');

    const loadAccounts = async () => {
        try {
            const data = await getServerConfigs();
            setAccounts(data);
        } catch (err) {
            console.error('Failed to load accounts', err);
        }
    };

    useEffect(() => {
        loadAccounts();
    }, []);

    const handleOpenCreateModal = () => {
        setEditingAccount(null);
        setModalMode('create');
        setIsModalOpen(true);
    };

    const handleOpenEditModal = (account: ServerConfig) => {
        setEditingAccount(account);
        setModalMode('edit');
        setIsModalOpen(true);
    };

    const handleSave = async (config: ServerConfig) => {
        try {
            if (modalMode === 'edit' && editingAccount) {
                await updateServerConfig(editingAccount.id, config);
                alert('アカウントを更新しました');
            } else {
                await addServerConfig(config);
                alert('アカウントを追加しました');
            }
            await loadAccounts();
            setIsModalOpen(false);
        } catch (err) {
            console.error(err);
            throw err; // Re-throw to let modal handle it
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('本当にこのアカウントを削除しますか？')) return;

        try {
            await deleteServerConfig(id);
            setAccounts(prev => prev.filter(a => a.id !== id));
            alert('アカウントを削除しました');
        } catch (err) {
            console.error(err);
            alert('削除に失敗しました');
        }
    };

    return (
        <div className="max-w-5xl mx-auto p-4 md:p-8">
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-2xl font-bold">設定</h1>
            </div>

            {/* Email Accounts Section */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 mb-6">
                <div className="p-6 border-b border-gray-100">
                    <div className="flex justify-between items-center">
                        <div>
                            <h2 className="text-lg font-semibold text-gray-800">メールアカウント</h2>
                            <p className="text-sm text-gray-500 mt-1">接続されているメールアカウントを管理</p>
                        </div>
                        <button
                            onClick={handleOpenCreateModal}
                            className="bg-brand-600 text-white px-4 py-2 rounded-lg hover:bg-brand-700 shadow-sm font-medium flex items-center gap-2"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                            </svg>
                            アカウント追加
                        </button>
                    </div>
                </div>

                <div className="p-6">
                    {accounts.length === 0 ? (
                        <div className="text-center py-12 bg-gray-50 rounded-lg border border-dashed border-gray-300">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-16 h-16 mx-auto text-gray-400 mb-4">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
                            </svg>
                            <p className="text-gray-600 mb-4">まだメールアカウントが登録されていません</p>
                            <button
                                onClick={handleOpenCreateModal}
                                className="text-brand-600 hover:text-brand-700 font-medium"
                            >
                                最初のアカウントを追加
                            </button>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {accounts.map((account) => (
                                <div
                                    key={account.id}
                                    className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:border-brand-300 hover:bg-gray-50 transition-all group"
                                >
                                    <div className="flex items-center gap-4 flex-1">
                                        <div className="w-12 h-12 rounded-full bg-brand-100 flex items-center justify-center flex-shrink-0">
                                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6 text-brand-600">
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
                                            </svg>
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <h3 className="font-semibold text-gray-900 truncate">
                                                {account.accountName}
                                            </h3>
                                            <p className="text-sm text-gray-500 truncate">
                                                {account.imapUsername}
                                            </p>
                                            <div className="flex gap-4 mt-1 text-xs text-gray-400">
                                                <span>IMAP: {account.imapHost}:{account.imapPort}</span>
                                                <span>SMTP: {account.smtpHost}:{account.smtpPort}</span>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={() => handleOpenEditModal(account)}
                                            className="p-2 text-gray-400 hover:text-brand-600 hover:bg-brand-50 rounded-lg transition-colors"
                                            title="編集"
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                                            </svg>
                                        </button>
                                        <button
                                            onClick={() => handleDelete(account.id)}
                                            className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                            title="削除"
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                                            </svg>
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Notification Settings */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200">
                <div className="p-6 border-b border-gray-100">
                    <h2 className="text-lg font-semibold text-gray-800">通知設定</h2>
                    <p className="text-sm text-gray-500 mt-1">新着メールの通知を管理</p>
                </div>
                <div className="p-6">
                    <div className="flex items-center justify-between p-4 border border-gray-200 rounded-lg">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6 text-blue-600">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
                                </svg>
                            </div>
                            <div>
                                <div className="font-medium text-gray-900">Web Push通知</div>
                                <div className="text-sm text-gray-500">新着メールのプッシュ通知を受け取る</div>
                            </div>
                        </div>
                        <button
                            onClick={async () => {
                                if (!('serviceWorker' in navigator)) {
                                    alert('このブラウザはService Workerに対応していません。');
                                    return;
                                }
                                try {
                                    const { registerServiceWorker, subscribeToPush } = await import('../lib/webpush');
                                    await registerServiceWorker();
                                    await subscribeToPush();
                                    alert('通知を有効化しました！');
                                } catch (err) {
                                    console.error(err);
                                    alert('通知の有効化に失敗しました。コンソールを確認してください。');
                                }
                            }}
                            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 font-medium transition-colors"
                        >
                            通知を有効化
                        </button>
                    </div>
                </div>
            </div>

            {/* Modal */}
            <ServerConfigModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onSave={handleSave}
                initialData={editingAccount}
                mode={modalMode}
            />
        </div>
    );
}
