import type { Label } from '../types/label';

interface LabelBadgeProps {
    label: Label;
    onRemove?: () => void;
    onClick?: () => void;
    removable?: boolean;
}

export default function LabelBadge({ label, onRemove, onClick, removable = false }: LabelBadgeProps) {
    const textColor = getContrastColor(label.color);

    return (
        <div
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium transition-all ${
                onClick ? 'cursor-pointer hover:opacity-80' : ''
            }`}
            style={{
                backgroundColor: label.color,
                color: textColor
            }}
            onClick={onClick}
            title={label.name}
        >
            <span>{label.name}</span>
            {removable && onRemove && (
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        onRemove();
                    }}
                    className="hover:bg-black hover:bg-opacity-20 rounded-full p-0.5 transition-colors"
                    aria-label={`Remove ${label.name} label`}
                >
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>
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
