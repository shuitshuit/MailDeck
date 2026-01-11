import { useState, useRef, useEffect } from 'react';
import { Label } from '../types/label';
import LabelBadge from './LabelBadge';

interface LabelSelectorProps {
    availableLabels: Label[];
    selectedLabels: Label[];
    onAddLabel: (labelId: string) => void;
    onRemoveLabel: (labelId: string) => void;
    onCreateNewLabel: () => void;
}

export default function LabelSelector({
    availableLabels,
    selectedLabels,
    onAddLabel,
    onRemoveLabel,
    onCreateNewLabel
}: LabelSelectorProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const dropdownRef = useRef<HTMLDivElement>(null);

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };

        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [isOpen]);

    const selectedLabelIds = new Set(selectedLabels.map(l => l.id));
    const filteredLabels = availableLabels.filter(label =>
        !selectedLabelIds.has(label.id) &&
        label.name.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const handleSelectLabel = (labelId: string) => {
        onAddLabel(labelId);
        setSearchQuery('');
        setIsOpen(false);
    };

    return (
        <div className="relative" ref={dropdownRef}>
            {/* Selected labels */}
            <div className="flex flex-wrap gap-1 mb-2">
                {selectedLabels.map(label => (
                    <LabelBadge
                        key={label.id}
                        label={label}
                        removable
                        onRemove={() => onRemoveLabel(label.id)}
                    />
                ))}
            </div>

            {/* Add label button */}
            <button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                className="inline-flex items-center gap-1 px-3 py-1 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                </svg>
                ラベルを追加
            </button>

            {/* Dropdown */}
            {isOpen && (
                <div className="absolute top-full left-0 mt-1 w-64 bg-white rounded-lg shadow-lg border border-gray-200 z-10 py-2">
                    {/* Search */}
                    <div className="px-3 pb-2">
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="ラベルを検索..."
                            className="w-full px-3 py-1.5 text-sm border rounded-md focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
                            autoFocus
                        />
                    </div>

                    {/* Label list */}
                    <div className="max-h-60 overflow-y-auto">
                        {filteredLabels.length > 0 ? (
                            filteredLabels.map(label => (
                                <button
                                    key={label.id}
                                    type="button"
                                    onClick={() => handleSelectLabel(label.id)}
                                    className="w-full px-3 py-2 text-left hover:bg-gray-50 transition-colors flex items-center gap-2"
                                >
                                    <div
                                        className="w-3 h-3 rounded-full flex-shrink-0"
                                        style={{ backgroundColor: label.color }}
                                    />
                                    <span className="text-sm text-gray-700">{label.name}</span>
                                </button>
                            ))
                        ) : (
                            <div className="px-3 py-2 text-sm text-gray-500">
                                {searchQuery ? 'ラベルが見つかりません' : 'すべてのラベルが適用されています'}
                            </div>
                        )}
                    </div>

                    {/* Create new label */}
                    <div className="border-t border-gray-200 mt-2 pt-2 px-3">
                        <button
                            type="button"
                            onClick={() => {
                                onCreateNewLabel();
                                setIsOpen(false);
                            }}
                            className="w-full px-3 py-2 text-sm text-left text-brand-600 hover:bg-brand-50 rounded-md transition-colors flex items-center gap-2"
                        >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                            </svg>
                            新しいラベルを作成
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
