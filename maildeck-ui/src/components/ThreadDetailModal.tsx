import { useEffect, useState } from 'react';
import { getMessage, getThreadMessages, moveToTrash } from '../lib/api';
import { useModalClose } from '../hooks/useModalClose';
import EnhancedMailContent from './EnhancedMailContent';
import { useToast } from '../contexts/ToastContext';

interface ReplyData {
    to: string;
    subject: string;
    body: string;
    configId: string;
    replyTo: string;
}

interface ThreadDetailModalProps {
    isOpen: boolean;
    onClose: () => void;
    configId: string;
    threadKey: string;
    threadSubject: string;
    onReply?: (replyData: ReplyData) => void;
    onMessageDeleted?: () => void;
    initialMessageId?: number;
}

interface ThreadMessageSummary {
    id: number;
    subject: string;
    from: string;
    to: string;
    cc: string;
    date: string;
    isRead: boolean;
    messageId?: string;
    inReplyTo?: string;
    threadKey: string;
}

interface MessageDetail {
    id: string;
    subject: string;
    from: string;
    to: string;
    cc: string;
    date: string;
    bodyHtml?: string;
    bodyText?: string;
}

function formatSender(from: string): string {
    const match = from.match(/^"?([^"<]+)"?\s*</);
    if (match) return match[1].trim();
    const addrMatch = from.match(/<(.+?)>/);
    if (addrMatch) return addrMatch[1];
    return from.trim();
}

export default function ThreadDetailModal({
    isOpen,
    onClose,
    configId,
    threadKey,
    threadSubject,
    onReply,
    onMessageDeleted,
    initialMessageId,
}: ThreadDetailModalProps) {
    const [messages, setMessages] = useState<ThreadMessageSummary[]>([]);
    const [loading, setLoading] = useState(true);
    const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
    const [loadedDetails, setLoadedDetails] = useState<Map<number, MessageDetail>>(new Map());
    const [loadingIds, setLoadingIds] = useState<Set<number>>(new Set());
    const { modalContentRef, handleBackdropClick } = useModalClose(isOpen, onClose);
    const toast = useToast();

    useEffect(() => {
        if (!isOpen) {
            setMessages([]);
            setExpandedIds(new Set());
            setLoadedDetails(new Map());
            return;
        }

        const load = async () => {
            setLoading(true);
            try {
                const data: ThreadMessageSummary[] = await getThreadMessages(configId, threadKey);
                setMessages(data);

                // Auto-expand: initial message if given, otherwise the latest
                const targetId = initialMessageId ?? (data.length > 0 ? data[data.length - 1].id : undefined);
                if (targetId !== undefined) {
                    setExpandedIds(new Set([targetId]));
                    loadMessageDetail(targetId);
                }
            } catch {
                toast.error('スレッドの読み込みに失敗しました');
            } finally {
                setLoading(false);
            }
        };

        load();
    }, [isOpen, configId, threadKey]);

    const loadMessageDetail = async (id: number) => {
        if (loadedDetails.has(id) || loadingIds.has(id)) return;
        setLoadingIds(prev => new Set(prev).add(id));
        try {
            const detail = await getMessage(configId, id);
            setLoadedDetails(prev => new Map(prev).set(id, detail));
        } catch {
            toast.error('メッセージの読み込みに失敗しました');
        } finally {
            setLoadingIds(prev => {
                const next = new Set(prev);
                next.delete(id);
                return next;
            });
        }
    };

    const toggleExpand = (id: number) => {
        setExpandedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
                loadMessageDetail(id);
            }
            return next;
        });
    };

    const handleReply = (msg: ThreadMessageSummary) => {
        if (!onReply) return;
        const detail = loadedDetails.get(msg.id);

        const replySubject = msg.subject.startsWith('Re: ') ? msg.subject : `Re: ${msg.subject}`;
        const fromMatch = msg.from.match(/<(.+?)>/);
        const toAddress = fromMatch ? fromMatch[1] : msg.from.trim();
        const dateStr = new Date(msg.date).toLocaleString('ja-JP');
        const bodyText = detail?.bodyText ?? '';
        const quotedBody = [
            '',
            `--- ${dateStr} ${msg.from} の返信 ---`,
            bodyText ? bodyText.split('\n').map(line => `> ${line}`).join('\n') : '（本文なし）'
        ].join('\n');

        onReply({ to: toAddress, subject: replySubject, body: quotedBody, configId, replyTo: msg.from });
        onClose();
    };

    const handleMoveToTrash = async (id: number) => {
        if (!confirm('このメールをゴミ箱に移動しますか？')) return;
        try {
            await moveToTrash(configId, id);
            setMessages(prev => prev.filter(m => m.id !== id));
            toast.success('ゴミ箱に移動しました');
            onMessageDeleted?.();
            if (messages.length <= 1) onClose();
        } catch {
            toast.error('ゴミ箱への移動に失敗しました');
        }
    };

    if (!isOpen) return null;

    const unreadCount = messages.filter(m => !m.isRead).length;
    const participants = [...new Set(messages.map(m => formatSender(m.from)))];

    return (
        <div
            className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/50 p-0 md:p-4"
            onClick={handleBackdropClick}
        >
            <div
                ref={modalContentRef}
                className="bg-white md:rounded-lg shadow-xl w-full max-w-4xl h-[95dvh] md:h-auto md:max-h-[90vh] flex flex-col rounded-t-2xl md:rounded-lg"
            >
                {/* Header */}
                <div className="px-3 py-3 md:p-4 border-b border-gray-100 flex justify-between items-start shrink-0">
                    <div className="flex-1 min-w-0 pr-2">
                        <h2 className="text-base md:text-lg font-semibold truncate">{threadSubject || '(件名なし)'}</h2>
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                            <span className="text-xs text-gray-500">
                                {participants.slice(0, 3).join(', ')}{participants.length > 3 ? ` 他${participants.length - 3}人` : ''}
                            </span>
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                                {messages.length}件
                            </span>
                            {unreadCount > 0 && (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
                                    未読 {unreadCount}件
                                </span>
                            )}
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="text-gray-400 hover:text-gray-600 p-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center shrink-0"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* Thread messages */}
                <div className="overflow-y-auto flex-1 divide-y divide-gray-100">
                    {loading ? (
                        <div className="flex justify-center items-center h-40 text-gray-500">読み込み中...</div>
                    ) : messages.length === 0 ? (
                        <div className="flex justify-center items-center h-40 text-gray-500">メッセージが見つかりません</div>
                    ) : (
                        messages.map((msg, index) => {
                            const isExpanded = expandedIds.has(msg.id);
                            const detail = loadedDetails.get(msg.id);
                            const isLoadingDetail = loadingIds.has(msg.id);
                            const isLatest = index === messages.length - 1;

                            return (
                                <div
                                    key={msg.id}
                                    className={`transition-colors ${!msg.isRead ? 'bg-blue-50' : 'bg-white'}`}
                                >
                                    {/* Message header (always visible) */}
                                    <div
                                        className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50 transition-colors"
                                        onClick={() => toggleExpand(msg.id)}
                                    >
                                        {/* Avatar */}
                                        <div className="w-8 h-8 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center text-sm font-semibold shrink-0">
                                            {formatSender(msg.from).charAt(0).toUpperCase()}
                                        </div>

                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-baseline justify-between gap-2">
                                                <span className={`text-sm truncate ${!msg.isRead ? 'font-bold text-gray-900' : 'font-medium text-gray-700'}`}>
                                                    {formatSender(msg.from)}
                                                </span>
                                                <span className="text-xs text-gray-400 whitespace-nowrap shrink-0">
                                                    {new Date(msg.date).toLocaleString('ja-JP', {
                                                        month: 'numeric', day: 'numeric',
                                                        hour: '2-digit', minute: '2-digit'
                                                    })}
                                                </span>
                                            </div>
                                            {!isExpanded && (
                                                <p className="text-xs text-gray-400 truncate mt-0.5">
                                                    {isLatest ? '最新のメッセージ' : msg.subject !== threadSubject ? msg.subject : 'クリックして展開'}
                                                </p>
                                            )}
                                        </div>

                                        <svg
                                            xmlns="http://www.w3.org/2000/svg"
                                            fill="none"
                                            viewBox="0 0 24 24"
                                            strokeWidth={1.5}
                                            stroke="currentColor"
                                            className={`w-4 h-4 text-gray-400 shrink-0 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                                        >
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                                        </svg>
                                    </div>

                                    {/* Expanded message content */}
                                    {isExpanded && (
                                        <div className="px-4 pb-4">
                                            {/* Metadata */}
                                            <div className="mb-3 p-3 bg-gray-50 rounded-lg text-xs text-gray-600 space-y-1">
                                                <div className="grid grid-cols-[auto,1fr] gap-x-2">
                                                    <span className="font-medium">From:</span>
                                                    <span className="break-all">{msg.from}</span>
                                                    <span className="font-medium">To:</span>
                                                    <span className="break-all">{msg.to}</span>
                                                    {msg.cc && (
                                                        <>
                                                            <span className="font-medium">Cc:</span>
                                                            <span className="break-all">{msg.cc}</span>
                                                        </>
                                                    )}
                                                    <span className="font-medium">Date:</span>
                                                    <span>{new Date(msg.date).toLocaleString('ja-JP')}</span>
                                                </div>
                                            </div>

                                            {/* Body */}
                                            {isLoadingDetail ? (
                                                <div className="text-center py-8 text-gray-400 text-sm">読み込み中...</div>
                                            ) : detail ? (
                                                <div className="prose max-w-none min-w-0 overflow-x-hidden break-words">
                                                    <EnhancedMailContent
                                                        content={detail.bodyHtml || detail.bodyText || ''}
                                                        isHtml={!!detail.bodyHtml}
                                                        patterns={[]}
                                                        emailContext={{ from: msg.from, subject: msg.subject, body: detail.bodyText ?? '' }}
                                                        onCopy={() => {}}
                                                    />
                                                </div>
                                            ) : (
                                                <div className="text-center py-8 text-gray-400 text-sm">本文を読み込めませんでした</div>
                                            )}

                                            {/* Action buttons */}
                                            <div className="mt-4 flex items-center gap-2 pt-3 border-t border-gray-100">
                                                {onReply && (
                                                    <button
                                                        onClick={() => handleReply(msg)}
                                                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                                                    >
                                                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                                                            <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                                                        </svg>
                                                        返信
                                                    </button>
                                                )}
                                                <button
                                                    onClick={() => handleMoveToTrash(msg.id)}
                                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-500 bg-white border border-gray-300 rounded-lg hover:bg-red-50 hover:text-red-600 hover:border-red-300 transition-colors"
                                                >
                                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                                                    </svg>
                                                    ゴミ箱
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })
                    )}
                </div>
            </div>
        </div>
    );
}
