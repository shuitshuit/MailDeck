import { fetchAuthSession } from 'aws-amplify/auth';
import axios from 'axios';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import ComposeModal from '../components/ComposeModal';
import MailDetailModal from '../components/MailDetailModal';
import LabelBadge from '../components/LabelBadge';
import SearchBar from '../components/SearchBar';
import { getInbox, getInboxFolder, getServerConfigs, getDrafts, getSpam, getTrash, emptyTrash, bulkMoveToTrash, bulkDeleteFromTrash, bulkRestoreFromTrash, markAsRead, bulkMarkAsRead } from '../lib/api';
import type { Label } from '../types/label';
import { useToast } from '../contexts/ToastContext';
import { useLabels } from '../contexts/LabelContext';
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

type FolderType = 'inbox' | 'drafts' | 'spam' | 'trash';

interface DashboardPageProps {
    folderType?: FolderType;
}

export default function DashboardPage({ folderType = 'inbox' }: DashboardPageProps) {
    const { accountId } = useParams();
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const [selectedMail, setSelectedMail] = useState<Email | null>(null);
    const [mails, setMails] = useState<Email[]>([]);
    const [loading, setLoading] = useState(false);
    const [isComposeOpen, setIsComposeOpen] = useState(false);
    const [replyData, setReplyData] = useState<{ to: string; subject: string; body: string; configId: string; replyTo: string } | null>(null);
    const [activeTab, setActiveTab] = useState<string | null>(null);
    const [accounts, setAccounts] = useState<Account[]>([]);
    const [page, setPage] = useState(1);
    const [totalCount, setTotalCount] = useState(0);
    const pageSize = 20;
    const { labels } = useLabels();
    const [selectedLabelId, setSelectedLabelId] = useState<string | null>(null);
    const [searchQueryString, setSearchQueryString] = useState('');
    const [parsedSearchQuery, setParsedSearchQuery] = useState<SearchQuery>({ keywords: [] });
    const [emptyTrashLoading, setEmptyTrashLoading] = useState(false);
    const [selectedMessages, setSelectedMessages] = useState<Set<string>>(new Set());
    const [bulkActionLoading, setBulkActionLoading] = useState(false);
    const [lastSelectedIndex, setLastSelectedIndex] = useState<number | null>(null);
    const toast = useToast();

    // Get custom folder from URL params
    const customFolderPath = searchParams.get('folder');

    // Folder type title mapping
    const folderTitles: Record<FolderType, string> = {
        inbox: '受信トレイ',
        drafts: '下書き',
        spam: 'スパム',
        trash: 'ゴミ箱'
    };

    // Get display title (custom folder name or standard folder title)
    const displayTitle = customFolderPath
        ? customFolderPath.split('/').pop() || customFolderPath
        : folderTitles[folderType];

    // URLから検索条件とラベルフィルタを読み込む
    useEffect(() => {
        const searchFromUrl = searchParams.get('search') || '';
        const labelFromUrl = searchParams.get('label') || '';

        if (searchFromUrl) {
            setSearchQueryString(searchFromUrl);
            setParsedSearchQuery(parseSearchQuery(searchFromUrl));
        } else {
            setSearchQueryString('');
            setParsedSearchQuery({ keywords: [] });
        }

        if (labelFromUrl) {
            setSelectedLabelId(labelFromUrl);
        } else {
            setSelectedLabelId(null);
        }
    }, [searchParams]);

    // URLにmessageId/configIdがあれば自動でモーダルを開く
    useEffect(() => {
        const messageId = searchParams.get('messageId');
        const configId = searchParams.get('configId');
        if (messageId && configId) {
            setSelectedMail({ id: messageId, configId, from: '', subject: '', date: '', isRead: true });
        }
    }, [searchParams]);

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
        // Navigate to the correct folder type, preserving label parameter
        const basePath = folderType === 'inbox' ? '/inbox' : `/${folderType}`;
        const labelParam = searchParams.get('label');
        const queryString = labelParam ? `?label=${labelParam}` : '';

        if (id === 'all') {
            navigate(`${basePath}${queryString}`);
        } else {
            navigate(`${basePath}/${id}${queryString}`);
        }
    };

    // API function based on folder type
    const getFolderApi = useCallback((type: FolderType) => {
        switch (type) {
            case 'drafts':
                return getDrafts;
            case 'spam':
                return getSpam;
            case 'trash':
                return getTrash;
            default:
                return getInbox;
        }
    }, []);

    const loadInbox = useCallback(async () => {
        if (activeTab === null) return;

        setLoading(true);
        try {
            // Check if we're loading a custom folder
            if (customFolderPath) {
                if (activeTab === 'all') {
                    // 全アカウントから page*pageSize 件取得してフロントでマージ・ソート・スライス
                    const fetchSize = page * pageSize;
                    const promises = accounts.map(acc =>
                        getInboxFolder(acc.id, customFolderPath, 1, fetchSize).then(res => ({
                            messages: (res.messages || []).map((m: any) => ({ ...m, configId: acc.id })),
                            total: res.total || 0
                        })).catch(() => ({ messages: [], total: 0 }))
                    );
                    const results = await Promise.all(promises);
                    const allMails = results.flatMap(r => r.messages || []);
                    const total = results.reduce((sum, r) => sum + r.total, 0);
                    allMails.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
                    const start = (page - 1) * pageSize;
                    setMails(allMails.slice(start, start + pageSize));
                    setTotalCount(total);
                } else {
                    const data = await getInboxFolder(activeTab, customFolderPath, page);
                    const messagesWithConfig = (data.messages || []).map((m: any) => ({ ...m, configId: activeTab }));
                    setMails(messagesWithConfig);
                    setTotalCount(data.total || 0);
                }
            } else {
                const apiFunc = getFolderApi(folderType);

                if (activeTab === 'all') {
                    // 全アカウントから page*pageSize 件取得してフロントでマージ・ソート・スライス
                    const fetchSize = page * pageSize;
                    const promises = accounts.map(acc => apiFunc(acc.id, 1, fetchSize).then(res => ({
                        messages: (res.messages || []).map((m: any) => ({ ...m, configId: acc.id })),
                        total: res.total || 0
                    })));
                    const results = await Promise.all(promises);
                    const allMails = results.flatMap(r => r.messages || []);
                    const total = results.reduce((sum, r) => sum + r.total, 0);
                    allMails.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
                    const start = (page - 1) * pageSize;
                    setMails(allMails.slice(start, start + pageSize));
                    setTotalCount(total);
                } else {
                    const data = await apiFunc(activeTab, page);
                    // Inject configId for single tab too for consistency
                    const messagesWithConfig = (data.messages || []).map((m: any) => ({ ...m, configId: activeTab }));
                    setMails(messagesWithConfig);
                    setTotalCount(data.total || 0);
                }
            }
        } catch (error) {
            console.error(`Failed to load ${customFolderPath || folderType}`, error);
        } finally {
            setLoading(false);
        }
    }, [activeTab, page, accounts, folderType, getFolderApi, customFolderPath]);

    // Clear inbox and reset page on tab switch, folder type, or custom folder change
    useEffect(() => {
        setMails([]);
        setPage(1);
        setTotalCount(0);
    }, [activeTab, folderType, customFolderPath]);

    useEffect(() => {
        loadConfigs();
    }, []);

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
    const openMail = (mail: Email) => {
        setSelectedMail(mail);
        if (!mail.isRead) {
            setMails(prev => prev.map(m =>
                m.id === mail.id && m.configId === mail.configId ? { ...m, isRead: true } : m
            ));
            markAsRead(mail.configId, parseInt(mail.id)).catch(err =>
                console.error('Failed to mark as read:', err)
            );
        }
    };

    const handleSearch = (queryString: string) => {
        // 検索履歴に保存（空でない場合のみ）
        if (queryString.trim()) {
            addSearchHistory(queryString);
        }

        // URLパラメータを更新
        const newParams = new URLSearchParams(searchParams);
        if (queryString.trim()) {
            newParams.set('search', queryString);
        } else {
            newParams.delete('search');
        }
        setSearchParams(newParams);
    };

    // Handle empty trash
    const handleEmptyTrash = async () => {
        if (!activeTab || activeTab === 'all') {
            toast.warning('アカウントを選択してください');
            return;
        }
        if (!confirm('ゴミ箱のすべてのメールを完全に削除しますか？この操作は取り消せません。')) return;

        setEmptyTrashLoading(true);
        try {
            await emptyTrash(activeTab);
            toast.success('ゴミ箱を空にしました');
            loadInbox();
        } catch (error) {
            console.error('Failed to empty trash', error);
            toast.error('ゴミ箱を空にできませんでした');
        } finally {
            setEmptyTrashLoading(false);
        }
    };

    // Handle message selection with Shift/Ctrl support
    const toggleMessageSelection = (mailKey: string, index: number, e: React.MouseEvent) => {
        e.stopPropagation();

        // Shift+Click: Range selection
        if (e.shiftKey && lastSelectedIndex !== null) {
            const start = Math.min(lastSelectedIndex, index);
            const end = Math.max(lastSelectedIndex, index);
            const rangeKeys = filteredMails
                .slice(start, end + 1)
                .map(mail => `${mail.configId}::${mail.id}`);

            setSelectedMessages(prev => {
                const newSet = new Set(prev);
                rangeKeys.forEach(key => newSet.add(key));
                return newSet;
            });
            return;
        }

        // Ctrl+Click (or Cmd+Click on Mac): Toggle single item without clearing others
        if (e.ctrlKey || e.metaKey) {
            setSelectedMessages(prev => {
                const newSet = new Set(prev);
                if (newSet.has(mailKey)) {
                    newSet.delete(mailKey);
                } else {
                    newSet.add(mailKey);
                }
                return newSet;
            });
            setLastSelectedIndex(index);
            return;
        }

        // Normal click: Toggle selection (clear others if selecting)
        setSelectedMessages(prev => {
            const newSet = new Set(prev);
            if (newSet.has(mailKey)) {
                newSet.delete(mailKey);
            } else {
                newSet.add(mailKey);
            }
            return newSet;
        });
        setLastSelectedIndex(index);
    };

    const toggleSelectAll = () => {
        if (selectedMessages.size === filteredMails.length) {
            setSelectedMessages(new Set());
        } else {
            const allKeys = filteredMails.map(mail => `${mail.configId}::${mail.id}`);
            setSelectedMessages(new Set(allKeys));
        }
    };

    const clearSelection = () => {
        setSelectedMessages(new Set());
    };

    // Get selected messages grouped by configId
    const getSelectedMessagesByConfig = () => {
        const result: Map<string, number[]> = new Map();
        selectedMessages.forEach(key => {
            const [configId, messageId] = key.split('::');
            if (!result.has(configId)) {
                result.set(configId, []);
            }
            result.get(configId)!.push(parseInt(messageId));
        });
        return result;
    };

    // Get source folder name based on current view
    const getSourceFolderName = () => {
        if (customFolderPath) return customFolderPath;
        switch (folderType) {
            case 'drafts': return 'Drafts';
            case 'spam': return 'Spam';
            case 'trash': return 'Trash';
            default: return 'INBOX';
        }
    };

    // Bulk move to trash
    const handleBulkMoveToTrash = async () => {
        if (selectedMessages.size === 0) return;
        if (!confirm(`${selectedMessages.size}件のメールをゴミ箱に移動しますか？`)) return;

        setBulkActionLoading(true);
        try {
            const messagesByConfig = getSelectedMessagesByConfig();
            const sourceFolder = getSourceFolderName();
            for (const [configId, messageIds] of messagesByConfig) {
                await bulkMoveToTrash(configId, messageIds, sourceFolder);
            }
            toast.success(`${selectedMessages.size}件のメールをゴミ箱に移動しました`);
            clearSelection();
            loadInbox();
        } catch (error) {
            console.error('Failed to bulk move to trash', error);
            toast.error('ゴミ箱への移動に失敗しました');
        } finally {
            setBulkActionLoading(false);
        }
    };

    // Bulk delete from trash
    const handleBulkDeleteFromTrash = async () => {
        if (selectedMessages.size === 0) return;
        if (!confirm(`${selectedMessages.size}件のメールを完全に削除しますか？この操作は取り消せません。`)) return;

        setBulkActionLoading(true);
        try {
            const messagesByConfig = getSelectedMessagesByConfig();
            for (const [configId, messageIds] of messagesByConfig) {
                await bulkDeleteFromTrash(configId, messageIds);
            }
            toast.success(`${selectedMessages.size}件のメールを削除しました`);
            clearSelection();
            loadInbox();
        } catch (error) {
            console.error('Failed to bulk delete from trash', error);
            toast.error('削除に失敗しました');
        } finally {
            setBulkActionLoading(false);
        }
    };

    // Bulk restore from trash
    const handleBulkRestoreFromTrash = async () => {
        if (selectedMessages.size === 0) return;
        if (!confirm(`${selectedMessages.size}件のメールを復元しますか？`)) return;

        setBulkActionLoading(true);
        try {
            const messagesByConfig = getSelectedMessagesByConfig();
            for (const [configId, messageIds] of messagesByConfig) {
                await bulkRestoreFromTrash(configId, messageIds);
            }
            toast.success(`${selectedMessages.size}件のメールを復元しました`);
            clearSelection();
            loadInbox();
        } catch (error) {
            console.error('Failed to bulk restore from trash', error);
            toast.error('復元に失敗しました');
        } finally {
            setBulkActionLoading(false);
        }
    };

    // Bulk mark as read
    const handleBulkMarkAsRead = async () => {
        if (selectedMessages.size === 0) return;
        setBulkActionLoading(true);
        try {
            const messagesByConfig = getSelectedMessagesByConfig();
            for (const [configId, messageIds] of messagesByConfig) {
                await bulkMarkAsRead(configId, messageIds.map(String));
            }
            setMails(prev => prev.map(m => {
                const key = `${m.configId}::${m.id}`;
                return selectedMessages.has(key) ? { ...m, isRead: true } : m;
            }));
            toast.success(`${selectedMessages.size}件を既読にしました`);
            clearSelection();
        } catch (error) {
            console.error('Failed to bulk mark as read', error);
            toast.error('既読への変更に失敗しました');
        } finally {
            setBulkActionLoading(false);
        }
    };

    const handleReply = (data: { to: string; subject: string; body: string; configId: string; replyTo: string }) => {
        setSelectedMail(null);
        setReplyData(data);
        setIsComposeOpen(true);
    };

    const handleFilterByAddress = (address: string) => {
        const params = new URLSearchParams(searchParams);
        params.set('search', `from:${address}`);
        setSearchParams(params);
        setSelectedMail(null);
    };

    const handleSendMail = async (to: string, subject: string, body: string, configId: string, cc?: string, bcc?: string, replyTo?: string) => {
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
                cc: cc ?? '',
                bcc: bcc ?? '',
                replyTo: replyTo ?? '',
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
        <div className="p-3 md:p-8">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-4 gap-3">
                <h1 className="text-xl md:text-2xl font-bold">{displayTitle}</h1>
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
                    {folderType === 'trash' && (
                        <button
                            onClick={handleEmptyTrash}
                            disabled={emptyTrashLoading || mails.length === 0}
                            className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 shadow-sm font-medium flex items-center justify-center gap-2 flex-1 md:flex-none disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                            </svg>
                            {emptyTrashLoading ? '削除中...' : 'ゴミ箱を空にする'}
                        </button>
                    )}
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
                <SearchBar
                    onSearch={handleSearch}
                    placeholder="送信者、件名で検索..."
                    mails={mails}
                    labels={labels}
                    initialValue={searchQueryString}
                />
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

            {/* Bulk Action Toolbar */}
            {selectedMessages.size > 0 && (
                <div className="bg-brand-50 border border-brand-200 rounded-lg p-3 mb-4 flex flex-wrap items-center gap-3">
                    <span className="text-sm font-medium text-brand-700">
                        {selectedMessages.size}件選択中
                    </span>
                    <div className="flex gap-2 flex-wrap">
                        <button
                            onClick={handleBulkMarkAsRead}
                            disabled={bulkActionLoading}
                            className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 9v.906a2.25 2.25 0 01-1.183 1.981l-6.478 3.488M2.25 9v.906a2.25 2.25 0 001.183 1.981l6.478 3.488m8.839 2.51l-4.66-2.51m0 0l-1.023-.55a2.25 2.25 0 00-2.134 0l-1.022.55m0 0l-4.661 2.51m16.5 1.615a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V8.844a2.25 2.25 0 011.183-1.981l7.5-4.039a2.25 2.25 0 012.134 0l7.5 4.039a2.25 2.25 0 011.183 1.98V19.5z" />
                            </svg>
                            既読にする
                        </button>
                        {folderType === 'trash' ? (
                            <>
                                <button
                                    onClick={handleBulkRestoreFromTrash}
                                    disabled={bulkActionLoading}
                                    className="px-3 py-1.5 text-sm bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 flex items-center gap-1"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" />
                                    </svg>
                                    復元
                                </button>
                                <button
                                    onClick={handleBulkDeleteFromTrash}
                                    disabled={bulkActionLoading}
                                    className="px-3 py-1.5 text-sm bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50 flex items-center gap-1"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                                    </svg>
                                    完全に削除
                                </button>
                            </>
                        ) : (
                            <button
                                onClick={handleBulkMoveToTrash}
                                disabled={bulkActionLoading}
                                className="px-3 py-1.5 text-sm bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50 flex items-center gap-1"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                                </svg>
                                ゴミ箱に移動
                            </button>
                        )}
                        <button
                            onClick={clearSelection}
                            className="px-3 py-1.5 text-sm bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300"
                        >
                            選択解除
                        </button>
                    </div>
                </div>
            )}

            {/* Pagination (Top) */}
            {totalCount > 0 && (
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-2 px-2">
                    <div className="text-sm text-gray-600">
                        {totalCount}件中 {Math.min((page - 1) * pageSize + 1, totalCount)}〜{Math.min(page * pageSize, totalCount)}件を表示
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => setPage(1)}
                            disabled={page === 1 || loading}
                            className="px-3 py-1.5 text-sm border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                            title="最初のページ"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M18.75 19.5l-7.5-7.5 7.5-7.5m-6 15L5.25 12l7.5-7.5" />
                            </svg>
                        </button>
                        <button
                            onClick={() => setPage(p => Math.max(1, p - 1))}
                            disabled={page === 1 || loading}
                            className="px-3 py-1.5 text-sm border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            前へ
                        </button>
                        <span className="px-3 py-1.5 text-sm text-gray-700">
                            {page} / {Math.ceil(totalCount / pageSize)}
                        </span>
                        <button
                            onClick={() => setPage(p => Math.min(Math.ceil(totalCount / pageSize), p + 1))}
                            disabled={page >= Math.ceil(totalCount / pageSize) || loading}
                            className="px-3 py-1.5 text-sm border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            次へ
                        </button>
                        <button
                            onClick={() => setPage(Math.ceil(totalCount / pageSize))}
                            disabled={page >= Math.ceil(totalCount / pageSize) || loading}
                            className="px-3 py-1.5 text-sm border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                            title="最後のページ"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 4.5l7.5 7.5-7.5 7.5m6-15l7.5 7.5-7.5 7.5" />
                            </svg>
                        </button>
                    </div>
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
                                : folderType === 'drafts'
                                    ? '下書きはありません。'
                                    : folderType === 'spam'
                                        ? 'スパムはありません。'
                                        : folderType === 'trash'
                                            ? 'ゴミ箱は空です。'
                                            : 'メールはありません。'}
                    </div>
                ) : (
                    <>
                        {/* Mobile View (Cards) */}
                        <div className="block md:hidden divide-y divide-gray-100">
                            {filteredMails.map((mail, index) => {
                                const mailKey = `${mail.configId}::${mail.id}`;
                                const isSelected = selectedMessages.has(mailKey);
                                return (
                                    <div
                                        key={`mobile-${mailKey}`}
                                        className={`py-3 px-3 active:bg-gray-100 cursor-pointer flex gap-3 ${!mail.isRead ? 'bg-blue-50 border-l-4 border-l-blue-500' : 'border-l-4 border-l-transparent'} ${isSelected ? 'bg-brand-50' : ''}`}
                                    >
                                        <div
                                            className="flex items-center justify-center w-10 h-10 shrink-0"
                                            onClick={(e) => toggleMessageSelection(mailKey, index, e)}
                                        >
                                            <input
                                                type="checkbox"
                                                checked={isSelected}
                                                onChange={() => {}}
                                                className="w-5 h-5 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                                            />
                                        </div>
                                        <div className="flex-1 min-w-0" onClick={() => openMail(mail)}>
                                            <div className="flex justify-between items-baseline mb-0.5">
                                                <div className={`text-sm truncate flex-1 pr-2 ${!mail.isRead ? 'font-bold text-gray-950' : 'font-medium text-gray-700'}`}>{mail.from}</div>
                                                <div className="text-xs text-gray-400 whitespace-nowrap shrink-0">
                                                    {new Date(mail.date).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' })}
                                                </div>
                                            </div>
                                            <div className={`text-sm mb-0.5 truncate ${!mail.isRead ? 'font-semibold text-gray-900' : 'text-gray-700'}`}>{mail.subject || '(件名なし)'}</div>
                                            {mail.labels && mail.labels.length > 0 && (
                                                <div className="flex flex-wrap gap-1 mt-1">
                                                    {mail.labels.map(label => (
                                                        <LabelBadge key={label.id} label={label} />
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        {/* Desktop View (Table) */}
                        <table className="hidden md:table w-full table-fixed">
                            <thead className="bg-gray-50/50 border-b border-gray-100">
                                <tr>
                                    <th className="w-12 p-4">
                                        <input
                                            type="checkbox"
                                            checked={selectedMessages.size === filteredMails.length && filteredMails.length > 0}
                                            onChange={toggleSelectAll}
                                            className="w-4 h-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                                        />
                                    </th>
                                    <th className="text-left p-4 font-medium text-gray-500 text-sm w-1/4">送信者</th>
                                    <th className="text-left p-4 font-medium text-gray-500 text-sm w-1/2">件名</th>
                                    <th className="text-right p-4 font-medium text-gray-500 text-sm w-1/4">日時</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                                {filteredMails.map((mail, index) => {
                                    const mailKey = `${mail.configId}::${mail.id}`;
                                    const isSelected = selectedMessages.has(mailKey);
                                    return (
                                        <tr
                                            key={mailKey}
                                            className={`hover:bg-gray-50 cursor-pointer transition-colors ${!mail.isRead ? 'font-semibold bg-blue-50 border-l-4 border-l-blue-500' : 'border-l-4 border-l-transparent'} ${isSelected ? 'bg-brand-50' : ''}`}
                                        >
                                            <td className="p-4" onClick={(e) => toggleMessageSelection(mailKey, index, e)}>
                                                <input
                                                    type="checkbox"
                                                    checked={isSelected}
                                                    onChange={() => {}}
                                                    className="w-4 h-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                                                />
                                            </td>
                                            <td className={`p-4 truncate ${!mail.isRead ? 'text-gray-950 font-bold' : 'text-gray-900'}`} title={mail.from} onClick={() => openMail(mail)}>{mail.from}</td>
                                            <td className="p-4" onClick={() => openMail(mail)}>
                                                <div className="flex flex-col gap-1">
                                                    <span className={`truncate ${!mail.isRead ? 'text-gray-950' : 'text-gray-900'}`}>{mail.subject || '(件名なし)'}</span>
                                                    {mail.labels && mail.labels.length > 0 && (
                                                        <div className="flex flex-wrap gap-1">
                                                            {mail.labels.map(label => (
                                                                <LabelBadge key={label.id} label={label} />
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="p-4 text-right text-gray-500 text-sm whitespace-nowrap" onClick={() => openMail(mail)}>
                                                {new Date(mail.date).toLocaleString()}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </>
                )}
            </div>

            {/* Pagination */}
            {totalCount > 0 && (
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mt-4 px-2">
                    <div className="text-sm text-gray-600">
                        {totalCount}件中 {Math.min((page - 1) * pageSize + 1, totalCount)}〜{Math.min(page * pageSize, totalCount)}件を表示
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => setPage(1)}
                            disabled={page === 1 || loading}
                            className="px-3 py-1.5 text-sm border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                            title="最初のページ"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M18.75 19.5l-7.5-7.5 7.5-7.5m-6 15L5.25 12l7.5-7.5" />
                            </svg>
                        </button>
                        <button
                            onClick={() => setPage(p => Math.max(1, p - 1))}
                            disabled={page === 1 || loading}
                            className="px-3 py-1.5 text-sm border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            前へ
                        </button>
                        <span className="px-3 py-1.5 text-sm text-gray-700">
                            {page} / {Math.ceil(totalCount / pageSize)}
                        </span>
                        <button
                            onClick={() => setPage(p => Math.min(Math.ceil(totalCount / pageSize), p + 1))}
                            disabled={page >= Math.ceil(totalCount / pageSize) || loading}
                            className="px-3 py-1.5 text-sm border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            次へ
                        </button>
                        <button
                            onClick={() => setPage(Math.ceil(totalCount / pageSize))}
                            disabled={page >= Math.ceil(totalCount / pageSize) || loading}
                            className="px-3 py-1.5 text-sm border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                            title="最後のページ"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 4.5l7.5 7.5-7.5 7.5m6-15l7.5 7.5-7.5 7.5" />
                            </svg>
                        </button>
                    </div>
                </div>
            )}

            <ComposeModal
                isOpen={isComposeOpen}
                onClose={() => {
                    setIsComposeOpen(false);
                    setReplyData(null);
                }}
                onSend={handleSendMail}
                accounts={accounts}
                initialTo={replyData?.to ?? ''}
                initialSubject={replyData?.subject ?? ''}
                initialBody={replyData?.body ?? ''}
                initialConfigId={replyData?.configId}
                initialReplyTo={replyData?.replyTo ?? ''}
            />

            {selectedMail && (
                <MailDetailModal
                    isOpen={!!selectedMail}
                    onClose={() => {
                        setSelectedMail(null);
                        setSearchParams(prev => {
                            prev.delete('messageId');
                            prev.delete('configId');
                            return prev;
                        });
                    }}
                    configId={selectedMail.configId}
                    messageId={parseInt(selectedMail.id)}
                    folderType={folderType}
                    onMessageDeleted={loadInbox}
                    onReply={handleReply}
                    onFilterByAddress={handleFilterByAddress}
                />
            )}
        </div>
    );
}
