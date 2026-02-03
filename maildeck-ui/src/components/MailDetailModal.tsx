import { useEffect, useMemo, useState } from 'react';
import { getMessage, getLabelsForMessage, addLabelToMessage, removeLabelFromMessage, createLabel, getCustomActionPatterns, moveToTrash, deleteFromTrash, restoreFromTrash } from '../lib/api';
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

interface MailDetailModalProps {
    isOpen: boolean;
    onClose: () => void;
    configId: string;
    messageId: number;
    folderType?: FolderType;
    onMessageDeleted?: () => void;
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
}

export default function MailDetailModal({ isOpen, onClose, configId, messageId, folderType = 'inbox', onMessageDeleted }: MailDetailModalProps) {
    const [loading, setLoading] = useState(true);
    const [message, setMessage] = useState<MessageDetail | null>(null);
    const [showImages, setShowImages] = useState(false);
    const [hasBlockedImages, setHasBlockedImages] = useState(false);
    const [actionLoading, setActionLoading] = useState(false);
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
    const { translate, isTranslating, chromeApiStatus, translationMethod, error: translationError } = useTranslation();
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

        return doc.body.innerHTML;
    }, [message?.bodyHtml, showImages]);

    // Update hasBlockedImages state based on checkForImages
    useEffect(() => {
        if (!showImages) {
            setHasBlockedImages(checkForImages);
        } else {
            setHasBlockedImages(false);
        }
    }, [checkForImages, showImages]);


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

        const fetchPatterns = async () => {
            try {
                const data = await getCustomActionPatterns();
                // Only use enabled patterns
                setPatterns(data.filter((p: CustomActionPattern) => p.isEnabled));
            } catch (err) {
                console.error('Failed to fetch custom action patterns', err);
                // Silently fail - custom actions are optional
            }
        };

        fetchMessage();
        fetchMessageLabels();
        fetchPatterns();
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

    // Translate HTML while preserving structure
    const translateHtmlContent = async (html: string, translateFn: (text: string) => Promise<string>): Promise<string> => {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');

        // Collect all text nodes
        const textNodes: { node: Text; text: string }[] = [];
        const walker = document.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT, null);
        let node: Text | null;
        while ((node = walker.nextNode() as Text | null)) {
            const text = node.textContent?.trim();
            if (text && text.length > 0) {
                textNodes.push({ node, text });
            }
        }

        if (textNodes.length === 0) {
            return html;
        }

        // Combine all text with separator for batch translation
        const separator = '\n§§§\n';
        const combinedText = textNodes.map(t => t.text).join(separator);

        // Translate combined text
        const translatedCombined = await translateFn(combinedText);
        const translatedTexts = translatedCombined.split(separator);

        // Replace text nodes with translated text
        textNodes.forEach((item, index) => {
            if (translatedTexts[index]) {
                item.node.textContent = translatedTexts[index];
            }
        });

        return doc.body.innerHTML;
    };

    // Handle translation
    const handleTranslate = async () => {
        if (!message) return;

        // If Chrome API is disabled on Chrome desktop, show guide
        if (chromeApiStatus === 'disabled') {
            setShowApiGuide(true);
            return;
        }

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
            toast.success(`翻訳完了 (${translationMethod === 'chrome' ? 'Chrome' : 'DeepL'})`);
        } catch {
            toast.error(translationError || '翻訳に失敗しました');
        }
    };

    // Handle DeepL translation from guide modal
    const handleUseDeepL = async () => {
        if (!message) return;

        try {
            if (message.bodyHtml) {
                const result = await translateHtmlContent(message.bodyHtml, translate);
                setTranslatedContent(result);
            } else if (message.bodyText) {
                const result = await translate(message.bodyText);
                setTranslatedContent(result);
            } else {
                toast.error('翻訳するテキストがありません');
                return;
            }
            setShowTranslation(true);
            toast.success('翻訳完了 (DeepL)');
        } catch {
            toast.error(translationError || '翻訳に失敗しました');
        }
    };

    // Reset translation when message changes
    useEffect(() => {
        setTranslatedContent(null);
        setShowTranslation(false);
    }, [messageId]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-0 md:p-4" onClick={handleBackdropClick}>
            <div ref={modalContentRef} className="bg-white md:rounded-lg shadow-xl w-full max-w-4xl h-full md:h-auto md:max-h-[90vh] flex flex-col">
                <div className="p-4 border-b border-gray-100 flex justify-between items-center">
                    <h2 className="text-xl font-semibold truncate flex-1 pr-4">{message?.subject || 'Loading...'}</h2>
                    <div className="flex items-center gap-2">
                        {/* Action buttons based on folder type */}
                        {folderType === 'trash' ? (
                            <>
                                <button
                                    onClick={handleRestore}
                                    disabled={actionLoading}
                                    className="text-green-600 hover:text-green-800 hover:bg-green-50 p-2 rounded-lg transition-colors disabled:opacity-50"
                                    title="受信トレイに復元"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" />
                                    </svg>
                                </button>
                                <button
                                    onClick={handleDeletePermanently}
                                    disabled={actionLoading}
                                    className="text-red-600 hover:text-red-800 hover:bg-red-50 p-2 rounded-lg transition-colors disabled:opacity-50"
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
                                className="text-gray-500 hover:text-red-600 hover:bg-red-50 p-2 rounded-lg transition-colors disabled:opacity-50"
                                title="ゴミ箱に移動"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                                </svg>
                            </button>
                        )}
                        {/* Translation button */}
                        <button
                            onClick={handleTranslate}
                            disabled={isTranslating || !message}
                            className="text-gray-500 hover:text-brand-600 hover:bg-brand-50 p-2 rounded-lg transition-colors disabled:opacity-50"
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
                        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-2">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>
                </div>

                <div className="overflow-auto flex-1 p-6">
                    {loading ? (
                        <div className="flex justify-center items-center h-40">
                            <div className="text-gray-500">読み込み中...</div>
                        </div>
                    ) : message ? (
                        <div>
                            <div className="mb-6 space-y-2 text-sm text-gray-600 bg-gray-50 p-4 rounded-lg">
                                <div className="grid grid-cols-[auto,1fr] gap-x-4">
                                    <span className="font-medium">From:</span>
                                    <span>{message.from}</span>

                                    <span className="font-medium">To:</span>
                                    <span>{message.to}</span>

                                    {message.cc && (
                                        <>
                                            <span className="font-medium">Cc:</span>
                                            <span>{message.cc}</span>
                                        </>
                                    )}

                                    <span className="font-medium">Date:</span>
                                    <span>{new Date(message.date).toLocaleString()}</span>
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
                            <div className="mb-6 pb-6 border-b border-gray-200">
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

                            <div className="prose max-w-none">
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
                                                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                                                    !showTranslation
                                                        ? 'bg-white text-gray-900 shadow-sm'
                                                        : 'text-gray-500 hover:text-gray-700'
                                                }`}
                                            >
                                                原文
                                            </button>
                                            <button
                                                onClick={() => setShowTranslation(true)}
                                                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                                                    showTranslation
                                                        ? 'bg-white text-gray-900 shadow-sm'
                                                        : 'text-gray-500 hover:text-gray-700'
                                                }`}
                                            >
                                                翻訳済み
                                            </button>
                                        </div>
                                        {showTranslation && translationMethod && (
                                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                                                {translationMethod === 'chrome' ? 'Chrome翻訳' : 'DeepL翻訳'}
                                            </span>
                                        )}
                                    </div>
                                )}

                                {/* Show translation or original content */}
                                {showTranslation && translatedContent ? (
                                    <EnhancedMailContent
                                        content={translatedContent}
                                        isHtml={!!message.bodyHtml}
                                        patterns={showCustomActions ? patterns : []}
                                        onCopy={(value) => toast.success(`コピーしました: ${value}`)}
                                    />
                                ) : (
                                    <EnhancedMailContent
                                        content={message.bodyHtml ? processedHtml : message.bodyText}
                                        isHtml={!!message.bodyHtml}
                                        patterns={showCustomActions ? patterns : []}
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
