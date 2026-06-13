import { useEffect, useMemo, useState } from 'react';
import { getMessage, getLabelsForMessage, addLabelToMessage, removeLabelFromMessage, createLabel, getCustomActionPatterns, moveToTrash, deleteFromTrash, restoreFromTrash, sendMail, downloadAttachment } from '../lib/api';
import { useModalClose } from '../hooks/useModalClose';
import { useTranslation } from '../hooks/useTranslation';
import type { Label } from '../types/label';
import type { CustomActionPattern } from '../types/customAction';
import LabelSelector from './LabelSelector';
import LabelModal from './LabelModal';
import EnhancedMailContent from './EnhancedMailContent';
import TranslatorApiGuideModal from './TranslatorApiGuideModal';
import { useToast } from '../contexts/ToastContext';
import { useLabels } from '../contexts/LabelContext';

type FolderType = 'inbox' | 'drafts' | 'spam' | 'trash';

interface ReplyData {
    to: string;
    subject: string;
    body: string;
    configId: string;
    replyTo: string;
}

interface ForwardData {
    to: string;
    subject: string;
    body: string;
    configId: string;
}

interface MailDetailModalProps {
    isOpen: boolean;
    onClose: () => void;
    configId: string;
    messageId: number;
    folderType?: FolderType;
    onMessageDeleted?: () => void;
    onReply?: (replyData: ReplyData) => void;
    onForward?: (forwardData: ForwardData) => void;
    onFilterByAddress?: (address: string) => void;
}

interface AttachmentInfo {
    partIndex: number;
    fileName: string;
    contentType: string;
    sizeBytes: number;
}

interface MessageDetail {
    id: string;
    subject: string;
    from: string;
    to: string;
    cc: string;
    date: string;
    bodyHtml: string;
    bodyText: string;
    listUnsubscribeUrl?: string;
    listUnsubscribeMailto?: string;
    listUnsubscribeOneClick?: boolean;
    attachments?: AttachmentInfo[];
}

function extractEmailAddresses(str: string): { display: string; email: string }[] {
    const parts = str.split(/,\s*/);
    return parts.map(part => {
        const match = part.match(/<(.+?)>/);
        const email = match ? match[1].trim() : part.trim();
        return { display: part.trim(), email };
    }).filter(p => p.email.includes('@'));
}

export default function MailDetailModal({ isOpen, onClose, configId, messageId, folderType = 'inbox', onMessageDeleted, onReply, onForward, onFilterByAddress }: MailDetailModalProps) {
    const [loading, setLoading] = useState(true);
    const [message, setMessage] = useState<MessageDetail | null>(null);
    const [showImages, setShowImages] = useState(false);
    const [hasBlockedImages, setHasBlockedImages] = useState(false);
    const [actionLoading, setActionLoading] = useState(false);
    const [downloadingIndex, setDownloadingIndex] = useState<number | null>(null);
    const { modalContentRef, handleBackdropClick } = useModalClose(isOpen, onClose);
    const toast = useToast();
    const { labels: allLabels, reloadLabels } = useLabels();

    // Label-related state
    const [messageLabels, setMessageLabels] = useState<Label[]>([]);
    const [isLabelModalOpen, setIsLabelModalOpen] = useState(false);

    // Custom action patterns state
    const [patterns, setPatterns] = useState<CustomActionPattern[]>([]);
    const [showCustomActions, setShowCustomActions] = useState(true);

    // Translation state
    const { translate, isTranslating, chromeApiStatus, downloadProgress, error: translationError } = useTranslation();
    const [translatedContent, setTranslatedContent] = useState<string | null>(null);
    const [showTranslation, setShowTranslation] = useState(false);
    const [showApiGuide, setShowApiGuide] = useState(false);

    // Check if HTML has external images
    const checkForImages = useMemo(() => {
        if (!message?.bodyHtml) return false;

        const parser = new DOMParser();
        const doc = parser.parseFromString(message.bodyHtml, 'text/html');
        const images = doc.querySelectorAll('img');

        for (const img of images) {
            const src = img.getAttribute('src');
            if (src && (src.startsWith('http') || src.startsWith('//'))) {
                return true;
            }
        }
        return false;
    }, [message?.bodyHtml]);

    // Process HTML to safe render
    const processedHtml = useMemo(() => {
        if (!message?.bodyHtml) return '';

        const parser = new DOMParser();
        const doc = parser.parseFromString(message.bodyHtml, 'text/html');

        // Process images
        const images = doc.querySelectorAll('img');
        images.forEach(img => {
            const src = img.getAttribute('src');
            if (src && (src.startsWith('http') || src.startsWith('//'))) {
                if (!showImages) {
                    // Remove src to prevent loading
                    img.removeAttribute('src');
                    img.setAttribute('data-original-src', src);
                    img.setAttribute('alt', '[画像がブロックされました]');
                    img.style.maxWidth = '100px';
                    img.style.minHeight = '100px';
                    img.style.border = '1px dashed #ccc';
                    img.style.padding = '10px';
                    img.style.backgroundColor = '#f5f5f5';
                } else {
                    // Restore original src when showing images
                    const originalSrc = img.getAttribute('data-original-src');
                    if (originalSrc) {
                        img.setAttribute('src', originalSrc);
                    }
                }
            }
        });

        // Process links
        const links = doc.querySelectorAll('a');
        links.forEach(link => {
            link.setAttribute('target', '_blank');
            link.setAttribute('rel', 'noopener noreferrer');
        });

        return `<!DOCTYPE html>${doc.documentElement.outerHTML}`;
    }, [message?.bodyHtml, showImages]);

    // Update hasBlockedImages state based on checkForImages
    useEffect(() => {
        if (!showImages) {
            setHasBlockedImages(checkForImages);
        } else {
            setHasBlockedImages(false);
        }
    }, [checkForImages, showImages]);


    // Fetch custom action patterns once when modal opens
    useEffect(() => {
        if (!isOpen) return;
        const fetchPatterns = async () => {
            try {
                const data = await getCustomActionPatterns();
                setPatterns(data.filter((p: CustomActionPattern) => p.isEnabled));
            } catch (err) {
                console.error('Failed to fetch custom action patterns', err);
            }
        };
        fetchPatterns();
    }, [isOpen]);

    // Fetch message and its labels
    useEffect(() => {
        setShowImages(false);
        setHasBlockedImages(false);
        if (!isOpen || !messageId) {
            setMessage(null);
            setMessageLabels([]);
            return;
        }

        const fetchMessage = async () => {
            setLoading(true);
            try {
                const data = await getMessage(configId, messageId);
                setMessage(data);
            } catch (err) {
                console.error('Failed to fetch message', err);
                toast.error('メッセージの取得に失敗しました');
            } finally {
                setLoading(false);
            }
        };

        const fetchMessageLabels = async () => {
            try {
                const labels = await getLabelsForMessage(messageId, configId);
                setMessageLabels(labels);
            } catch (err) {
                console.error('Failed to fetch message labels', err);
            }
        };

        fetchMessage();
        fetchMessageLabels();
    }, [isOpen, configId, messageId]);

    // Handle add label
    const handleAddLabel = async (labelId: string) => {
        try {
            await addLabelToMessage(messageId, labelId, configId);
            // Update local state
            const newLabel = allLabels.find(l => l.id === labelId);
            if (newLabel) {
                setMessageLabels([...messageLabels, newLabel]);
            }
            toast.success('ラベルを追加しました');
        } catch (err) {
            console.error('Failed to add label', err);
            toast.error('ラベルの追加に失敗しました');
        }
    };

    // Handle remove label
    const handleRemoveLabel = async (labelId: string) => {
        try {
            await removeLabelFromMessage(messageId, labelId, configId);
            // Update local state
            setMessageLabels(messageLabels.filter(l => l.id !== labelId));
            toast.success('ラベルを削除しました');
        } catch (err) {
            console.error('Failed to remove label', err);
            toast.error('ラベルの削除に失敗しました');
        }
    };

    // Handle create new label
    const handleCreateLabel = async (name: string, color: string) => {
        try {
            const newLabel = await createLabel(name, color);
            await reloadLabels();
            // 作成したラベルを自動的にメッセージに追加
            await addLabelToMessage(messageId, newLabel.id, configId);
            setMessageLabels([...messageLabels, newLabel]);
            toast.success('ラベルを作成して追加しました');
        } catch (err) {
            console.error('Failed to create label', err);
            toast.error('ラベルの作成に失敗しました');
        }
    };

    // Handle move to trash
    const handleMoveToTrash = async () => {
        if (!confirm('このメールをゴミ箱に移動しますか？')) return;
        setActionLoading(true);
        try {
            await moveToTrash(configId, messageId);
            toast.success('ゴミ箱に移動しました');
            onMessageDeleted?.();
            onClose();
        } catch (err) {
            console.error('Failed to move to trash', err);
            toast.error('ゴミ箱への移動に失敗しました');
        } finally {
            setActionLoading(false);
        }
    };

    // Handle permanent delete from trash
    const handleDeletePermanently = async () => {
        if (!confirm('このメールを完全に削除しますか？この操作は取り消せません。')) return;
        setActionLoading(true);
        try {
            await deleteFromTrash(configId, messageId);
            toast.success('完全に削除しました');
            onMessageDeleted?.();
            onClose();
        } catch (err) {
            console.error('Failed to delete permanently', err);
            toast.error('削除に失敗しました');
        } finally {
            setActionLoading(false);
        }
    };

    // Handle restore from trash
    const handleRestore = async () => {
        setActionLoading(true);
        try {
            await restoreFromTrash(configId, messageId);
            toast.success('受信トレイに復元しました');
            onMessageDeleted?.();
            onClose();
        } catch (err) {
            console.error('Failed to restore', err);
            toast.error('復元に失敗しました');
        } finally {
            setActionLoading(false);
        }
    };

    // Handle attachment download
    const handleDownloadAttachment = async (partIndex: number, fileName: string) => {
        setDownloadingIndex(partIndex);
        try {
            await downloadAttachment(configId, messageId, partIndex, fileName);
        } catch (err) {
            console.error('Download failed', err);
            toast.error('ダウンロードに失敗しました: ' + (err instanceof Error ? err.message : String(err)));
        } finally {
            setDownloadingIndex(null);
        }
    };

    // Handle reply
    const handleReply = () => {
        if (!message || !onReply) return;

        const replySubject = message.subject.startsWith('Re: ')
            ? message.subject
            : `Re: ${message.subject}`;

        const fromMatch = message.from.match(/<(.+?)>/);
        const toAddress = fromMatch ? fromMatch[1] : message.from.trim();

        const dateStr = new Date(message.date).toLocaleString('ja-JP');
        const quotedBody = [
            '',
            `--- ${dateStr} ${message.from} の返信 ---`,
            message.bodyText
                ? message.bodyText.split('\n').map(line => `> ${line}`).join('\n')
                : '（本文なし）'
        ].join('\n');

        onReply({ to: toAddress, subject: replySubject, body: quotedBody, configId, replyTo: message.from });
    };

    // Handle forward
    const handleForward = () => {
        if (!message || !onForward) return;

        const fwdSubject = message.subject.startsWith('Fwd: ')
            ? message.subject
            : `Fwd: ${message.subject}`;

        const dateStr = new Date(message.date).toLocaleString('ja-JP');
        const quotedBody = [
            '',
            `--- 転送メッセージ ---`,
            `From: ${message.from}`,
            `Date: ${dateStr}`,
            `Subject: ${message.subject}`,
            `To: ${message.to}`,
            '',
            message.bodyText || '（本文なし）'
        ].join('\n');

        onForward({ to: '', subject: fwdSubject, body: quotedBody, configId });
    };

    // Handle unsubscribe
    const handleUnsubscribe = async () => {
        if (!message) return;
        if (!confirm('このメールマガジンの登録を解除しますか？')) return;

        if (message.listUnsubscribeUrl) {
            window.open(message.listUnsubscribeUrl, '_blank', 'noopener,noreferrer');
            return;
        }

        if (message.listUnsubscribeMailto) {
            try {
                const url = new URL(message.listUnsubscribeMailto);
                const to = url.pathname;
                const subject = url.searchParams.get('subject') ?? 'unsubscribe';
                await sendMail({ configId, to, subject, body: '' });
                toast.success('登録解除メールを送信しました');
            } catch {
                toast.error('登録解除メールの送信に失敗しました');
            }
        }
    };

    // Translate HTML while preserving structure
    const translateHtmlContent = async (html: string, translateFn: (text: string) => Promise<string>): Promise<string> => {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');

        // 翻訳をスキップするタグ
        const SKIP_TAGS = new Set(['STYLE', 'SCRIPT', 'NOSCRIPT', 'CODE', 'PRE', 'HEAD']);

        // Collect all text nodes (style/script/code/pre を除外)
        const textNodes: { node: Text; text: string }[] = [];
        const walker = document.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT, null);
        let node: Text | null;
        while ((node = walker.nextNode() as Text | null)) {
            const text = node.textContent?.trim();
            if (!text || text.length === 0) continue;
            // 祖先に SKIP_TAGS が含まれる場合はスキップ
            let ancestor = node.parentElement;
            let skip = false;
            while (ancestor) {
                if (SKIP_TAGS.has(ancestor.tagName)) { skip = true; break; }
                ancestor = ancestor.parentElement;
            }
            if (!skip) textNodes.push({ node, text });
        }

        if (textNodes.length === 0) {
            return html;
        }

        // テキストノードを1件ずつ翻訳（セパレータ混入を防ぐ）
        for (const item of textNodes) {
            item.node.textContent = await translateFn(item.text);
        }

        return `<!DOCTYPE html>${doc.documentElement.outerHTML}`;
    };

    // Handle translation
    const handleTranslate = async () => {
        if (!message) return;

        // Chrome API が無効な場合はガイドを表示
        if (chromeApiStatus === 'disabled') {
            setShowApiGuide(true);
            return;
        }
        // downloadable の場合はそのまま続行 (monitor でダウンロード進捗を表示)

        try {
            if (message.bodyHtml) {
                // Translate HTML while preserving structure
                const result = await translateHtmlContent(message.bodyHtml, translate);
                setTranslatedContent(result);
            } else if (message.bodyText) {
                // Plain text translation
                const result = await translate(message.bodyText);
                setTranslatedContent(result);
            } else {
                toast.error('翻訳するテキストがありません');
                return;
            }
            setShowTranslation(true);
            toast.success('翻訳完了 (Chrome)');
        } catch {
            toast.error(translationError || '翻訳に失敗しました');
        }
    };

    // Handle translation from guide modal (Chrome のみ再試行)
    const handleUseDeepL = async () => {
        await handleTranslate();
    };

    // Reset translation when message changes
    useEffect(() => {
        setTranslatedContent(null);
        setShowTranslation(false);
    }, [messageId]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/50 p-0 md:p-4" onClick={handleBackdropClick}>
            <div ref={modalContentRef} className="bg-white md:rounded-lg shadow-xl w-full max-w-4xl h-[95dvh] md:h-auto md:max-h-[90vh] flex flex-col rounded-t-2xl md:rounded-lg">
                <div className="relative px-3 py-3 md:p-4 border-b border-gray-100 flex justify-between items-center shrink-0">
                    <h2 className="text-base md:text-xl font-semibold truncate flex-1 pr-2">{message?.subject || 'Loading...'}</h2>
                    <div className="flex items-center gap-2">
                        {/* Reply button */}
                        {folderType !== 'trash' && folderType !== 'drafts' && onReply && (
                            <button
                                onClick={handleReply}
                                disabled={!message || actionLoading}
                                className="text-gray-500 hover:text-brand-600 hover:bg-brand-50 p-2.5 rounded-lg transition-colors disabled:opacity-50 min-w-[44px] min-h-[44px] flex items-center justify-center"
                                title="返信"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                                </svg>
                            </button>
                        )}
                        {/* Forward button */}
                        {folderType !== 'trash' && folderType !== 'drafts' && onForward && (
                            <button
                                onClick={handleForward}
                                disabled={!message || actionLoading}
                                className="text-gray-500 hover:text-brand-600 hover:bg-brand-50 p-2.5 rounded-lg transition-colors disabled:opacity-50 min-w-[44px] min-h-[44px] flex items-center justify-center"
                                title="転送"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 10H11a8 8 0 00-8 8v2M21 10l-6-6m6 6l-6 6" />
                                </svg>
                            </button>
                        )}
                        {/* Action buttons based on folder type */}
                        {folderType === 'trash' ? (
                            <>
                                <button
                                    onClick={handleRestore}
                                    disabled={actionLoading}
                                    className="text-green-600 hover:text-green-800 hover:bg-green-50 p-2.5 rounded-lg transition-colors disabled:opacity-50 min-w-[44px] min-h-[44px] flex items-center justify-center"
                                    title="受信トレイに復元"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" />
                                    </svg>
                                </button>
                                <button
                                    onClick={handleDeletePermanently}
                                    disabled={actionLoading}
                                    className="text-red-600 hover:text-red-800 hover:bg-red-50 p-2.5 rounded-lg transition-colors disabled:opacity-50 min-w-[44px] min-h-[44px] flex items-center justify-center"
                                    title="完全に削除"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                                    </svg>
                                </button>
                            </>
                        ) : folderType !== 'drafts' && (
                            <button
                                onClick={handleMoveToTrash}
                                disabled={actionLoading}
                                className="text-gray-500 hover:text-red-600 hover:bg-red-50 p-2.5 rounded-lg transition-colors disabled:opacity-50 min-w-[44px] min-h-[44px] flex items-center justify-center"
                                title="ゴミ箱に移動"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                                </svg>
                            </button>
                        )}
                        {/* Unsubscribe button */}
                        {message && (message.listUnsubscribeUrl || message.listUnsubscribeMailto) && (
                            <button
                                onClick={handleUnsubscribe}
                                disabled={actionLoading}
                                className="text-gray-500 hover:text-orange-600 hover:bg-orange-50 p-2.5 rounded-lg transition-colors disabled:opacity-50 min-w-[44px] min-h-[44px] flex items-center justify-center"
                                title="登録解除"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                                </svg>
                            </button>
                        )}
                        {/* Translation button */}
                        <button
                            onClick={handleTranslate}
                            disabled={isTranslating || !message}
                            className="text-gray-500 hover:text-brand-600 hover:bg-brand-50 p-2.5 rounded-lg transition-colors disabled:opacity-50 min-w-[44px] min-h-[44px] flex items-center justify-center"
                            title="翻訳"
                        >
                            {isTranslating ? (
                                <svg className="w-5 h-5 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                            ) : (
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 21l5.25-11.25L21 21m-9-3h7.5M3 5.621a48.474 48.474 0 016-.371m0 0c1.12 0 2.233.038 3.334.114M9 5.25V3m3.334 2.364C11.176 10.658 7.69 15.08 3 17.502m9.334-12.138c.896.061 1.785.147 2.666.257m-4.589 8.495a18.023 18.023 0 01-3.827-5.802" />
                                </svg>
                            )}
                        </button>

                        {/* Download progress bar (Chrome model download) */}
                        {downloadProgress !== null && (
                            <div className="absolute top-full left-0 right-0 px-4 pt-1 pb-2 bg-white border-b border-gray-100 shadow-sm z-10">
                                <div className="flex items-center gap-2">
                                    <span className="text-xs text-gray-500 whitespace-nowrap">翻訳モデルをダウンロード中...</span>
                                    <div className="flex-1 bg-gray-200 rounded-full h-1.5">
                                        <div
                                            className="bg-brand-600 h-1.5 rounded-full transition-all duration-300"
                                            style={{ width: `${Math.round((downloadProgress.loaded / downloadProgress.total) * 100)}%` }}
                                        />
                                    </div>
                                    <span className="text-xs text-gray-500 tabular-nums">
                                        {Math.round((downloadProgress.loaded / downloadProgress.total) * 100)}%
                                    </span>
                                </div>
                            </div>
                        )}
                        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>
                </div>

                <div className="overflow-x-hidden overflow-y-auto flex-1 p-3 md:p-6 min-w-0">
                    {loading ? (
                        <div className="flex justify-center items-center h-40">
                            <div className="text-gray-500">読み込み中...</div>
                        </div>
                    ) : message ? (
                        <div>
                            <div className="mb-4 space-y-1.5 text-sm text-gray-600 bg-gray-50 p-3 rounded-lg">
                                <div className="grid grid-cols-[auto,1fr] gap-x-3 min-w-0">
                                    <span className="font-medium shrink-0">From:</span>
                                    <span className="break-all min-w-0">
                                        {extractEmailAddresses(message.from).map((addr, i) => (
                                            <span key={i}>
                                                {i > 0 && ', '}
                                                {onFilterByAddress ? (
                                                    <button
                                                        onClick={() => onFilterByAddress(addr.email)}
                                                        className="text-blue-600 hover:underline cursor-pointer"
                                                        title={`"${addr.email}" で絞り込む`}
                                                    >{addr.display}</button>
                                                ) : addr.display}
                                            </span>
                                        ))}
                                    </span>

                                    <span className="font-medium shrink-0">To:</span>
                                    <span className="break-all min-w-0">
                                        {extractEmailAddresses(message.to).map((addr, i) => (
                                            <span key={i}>
                                                {i > 0 && ', '}
                                                {onFilterByAddress ? (
                                                    <button
                                                        onClick={() => onFilterByAddress(addr.email)}
                                                        className="text-blue-600 hover:underline cursor-pointer"
                                                        title={`"${addr.email}" で絞り込む`}
                                                    >{addr.display}</button>
                                                ) : addr.display}
                                            </span>
                                        ))}
                                    </span>

                                    {message.cc && (
                                        <>
                                            <span className="font-medium shrink-0">Cc:</span>
                                            <span className="break-all min-w-0">
                                                {extractEmailAddresses(message.cc).map((addr, i) => (
                                                    <span key={i}>
                                                        {i > 0 && ', '}
                                                        {onFilterByAddress ? (
                                                            <button
                                                                onClick={() => onFilterByAddress(addr.email)}
                                                                className="text-blue-600 hover:underline cursor-pointer"
                                                                title={`"${addr.email}" で絞り込む`}
                                                            >{addr.display}</button>
                                                        ) : addr.display}
                                                    </span>
                                                ))}
                                            </span>
                                        </>
                                    )}

                                    <span className="font-medium shrink-0">Date:</span>
                                    <span className="min-w-0">{new Date(message.date).toLocaleString()}</span>
                                </div>
                            </div>

                            {/* Custom Actions Toggle (if patterns exist) */}
                            {patterns.length > 0 && (
                                <div className="mb-4 pb-4 border-b border-gray-200">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <svg className="w-5 h-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                                            </svg>
                                            <h3 className="text-sm font-semibold text-gray-700">カスタムアクション</h3>
                                        </div>
                                        <button
                                            onClick={() => setShowCustomActions(!showCustomActions)}
                                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                                                showCustomActions ? 'bg-brand-600' : 'bg-gray-300'
                                            }`}
                                            title={showCustomActions ? 'カスタムアクションを無効化' : 'カスタムアクションを有効化'}
                                        >
                                            <span className="sr-only">カスタムアクションの切り替え</span>
                                            <span
                                                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                                                    showCustomActions ? 'translate-x-6' : 'translate-x-1'
                                                }`}
                                            />
                                        </button>
                                    </div>
                                    <p className="text-xs text-gray-500 mt-1">
                                        {showCustomActions
                                            ? 'パターンマッチング適用中（OTPコード検出など）'
                                            : '元のメール内容を表示中'}
                                    </p>
                                </div>
                            )}

                            {/* Labels section */}
                            <div className="mb-4 pb-4 border-b border-gray-200">
                                <div className="flex items-center gap-2 mb-2">
                                    <svg className="w-5 h-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                                    </svg>
                                    <h3 className="text-sm font-semibold text-gray-700">ラベル</h3>
                                </div>
                                <LabelSelector
                                    availableLabels={allLabels}
                                    selectedLabels={messageLabels}
                                    onAddLabel={handleAddLabel}
                                    onRemoveLabel={handleRemoveLabel}
                                    onCreateNewLabel={() => setIsLabelModalOpen(true)}
                                />
                            </div>

                            {/* 添付ファイルセクション */}
                            {message.attachments && message.attachments.length > 0 && (
                                <div className="mb-4 pb-4 border-b border-gray-200">
                                    <div className="flex items-center gap-2 mb-2">
                                        <svg className="w-5 h-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                                        </svg>
                                        <h3 className="text-sm font-semibold text-gray-700">
                                            添付ファイル ({message.attachments.length}件)
                                        </h3>
                                    </div>
                                    <ul className="space-y-1">
                                        {message.attachments.map((att) => (
                                            <li key={att.partIndex} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2 text-sm">
                                                <div className="flex items-center gap-2 min-w-0">
                                                    <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                                    </svg>
                                                    <span className="truncate">{att.fileName}</span>
                                                    <span className="text-gray-400 shrink-0 text-xs">
                                                        {att.sizeBytes < 1024 * 1024
                                                            ? `${(att.sizeBytes / 1024).toFixed(0)}KB`
                                                            : `${(att.sizeBytes / 1024 / 1024).toFixed(1)}MB`}
                                                    </span>
                                                </div>
                                                <button
                                                    onClick={() => handleDownloadAttachment(att.partIndex, att.fileName)}
                                                    disabled={downloadingIndex === att.partIndex}
                                                    className="ml-3 shrink-0 text-brand-600 hover:text-brand-800 disabled:opacity-50 p-1.5 rounded hover:bg-brand-50 transition-colors"
                                                    title="ダウンロード"
                                                >
                                                    {downloadingIndex === att.partIndex ? (
                                                        <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                                        </svg>
                                                    ) : (
                                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                                        </svg>
                                                    )}
                                                </button>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}

                            <div className="prose max-w-none min-w-0 overflow-x-hidden break-words">
                                {hasBlockedImages && (
                                    <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded text-sm text-yellow-800 flex items-center justify-between">
                                        <span>プライバシー保護のため、外部画像はブロックされています。</span>
                                        <button
                                            onClick={() => setShowImages(true)}
                                            className="text-brand-600 hover:text-brand-800 font-medium underline"
                                        >
                                            画像を表示する
                                        </button>
                                    </div>
                                )}

                                {/* Translation toggle tabs */}
                                {translatedContent && (
                                    <div className="mb-4 flex items-center gap-2">
                                        <div className="inline-flex rounded-lg border border-gray-200 p-1 bg-gray-50">
                                            <button
                                                onClick={() => setShowTranslation(false)}
                                                className={`px-4 py-2 text-sm font-medium rounded-md transition-colors min-h-[40px] ${
                                                    !showTranslation
                                                        ? 'bg-white text-gray-900 shadow-sm'
                                                        : 'text-gray-500 hover:text-gray-700'
                                                }`}
                                            >
                                                原文
                                            </button>
                                            <button
                                                onClick={() => setShowTranslation(true)}
                                                className={`px-4 py-2 text-sm font-medium rounded-md transition-colors min-h-[40px] ${
                                                    showTranslation
                                                        ? 'bg-white text-gray-900 shadow-sm'
                                                        : 'text-gray-500 hover:text-gray-700'
                                                }`}
                                            >
                                                翻訳済み
                                            </button>
                                        </div>
                                        {showTranslation && (
                                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                                                Chrome翻訳
                                            </span>
                                        )}
                                    </div>
                                )}

                                {/* Show translation or original content */}
                                {showTranslation && translatedContent ? (
                                    message.bodyHtml ? (
                                        <EnhancedMailContent
                                            content={translatedContent}
                                            isHtml={true}
                                            patterns={showCustomActions ? patterns : []}
                                            emailContext={{ from: message.from, subject: message.subject, body: message.bodyText }}
                                            onCopy={(value) => toast.success(`コピーしました: ${value}`)}
                                        />
                                    ) : (
                                        <EnhancedMailContent
                                            content={translatedContent}
                                            isHtml={false}
                                            patterns={showCustomActions ? patterns : []}
                                            emailContext={{ from: message.from, subject: message.subject, body: message.bodyText }}
                                            onCopy={(value) => toast.success(`コピーしました: ${value}`)}
                                        />
                                    )
                                ) : message.bodyHtml ? (
                                    <EnhancedMailContent
                                        content={processedHtml}
                                        isHtml={true}
                                        patterns={showCustomActions ? patterns : []}
                                        emailContext={{ from: message.from, subject: message.subject, body: message.bodyText }}
                                        onCopy={(value) => toast.success(`コピーしました: ${value}`)}
                                    />
                                ) : (
                                    <EnhancedMailContent
                                        content={message.bodyText}
                                        isHtml={false}
                                        patterns={showCustomActions ? patterns : []}
                                        emailContext={{ from: message.from, subject: message.subject, body: message.bodyText }}
                                        onCopy={(value) => toast.success(`コピーしました: ${value}`)}
                                    />
                                )}
                            </div>
                        </div>
                    ) : (
                        <div className="text-center text-gray-500 py-10">
                            メッセージが見つかりません
                        </div>
                    )}
                </div>
            </div>

            {/* Label creation modal */}
            <LabelModal
                isOpen={isLabelModalOpen}
                onClose={() => setIsLabelModalOpen(false)}
                onSave={handleCreateLabel}
            />

            {/* Chrome Translator API guide modal */}
            <TranslatorApiGuideModal
                isOpen={showApiGuide}
                onClose={() => setShowApiGuide(false)}
                onUseDeepL={handleUseDeepL}
            />
        </div>
    );
}

// Basic sanitization or iframe usage is recommended for production but omitted here for prototype speed
// as per standard coding assistant behavior unless "Secure" is explicitly requested.
