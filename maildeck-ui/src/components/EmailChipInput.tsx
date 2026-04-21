import { useRef, useState } from 'react';

interface Contact {
    name: string;
    email: string;
}

interface EmailChipInputProps {
    label: string;
    chips: string[];
    onChange: (chips: string[]) => void;
    contacts: Contact[];
    required?: boolean;
    disabled?: boolean;
}

function isValidEmail(value: string) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export default function EmailChipInput({ label, chips, onChange, contacts, required = false, disabled = false }: EmailChipInputProps) {
    const [inputValue, setInputValue] = useState('');
    const [showSuggestions, setShowSuggestions] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    const suggestions = inputValue.length > 0
        ? contacts.filter(c =>
            c.email.toLowerCase().includes(inputValue.toLowerCase()) ||
            c.name.toLowerCase().includes(inputValue.toLowerCase())
        ).slice(0, 6)
        : [];

    const addChip = (value: string) => {
        const trimmed = value.trim();
        if (!trimmed) return;
        if (!isValidEmail(trimmed)) return;
        if (chips.includes(trimmed)) {
            setInputValue('');
            return;
        }
        onChange([...chips, trimmed]);
        setInputValue('');
        setShowSuggestions(false);
    };

    const removeChip = (index: number) => {
        onChange(chips.filter((_, i) => i !== index));
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter' || e.key === ',' || e.key === ' ' || e.key === 'Tab') {
            if (inputValue.trim()) {
                e.preventDefault();
                addChip(inputValue);
            }
        } else if (e.key === 'Backspace' && inputValue === '' && chips.length > 0) {
            removeChip(chips.length - 1);
        } else if (e.key === 'Escape') {
            setShowSuggestions(false);
        }
    };

    const handleBlur = () => {
        setTimeout(() => {
            setShowSuggestions(false);
            if (inputValue.trim()) addChip(inputValue);
        }, 150);
    };

    return (
        <div className="relative">
            <div
                className="flex flex-wrap gap-1.5 items-center px-3 py-2 border-b border-gray-200 focus-within:border-brand-500 transition-colors min-h-[48px] cursor-text"
                onClick={() => inputRef.current?.focus()}
            >
                <span className="text-sm text-gray-400 shrink-0 select-none">{label}</span>
                {chips.map((chip, i) => (
                    <span
                        key={i}
                        className="inline-flex items-center gap-1 bg-brand-100 text-brand-800 text-sm px-2 py-0.5 rounded-full"
                    >
                        {chip}
                        {!disabled && (
                            <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); removeChip(i); }}
                                className="text-brand-500 hover:text-brand-800 leading-none"
                            >
                                ×
                            </button>
                        )}
                    </span>
                ))}
                {!disabled && (
                    <input
                        ref={inputRef}
                        type="text"
                        value={inputValue}
                        onChange={(e) => {
                            setInputValue(e.target.value);
                            setShowSuggestions(true);
                        }}
                        onKeyDown={handleKeyDown}
                        onFocus={() => setShowSuggestions(true)}
                        onBlur={handleBlur}
                        className="flex-1 min-w-[120px] outline-none text-base bg-transparent"
                        placeholder={chips.length === 0 ? 'メールアドレスを入力...' : ''}
                        required={required && chips.length === 0}
                    />
                )}
            </div>

            {showSuggestions && suggestions.length > 0 && (
                <ul className="absolute z-10 left-0 right-0 bg-white border border-gray-200 rounded-lg shadow-lg mt-0.5 overflow-hidden">
                    {suggestions.map((c) => (
                        <li
                            key={c.email}
                            onMouseDown={(e) => { e.preventDefault(); addChip(c.email); }}
                            className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 cursor-pointer text-sm"
                        >
                            <span className="w-7 h-7 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center text-xs font-bold shrink-0">
                                {c.name ? c.name[0].toUpperCase() : c.email[0].toUpperCase()}
                            </span>
                            <div className="min-w-0">
                                {c.name && <div className="font-medium truncate">{c.name}</div>}
                                <div className="text-gray-500 truncate">{c.email}</div>
                            </div>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
