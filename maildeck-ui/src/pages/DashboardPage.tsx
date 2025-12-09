import { fetchAuthSession } from 'aws-amplify/auth';
import axios from 'axios';
import { useCallback, useEffect, useState } from 'react';
import ComposeModal from '../components/ComposeModal';
import MailDetailModal from '../components/MailDetailModal';
import { getInbox, getServerConfigs } from '../lib/api';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

interface Account {
    id: number;
    accountName: string;
}

interface Email {
    id: string;
    from: string;
    subject: string;
    date: string;
    isRead: boolean;
    configId: number; // For identifying which account the email belongs to
}

export default function DashboardPage() {
    const [selectedMail, setSelectedMail] = useState<Email | null>(null);
    const [mails, setMails] = useState<Email[]>([]);
    const [loading, setLoading] = useState(false);
    const [isComposeOpen, setIsComposeOpen] = useState(false);
    const [activeTab, setActiveTab] = useState<number | null>(null);
    const [accounts, setAccounts] = useState<Account[]>([]);
    const [page] = useState(1);

    const loadConfigs = async () => {
        try {
            const configs = await getServerConfigs();
            setAccounts(configs);
            // Default to "All Accounts" (0) if configs exist
            if (configs.length > 0) {
                setActiveTab(0);
            }
        } catch (error) {
            console.error('Failed to load accounts', error);
        }
    };

    const loadInbox = useCallback(async () => {
        if (activeTab === null) return;

        setLoading(true);
        try {
            if (activeTab === 0) {
                // Fetch all and merge
                const promises = accounts.map(acc => getInbox(acc.id, page).then(res => ({
                    messages: (res.messages || []).map((m: any) => ({ ...m, configId: acc.id }))
                })));
                const results = await Promise.all(promises);
                const allMails = results.flatMap(r => r.messages || []);
                // Sort by date desc
                allMails.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
                setMails(allMails);
            } else {
                const data = await getInbox(activeTab, page);
                // Inject configId for single tab too for consistency
                const messagesWithConfig = (data.messages || []).map((m: any) => ({ ...m, configId: activeTab }));
                setMails(messagesWithConfig);
            }
        } catch (error) {
            console.error('Failed to load inbox', error);
        } finally {
            setLoading(false);
        }
    }, [activeTab, page, accounts]);

    // Clear inbox on tab switch
    useEffect(() => {
        setMails([]);
    }, [activeTab]);

    useEffect(() => {
        loadConfigs();
    }, []);

    useEffect(() => {
        if (activeTab !== null) {
            loadInbox();
        }
    }, [loadInbox]);

    const handleSendMail = async (to: string, subject: string, body: string, configId: number) => {
        if (!configId) {
            alert('アカウントを選択してください');
            return;
        }

        const session = await fetchAuthSession();
        const token = session.tokens?.idToken?.toString();

        if (!token) {
            alert('認証エラー: ログインし直してください。');
            return;
        }

        try {
            await axios.post(`${API_BASE}/mail/send`, {
                to,
                subject,
                body,
                configId
            }, {
                headers: {
                    Authorization: `Bearer ${token}`
                }
            });

            alert('メールを送信しました！');
            setIsComposeOpen(false);
        } catch (error) {
            console.error(error);
            alert('送信失敗');
        }
    };

    return (
        <div className="p-8">
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-2xl font-bold">受信トレイ</h1>
                <button
                    onClick={() => setIsComposeOpen(true)}
                    className="bg-brand-600 text-white px-4 py-2 rounded-lg hover:bg-brand-700 shadow-sm font-medium flex items-center gap-2"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                    </svg>
                    作成
                </button>
            </div>

            <div className="flex space-x-1 mb-4 border-b border-gray-200 overflow-x-auto">
                {accounts.length === 0 && <div className="p-2 text-gray-500">アカウントがありません。設定ページから追加してください。</div>}

                {accounts.length > 0 && (
                    <button
                        onClick={() => setActiveTab(0)}
                        className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${activeTab === 0
                            ? 'border-brand-600 text-brand-600'
                            : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                            }`}
                    >
                        すべてのトレイ
                    </button>
                )}

                {accounts.map(account => (
                    <button
                        key={account.id}
                        onClick={() => setActiveTab(account.id)}
                        className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${activeTab === account.id
                            ? 'border-brand-600 text-brand-600'
                            : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                            }`}
                    >
                        {account.accountName || `Account ${account.id}`}
                    </button>
                ))}
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden min-h-[400px]">
                {loading ? (
                    <div className="p-8 text-center text-gray-500">読み込み中...</div>
                ) : mails.length === 0 ? (
                    <div className="p-8 text-center text-gray-500">メールはありません。</div>
                ) : (
                    <table className="w-full table-fixed">
                        <thead className="bg-gray-50/50 border-b border-gray-100">
                            <tr>
                                <th className="text-left p-4 font-medium text-gray-500 text-sm w-1/4">送信者</th>
                                <th className="text-left p-4 font-medium text-gray-500 text-sm w-1/2">件名</th>
                                <th className="text-right p-4 font-medium text-gray-500 text-sm w-1/4">日時</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {mails.map(mail => (
                                <tr
                                    key={`${mail.configId}-${mail.id}`}
                                    onClick={() => setSelectedMail(mail)}
                                    className={`hover:bg-gray-50 cursor-pointer transition-colors ${!mail.isRead ? 'font-semibold bg-blue-50/30' : ''}`}
                                >
                                    <td className="p-4 text-gray-900 truncate" title={mail.from}>{mail.from}</td>
                                    <td className="p-4 truncate">
                                        <span className="text-gray-900">{mail.subject || '(件名なし)'}</span>
                                    </td>
                                    <td className="p-4 text-right text-gray-500 text-sm whitespace-nowrap">
                                        {new Date(mail.date).toLocaleString()}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            <ComposeModal
                isOpen={isComposeOpen}
                onClose={() => setIsComposeOpen(false)}
                onSend={handleSendMail}
                accounts={accounts}
            />

            {selectedMail && (
                <MailDetailModal
                    isOpen={!!selectedMail}
                    onClose={() => setSelectedMail(null)}
                    configId={selectedMail.configId}
                    messageId={selectedMail.id}
                />
            )}
        </div>
    );
}
