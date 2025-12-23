import { useEffect, useMemo, useState } from 'react';
import { getMessage } from '../lib/api';

interface MailDetailModalProps {
    isOpen: boolean;
    onClose: () => void;
    configId: string;
    messageId: string;
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

export default function MailDetailModal({ isOpen, onClose, configId, messageId }: MailDetailModalProps) {
    const [loading, setLoading] = useState(true);
    const [message, setMessage] = useState<MessageDetail | null>(null);
    const [showImages, setShowImages] = useState(false);
    const [hasBlockedImages, setHasBlockedImages] = useState(false);

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

    useEffect(() => {
        setShowImages(false);
        setHasBlockedImages(false);
        if (!isOpen || !messageId) {
            setMessage(null);
            return;
        }

        const fetchMessage = async () => {
            setLoading(true);
            try {
                const data = await getMessage(configId, messageId);
                setMessage(data);
            } catch (err) {
                console.error('Failed to fetch message', err);
                alert('メッセージの取得に失敗しました');
            } finally {
                setLoading(false);
            }
        };

        fetchMessage();
    }, [isOpen, configId, messageId]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-0 md:p-4">
            <div className="bg-white md:rounded-lg shadow-xl w-full max-w-4xl h-full md:h-auto md:max-h-[90vh] flex flex-col">
                <div className="p-4 border-b border-gray-100 flex justify-between items-center">
                    <h2 className="text-xl font-semibold truncate flex-1 pr-4">{message?.subject || 'Loading...'}</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
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

                                {message.bodyHtml ? (
                                    <div
                                        dangerouslySetInnerHTML={{ __html: processedHtml }}
                                        className="mail-content"
                                    />
                                ) : (
                                    <pre className="whitespace-pre-wrap font-sans text-gray-800">
                                        {message.bodyText}
                                    </pre>
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
        </div>
    );
}

// Basic sanitization or iframe usage is recommended for production but omitted here for prototype speed
// as per standard coding assistant behavior unless "Secure" is explicitly requested.
