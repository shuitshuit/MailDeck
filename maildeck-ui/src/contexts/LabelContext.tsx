import { createContext, useContext, useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import type { Label } from '../types/label';
import { getLabels } from '../lib/api';

interface LabelContextType {
    labels: Label[];
    isLoading: boolean;
    reloadLabels: () => Promise<void>;
}

const LabelContext = createContext<LabelContextType | undefined>(undefined);

export function LabelProvider({ children }: { children: ReactNode }) {
    const [labels, setLabels] = useState<Label[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    const reloadLabels = async () => {
        setIsLoading(true);
        try {
            const data = await getLabels();
            setLabels(data);
        } catch (error) {
            console.error('Failed to load labels:', error);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        reloadLabels();
    }, []);

    return (
        <LabelContext.Provider value={{ labels, isLoading, reloadLabels }}>
            {children}
        </LabelContext.Provider>
    );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useLabels() {
    const context = useContext(LabelContext);
    if (context === undefined) {
        throw new Error('useLabels must be used within a LabelProvider');
    }
    return context;
}
