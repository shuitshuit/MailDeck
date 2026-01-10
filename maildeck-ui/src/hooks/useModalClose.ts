import { useEffect, useRef } from 'react';

/**
 * モーダルを ESC キーまたはバックドロップクリックで閉じるカスタムフック
 * @param isOpen モーダルが開いているかどうか
 * @param onClose モーダルを閉じるコールバック
 */
export function useModalClose(isOpen: boolean, onClose: () => void) {
    const modalContentRef = useRef<HTMLDivElement>(null);

    // ESC キーで閉じる
    useEffect(() => {
        if (!isOpen) return;

        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                onClose();
            }
        };

        document.addEventListener('keydown', handleEscape);
        return () => document.removeEventListener('keydown', handleEscape);
    }, [isOpen, onClose]);

    // バックドロップクリックで閉じる
    const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
        // クリックされた要素がバックドロップ自身の場合のみ閉じる
        if (e.target === e.currentTarget) {
            onClose();
        }
    };

    return {
        modalContentRef,
        handleBackdropClick,
    };
}
