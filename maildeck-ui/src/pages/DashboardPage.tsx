import { fetchAuthSession } from 'aws-amplify/auth';
import axios from 'axios';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import ComposeModal from '../components/ComposeModal';
import MailDetailModal from '../components/MailDetailModal';
import LabelBadge from '../components/LabelBadge';
import SearchBar from '../components/SearchBar';
import { getInbox, getServerConfigs, getLabels } from '../lib/api';
import type { Label } from '../types/label';
import { useToast } from '../contexts/ToastContext';
import { parseSearchQuery } from '../utils/searchParser';
import { addSearchHistory } from '../utils/searchHistory';
import type { SearchQuery } from '../types/search';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

interface Account {
    id: string;
    accountName: string;
}

interface Email {
    id: string;
    from: string;
    to?: string;
    subject: string;
    date: string;
    isRead: boolean;
    hasAttachment?: boolean;
    configId: string; // For identifying which account the email belongs to
    labels?: Label[]; // Labels attached to this email
}

export default function DashboardPage() {
    const { accountId } = useParams();
    const navigate = useNavigate();
    const [selectedMail, setSelectedMail] = useState<Email | null>(null);
    const [mails, setMails] = useState<Email[]>([]);
    const [loading, setLoading] = useState(false);
    const [isComposeOpen, setIsComposeOpen] = useState(false);
    const [activeTab, setActiveTab] = useState<string | null>(null);
    const [accounts, setAccounts] = useState<Account[]>([]);
    const [page] = useState(1);
    const [labels, setLabels] = useState<Label[]>([]);
    const [selectedLabelId, setSelectedLabelId] = useState<string | null>(null);
    const [searchQueryString, setSearchQueryString] = useState('');
    const [parsedSearchQuery, setParsedSearchQuery] = useState<SearchQuery>({ keywords: [] });
    const toast = useToast();

    const loadConfigs = async () => {
        try {
            const configs = await getServerConfigs();
            setAccounts(configs);
        } catch (error) {
            console.error('Failed to load accounts', error);
        }
    };

    // Effect to sync URL param to activeTab
    useEffect(() => {
        if (accounts.length === 0) return;

        if (accountId) {
            setActiveTab(accountId);
            return;
        }

        // Default to "all" if no ID
        // Only set default if we are at root or /inbox without ID
        if (!accountId && activeTab === null) {
            setActiveTab('all');
        }
    }, [accountId, accounts]);

    // Handle tab change
    const onTabChange = (id: string) => {
        setActiveTab(id);
        if (id === 'all') {
            navigate('/inbox');
        } else {
            navigate(`/inbox/${id}`);
        }
    };

    const loadInbox = useCallback(async () => {
        if (activeTab === null) return;

        setLoading(true);
        try {
            if (activeTab === 'all') {
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
        loadLabels();
    }, []);

    const loadLabels = async () => {
        try {
            const labelList = await getLabels();
            setLabels(labelList);
        } catch (error) {
            console.error('Failed to load labels', error);
        }
    };

    useEffect(() => {
        if (activeTab !== null) {
            loadInbox();
        }
    }, [loadInbox]);

    // Filter mails by selected label and search query
    const filteredMails = useMemo(() => {
        let filtered = mails;

        // ラベルフィルタリング
        if (selectedLabelId) {
            filtered = filtered.filter(mail =>
                mail.labels?.some(label => label.id === selectedLabelId)
            );
        }

        // 検索クエリフィルタリング
        const query = parsedSearchQuery;

        // from: 演算子
        if (query.from && query.from.length > 0) {
            filtered = filtered.filter(mail =>
                query.from!.some(f => mail.from.toLowerCase().includes(f.toLowerCase()))
            );
        }

        // to: 演算子
        if (query.to && query.to.length > 0) {
            filtered = filtered.filter(mail =>
                mail.to && query.to!.some(t => mail.to!.toLowerCase().includes(t.toLowerCase()))
            );
        }

        // subject: 演算子
        if (query.subject && query.subject.length > 0) {
            filtered = filtered.filter(mail =>
                query.subject!.some(s => (mail.subject || '').toLowerCase().includes(s.toLowerCase()))
            );
        }

        // label: 演算子
        if (query.labels && query.labels.length > 0) {
            filtered = filtered.filter(mail =>
                mail.labels && query.labels!.some(labelName =>
                    mail.labels!.some(mailLabel =>
                        mailLabel.name.toLowerCase() === labelName.toLowerCase()
                    )
                )
            );
        }

        // is:unread / is:read 演算子
        if (query.isUnread !== undefined) {
            filtered = filtered.filter(mail => !mail.isRead === query.isUnread);
        }

        // has:attachment 演算子
        if (query.hasAttachment) {
            filtered = filtered.filter(mail => mail.hasAttachment === true);
        }

        // exclude.from 演算子
        if (query.exclude?.from && query.exclude.from.length > 0) {
            filtered = filtered.filter(mail =>
                !query.exclude!.from!.some(f => mail.from.toLowerCase().includes(f.toLowerCase()))
            );
        }

        // exclude.subject 演算子
        if (query.exclude?.subject && query.exclude.subject.length > 0) {
            filtered = filtered.filter(mail =>
                !query.exclude!.subject!.some(s => (mail.subject || '').toLowerCase().includes(s.toLowerCase()))
            );
        }

        // 一般キーワード
        if (query.keywords.length > 0) {
            filtered = filtered.filter(mail => {
                const from = mail.from.toLowerCase();
                const to = (mail.to || '').toLowerCase();
                const subject = (mail.subject || '').toLowerCase();
                const searchText = `${from} ${to} ${subject}`;

                return query.keywords.some(keyword =>
                    searchText.includes(keyword.toLowerCase())
                );
            });
        }

        return filtered;
    }, [mails, selectedLabelId, parsedSearchQuery]);

    // 検索ハンドラー
    const handleSearch = (queryString: string) => {
        setSearchQueryString(queryString);
        const parsed = parseSearchQuery(queryString);
        setParsedSearchQuery(parsed);

        // 検索履歴に保存（空でない場合のみ）
        if (queryString.trim()) {
            addSearchHistory(queryString);
        }
    };

    const handleSendMail = async (to: string, subject: string, body: string, configId: string) => {
        if (!configId) {
            toast.warning('アカウントを選択してください');
            return;
        }

        const session = await fetchAuthSession();
        const token = session.tokens?.idToken?.toString();

        if (!token) {
            toast.error('認証エラー: ログインし直してください。');
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

            toast.success('メールを送信しました！');
            setIsComposeOpen(false);
        } catch (error) {
            console.error(error);
            toast.error('送信失敗');
        }
    };

    return (
        <div className="p-4 md:p-8">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
                <h1 className="text-2xl font-bold">受信トレイ</h1>
                <div className="flex gap-2 w-full md:w-auto">
                    <button
                        onClick={() => loadInbox()}
                        className="bg-white text-gray-600 border border-gray-300 px-4 py-2 rounded-lg hover:bg-gray-50 shadow-sm font-medium flex items-center justify-center gap-2 flex-1 md:flex-none"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
                        </svg>
                        更新
                    </button>
                    <button
                        onClick={() => setIsComposeOpen(true)}
                        className="bg-brand-600 text-white px-4 py-2 rounded-lg hover:bg-brand-700 shadow-sm font-medium flex items-center justify-center gap-2 flex-1 md:flex-none"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                        </svg>
                        作成
                    </button>
                </div>
            </div>

            {/* 検索バー */}
            <div className="mb-4">
                <SearchBar onSearch={handleSearch} placeholder="送信者、件名で検索..." />
            </div>

            <div className="flex space-x-1 mb-4 border-b border-gray-200 overflow-x-auto pb-1 hide-scrollbar">
                {accounts.length === 0 && <div className="p-2 text-gray-500">アカウントがありません。設定ページから追加してください。</div>}

                {accounts.length > 0 && (
                    <button
                        onClick={() => onTabChange('all')}
                        className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap flex-shrink-0 ${activeTab === 'all'
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
                        onClick={() => onTabChange(account.id)}
                        className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap flex-shrink-0 ${activeTab === account.id
                            ? 'border-brand-600 text-brand-600'
                            : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                            }`}
                    >
                        {account.accountName || `Account ${account.id}`}
                    </button>
                ))}
            </div>

            {/* Label filter */}
            {labels.length > 0 && (
                <div className="mb-4 flex items-center gap-2 flex-wrap">
                    <span className="text-sm text-gray-600 font-medium">ラベルで絞り込み:</span>
                    <button
                        onClick={() => setSelectedLabelId(null)}
                        className={`px-3 py-1 text-sm rounded-full transition-colors ${
                            selectedLabelId === null
                                ? 'bg-brand-600 text-white'
                                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                    >
                        すべて
                    </button>
                    {labels.map(label => (
                        <button
                            key={label.id}
                            onClick={() => setSelectedLabelId(label.id)}
                            className={`px-3 py-1 text-sm rounded-full transition-all flex items-center gap-1 ${
                                selectedLabelId === label.id
                                    ? 'ring-2 ring-offset-1 ring-gray-800'
                                    : 'hover:opacity-80'
                            }`}
                            style={{
                                backgroundColor: label.color,
                                color: getContrastColor(label.color)
                            }}
                        >
                            {label.name}
                        </button>
                    ))}
                </div>
            )}

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden min-h-[400px]">
                {loading ? (
                    <div className="p-8 text-center text-gray-500">読み込み中...</div>
                ) : filteredMails.length === 0 ? (
                    <div className="p-8 text-center text-gray-500">
                        {searchQueryString.trim()
                            ? '検索結果がありません。'
                            : selectedLabelId
                                ? 'このラベルのメールはありません。'
                                : 'メールはありません。'}
                    </div>
                ) : (
                    <>
                        {/* Mobile View (Cards) */}
                        <div className="block md:hidden divide-y divide-gray-100">
                            {filteredMails.map(mail => (
                                <div
                                    key={`mobile-${mail.configId}-${mail.id}`}
                                    onClick={() => setSelectedMail(mail)}
                                    className={`p-4 active:bg-gray-50 cursor-pointer ${!mail.isRead ? 'font-semibold bg-blue-50/30' : ''}`}
                                >
                                    <div className="flex justify-between items-start mb-1">
                                        <div className="text-sm font-medium text-gray-900 truncate flex-1 pr-2">{mail.from}</div>
                                        <div className="text-xs text-gray-500 whitespace-nowrap">
                                            {new Date(mail.date).toLocaleDateString()}
                                        </div>
                                    </div>
                                    <div className="text-sm text-gray-800 mb-1 truncate">{mail.subject || '(件名なし)'}</div>
                                    {mail.labels && mail.labels.length > 0 && (
                                        <div className="flex flex-wrap gap-1 mt-2">
                                            {mail.labels.map(label => (
                                                <LabelBadge key={label.id} label={label} />
                                            ))}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>

                        {/* Desktop View (Table) */}
                        <table className="hidden md:table w-full table-fixed">
                            <thead className="bg-gray-50/50 border-b border-gray-100">
                                <tr>
                                    <th className="text-left p-4 font-medium text-gray-500 text-sm w-1/4">送信者</th>
                                    <th className="text-left p-4 font-medium text-gray-500 text-sm w-1/2">件名</th>
                                    <th className="text-right p-4 font-medium text-gray-500 text-sm w-1/4">日時</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                                {filteredMails.map(mail => (
                                    <tr
                                        key={`${mail.configId}-${mail.id}`}
                                        onClick={() => setSelectedMail(mail)}
                                        className={`hover:bg-gray-50 cursor-pointer transition-colors ${!mail.isRead ? 'font-semibold bg-blue-50/30' : ''}`}
                                    >
                                        <td className="p-4 text-gray-900 truncate" title={mail.from}>{mail.from}</td>
                                        <td className="p-4">
                                            <div className="flex flex-col gap-1">
                                                <span className="text-gray-900 truncate">{mail.subject || '(件名なし)'}</span>
                                                {mail.labels && mail.labels.length > 0 && (
                                                    <div className="flex flex-wrap gap-1">
                                                        {mail.labels.map(label => (
                                                            <LabelBadge key={label.id} label={label} />
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        </td>
                                        <td className="p-4 text-right text-gray-500 text-sm whitespace-nowrap">
                                            {new Date(mail.date).toLocaleString()}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </>
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
                    messageId={parseInt(selectedMail.id)}
                />
            )}
        </div>
    );
}

/**
 * Calculate contrasting text color (white or black) based on background color
 */
function getContrastColor(hexColor: string): string {
    const r = parseInt(hexColor.slice(1, 3), 16);
    const g = parseInt(hexColor.slice(3, 5), 16);
    const b = parseInt(hexColor.slice(5, 7), 16);

    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

    return luminance > 0.5 ? '#000000' : '#FFFFFF';
}
