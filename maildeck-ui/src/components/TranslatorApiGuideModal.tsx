import { useState } from 'react';

interface TranslatorApiGuideModalProps {
    isOpen: boolean;
    onClose: () => void;
    onUseDeepL: () => void;
}

export default function TranslatorApiGuideModal({
    isOpen,
    onClose,
    onUseDeepL
}: TranslatorApiGuideModalProps) {
    const [copied, setCopied] = useState(false);

    if (!isOpen) return null;

    const flagsUrl = 'chrome://flags/#translation-api';

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(flagsUrl);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            // Fallback for older browsers
            const textArea = document.createElement('textarea');
            textArea.value = flagsUrl;
            document.body.appendChild(textArea);
            textArea.select();
            document.execCommand('copy');
            document.body.removeChild(textArea);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    };

    const handleUseDeepL = () => {
        onUseDeepL();
        onClose();
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-xl max-w-lg w-full">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b">
                    <h2 className="text-lg font-semibold text-gray-900">
                        ブラウザ内翻訳を有効にする
                    </h2>
                    <button
                        onClick={onClose}
                        className="text-gray-400 hover:text-gray-600 transition-colors"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* Content */}
                <div className="p-4 space-y-4">
                    <p className="text-sm text-gray-600">
                        Chrome の実験的な翻訳機能を有効にすると、データをサーバーに送信せずにブラウザ内で翻訳できます。
                    </p>

                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                        <h3 className="font-medium text-blue-900 mb-3">有効化手順</h3>
                        <ol className="text-sm text-blue-800 space-y-2 list-decimal list-inside">
                            <li>以下のURLをコピーしてアドレスバーに貼り付けてください</li>
                            <li>「Enabled」または「Enabled without language pack limit」を選択</li>
                            <li>「Relaunch」をクリックしてChromeを再起動</li>
                        </ol>
                    </div>

                    {/* URL Copy Box */}
                    <div className="flex items-center gap-2 bg-gray-100 rounded-lg p-3">
                        <code className="flex-1 text-sm text-gray-700 font-mono break-all">
                            {flagsUrl}
                        </code>
                        <button
                            onClick={handleCopy}
                            className={`flex-shrink-0 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                                copied
                                    ? 'bg-green-100 text-green-700'
                                    : 'bg-brand-600 text-white hover:bg-brand-700'
                            }`}
                        >
                            {copied ? (
                                <span className="flex items-center gap-1">
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                    </svg>
                                    コピー済み
                                </span>
                            ) : (
                                <span className="flex items-center gap-1">
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                    </svg>
                                    コピー
                                </span>
                            )}
                        </button>
                    </div>

                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                        <p className="text-sm text-amber-800">
                            <strong>注意:</strong> この機能は実験的なものです。有効にしなくても、DeepL翻訳を使用できます。
                        </p>
                    </div>
                </div>

                {/* Footer */}
                <div className="flex justify-end gap-3 p-4 border-t bg-gray-50 rounded-b-xl">
                    <button
                        onClick={handleUseDeepL}
                        className="px-4 py-2 text-sm font-medium text-brand-600 hover:text-brand-700 hover:bg-brand-50 rounded-lg transition-colors"
                    >
                        DeepLで翻訳
                    </button>
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                    >
                        後で
                    </button>
                </div>
            </div>
        </div>
    );
}
