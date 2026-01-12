import { useEffect, useState } from 'react';
import { useModalClose } from '../hooks/useModalClose';
import { useToast } from '../contexts/ToastContext';

interface LabelModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (name: string, color: string) => Promise<void>;
    initialData?: { name: string; color: string } | null;
}

// Preset colors for quick selection
const PRESET_COLORS = [
    '#3B82F6', // Blue
    '#10B981', // Green
    '#EF4444', // Red
    '#F59E0B', // Amber
    '#8B5CF6', // Purple
    '#EC4899', // Pink
    '#06B6D4', // Cyan
    '#84CC16', // Lime
    '#F97316', // Orange
    '#6366F1', // Indigo
    '#14B8A6', // Teal
    '#A855F7', // Violet
];

export default function LabelModal({ isOpen, onClose, onSave, initialData }: LabelModalProps) {
    const [name, setName] = useState('');
    const [color, setColor] = useState('#3B82F6');
    const [isSaving, setIsSaving] = useState(false);
    const { modalContentRef, handleBackdropClick } = useModalClose(isOpen, onClose);
    const toast = useToast();

    useEffect(() => {
        if (isOpen) {
            if (initialData) {
                setName(initialData.name);
                setColor(initialData.color);
            } else {
                setName('');
                setColor('#3B82F6');
            }
        }
    }, [isOpen, initialData]);

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSaving(true);
        try {
            await onSave(name, color);
            setName('');
            setColor('#3B82F6');
            onClose();
        } catch (error) {
            console.error('Failed to save label:', error);
            toast.error('保存に失敗しました。');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black bg-opacity-30" onClick={handleBackdropClick}>
            <div ref={modalContentRef} className="bg-white rounded-xl shadow-xl w-full max-w-md relative z-10 p-6">
                <div className="flex items-center justify-between mb-6">
                    <h2 className="text-lg font-bold text-gray-800">{initialData ? 'ラベルを編集' : 'ラベルを作成'}</h2>
                    <button onClick={onClose} className="text-gray-500 hover:text-gray-700 transition-colors">
                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-5">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">ラベル名</label>
                        <input
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none transition-all"
                            placeholder="例: 仕事、重要、家族"
                            required
                            maxLength={100}
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">カラー</label>

                        {/* Preset colors */}
                        <div className="grid grid-cols-6 gap-2 mb-3">
                            {PRESET_COLORS.map((presetColor) => (
                                <button
                                    key={presetColor}
                                    type="button"
                                    onClick={() => setColor(presetColor)}
                                    className={`w-10 h-10 rounded-lg transition-all ${
                                        color === presetColor
                                            ? 'ring-2 ring-offset-2 ring-gray-800 scale-110'
                                            : 'hover:scale-105'
                                    }`}
                                    style={{ backgroundColor: presetColor }}
                                    title={presetColor}
                                />
                            ))}
                        </div>

                        {/* Custom color picker */}
                        <div className="flex items-center gap-3">
                            <input
                                type="color"
                                value={color}
                                onChange={(e) => setColor(e.target.value)}
                                className="w-12 h-12 rounded-lg border cursor-pointer"
                            />
                            <input
                                type="text"
                                value={color}
                                onChange={(e) => setColor(e.target.value)}
                                className="flex-1 px-3 py-2 border rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none transition-all font-mono text-sm"
                                placeholder="#RRGGBB"
                                pattern="^#[0-9A-Fa-f]{6}$"
                            />
                        </div>

                        {/* Preview */}
                        <div className="mt-3 p-3 bg-gray-50 rounded-lg">
                            <div className="text-xs text-gray-500 mb-1">プレビュー:</div>
                            <div
                                className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium"
                                style={{
                                    backgroundColor: color,
                                    color: getContrastColor(color)
                                }}
                            >
                                {name || 'ラベル名'}
                            </div>
                        </div>
                    </div>

                    <div className="flex gap-3 pt-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                            disabled={isSaving}
                        >
                            キャンセル
                        </button>
                        <button
                            type="submit"
                            className="flex-1 px-4 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            disabled={isSaving}
                        >
                            {isSaving ? '保存中...' : initialData ? '更新' : '作成'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

/**
 * Calculate contrasting text color (white or black) based on background color
 */
function getContrastColor(hexColor: string): string {
    // Convert hex to RGB
    const r = parseInt(hexColor.slice(1, 3), 16);
    const g = parseInt(hexColor.slice(3, 5), 16);
    const b = parseInt(hexColor.slice(5, 7), 16);

    // Calculate luminance
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

    // Return white for dark backgrounds, black for light backgrounds
    return luminance > 0.5 ? '#000000' : '#FFFFFF';
}
