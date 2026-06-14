import { createContext, useContext, useState, useCallback } from 'react';
import type { ReactNode } from 'react';

interface ConfirmOptions {
    title?: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    type?: 'danger' | 'warning' | 'info';
}

interface ConfirmContextType {
    confirm: (options: ConfirmOptions) => Promise<boolean>;
}

const ConfirmContext = createContext<ConfirmContextType | undefined>(undefined);

// eslint-disable-next-line react-refresh/only-export-components
export function useConfirm() {
    const context = useContext(ConfirmContext);
    if (!context) {
        throw new Error('useConfirm must be used within ConfirmProvider');
    }
    return context;
}

interface ConfirmProviderProps {
    children: ReactNode;
}

export function ConfirmProvider({ children }: ConfirmProviderProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [options, setOptions] = useState<ConfirmOptions>({ message: '' });
    const [resolver, setResolver] = useState<((value: boolean) => void) | null>(null);

    const confirm = useCallback((opts: ConfirmOptions): Promise<boolean> => {
        return new Promise((resolve) => {
            setOptions(opts);
            setIsOpen(true);
            setResolver(() => resolve);
        });
    }, []);

    const handleConfirm = () => {
        resolver?.(true);
        setIsOpen(false);
    };

    const handleCancel = () => {
        resolver?.(false);
        setIsOpen(false);
    };

    if (!isOpen) {
        return (
            <ConfirmContext.Provider value={{ confirm }}>
                {children}
            </ConfirmContext.Provider>
        );
    }

    const type = options.type || 'info';

    return (
        <ConfirmContext.Provider value={{ confirm }}>
            {children}
            {/* Confirm modal */}
            <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/30">
                <div className="bg-white rounded-xl shadow-xl w-full max-w-md relative z-10 p-6 animate-scale-in">
                    {/* Icon */}
                    <div className="mb-4 flex justify-center">
                        {type === 'danger' && (
                            <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center">
                                <svg className="w-6 h-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                </svg>
                            </div>
                        )}
                        {type === 'warning' && (
                            <div className="w-12 h-12 rounded-full bg-yellow-100 flex items-center justify-center">
                                <svg className="w-6 h-6 text-yellow-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                </svg>
                            </div>
                        )}
                        {type === 'info' && (
                            <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center">
                                <svg className="w-6 h-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                            </div>
                        )}
                    </div>

                    {/* Title */}
                    {options.title && (
                        <h3 className="text-lg font-bold text-gray-900 mb-2 text-center">
                            {options.title}
                        </h3>
                    )}

                    {/* Message */}
                    <p className="text-gray-700 text-center mb-6">
                        {options.message}
                    </p>

                    {/* Buttons */}
                    <div className="flex gap-3">
                        <button
                            onClick={handleCancel}
                            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors font-medium"
                        >
                            {options.cancelText || 'キャンセル'}
                        </button>
                        <button
                            onClick={handleConfirm}
                            className={`flex-1 px-4 py-2 rounded-lg transition-colors font-medium text-white ${
                                type === 'danger'
                                    ? 'bg-red-600 hover:bg-red-700'
                                    : type === 'warning'
                                    ? 'bg-yellow-600 hover:bg-yellow-700'
                                    : 'bg-brand-600 hover:bg-brand-700'
                            }`}
                        >
                            {options.confirmText || 'OK'}
                        </button>
                    </div>
                </div>
            </div>
        </ConfirmContext.Provider>
    );
}
