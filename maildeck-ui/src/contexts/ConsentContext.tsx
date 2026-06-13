import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import type { ReactNode } from 'react';
import { getConsentStatus, recordConsent, type ConsentStatus } from '../lib/api';

interface ConsentContextType {
    consentStatus: ConsentStatus | null;
    isLoading: boolean;
    requiresConsent: boolean;
    checkConsent: () => Promise<void>;
    submitConsent: () => Promise<void>;
}

const ConsentContext = createContext<ConsentContextType | undefined>(undefined);

// eslint-disable-next-line react-refresh/only-export-components
export function useConsent() {
    const context = useContext(ConsentContext);
    if (!context) {
        throw new Error('useConsent must be used within ConsentProvider');
    }
    return context;
}

interface ConsentProviderProps {
    children: ReactNode;
    isAuthenticated: boolean;
}

export function ConsentProvider({ children, isAuthenticated }: ConsentProviderProps) {
    const [consentStatus, setConsentStatus] = useState<ConsentStatus | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    const requiresConsent = consentStatus !== null && (
        consentStatus.requiresTermsOfServiceConsent || consentStatus.requiresPrivacyPolicyConsent
    );

    const checkConsent = useCallback(async () => {
        if (!isAuthenticated) {
            setConsentStatus(null);
            return;
        }

        setIsLoading(true);
        try {
            const status = await getConsentStatus();
            setConsentStatus(status);
        } catch (error) {
            console.error('Failed to check consent status:', error);
        } finally {
            setIsLoading(false);
        }
    }, [isAuthenticated]);

    const submitConsent = useCallback(async () => {
        if (!consentStatus) return;

        setIsLoading(true);
        try {
            const status = await recordConsent(
                consentStatus.requiresTermsOfServiceConsent,
                consentStatus.requiresPrivacyPolicyConsent
            );
            setConsentStatus(status);
        } catch (error) {
            console.error('Failed to record consent:', error);
            throw error;
        } finally {
            setIsLoading(false);
        }
    }, [consentStatus]);

    useEffect(() => {
        if (isAuthenticated) {
            checkConsent();
        } else {
            setConsentStatus(null);
        }
    }, [isAuthenticated, checkConsent]);

    return (
        <ConsentContext.Provider value={{
            consentStatus,
            isLoading,
            requiresConsent,
            checkConsent,
            submitConsent
        }}>
            {children}
        </ConsentContext.Provider>
    );
}
