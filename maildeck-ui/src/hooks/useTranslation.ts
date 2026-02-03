import { useState, useCallback, useEffect } from 'react';
import { translateText } from '../lib/api';

export type ChromeApiStatus = 'available' | 'disabled' | 'unavailable';
export type TranslationMethod = 'chrome' | 'deepl' | null;

interface UseTranslationReturn {
    translate: (text: string) => Promise<string>;
    isTranslating: boolean;
    chromeApiStatus: ChromeApiStatus;
    translationMethod: TranslationMethod;
    error: string | null;
    clearError: () => void;
}

// Chrome Translator API types
interface ChromeTranslator {
    translate(text: string): Promise<string>;
}

interface ChromeTranslation {
    createTranslator(options: { sourceLanguage: string; targetLanguage: string }): Promise<ChromeTranslator>;
    canTranslate(options: { sourceLanguage: string; targetLanguage: string }): Promise<'no' | 'readily' | 'after-download'>;
}

declare global {
    interface Window {
        translation?: ChromeTranslation;
    }
}

/**
 * Get target language from browser settings
 * Returns language code in uppercase (e.g., "JA", "EN")
 */
function getTargetLanguage(): string {
    const browserLang = navigator.language.split('-')[0];
    return browserLang.toUpperCase();
}

/**
 * Get target language in lowercase for Chrome API
 */
function getTargetLanguageLowerCase(): string {
    return navigator.language.split('-')[0].toLowerCase();
}

/**
 * Check if running on Chrome desktop
 */
function isChromeDesktop(): boolean {
    const ua = navigator.userAgent;
    const isChrome = /Chrome/.test(ua) && !/Edge|Edg|OPR/.test(ua);
    const isDesktop = !/Android|iPhone|iPad|iPod/.test(ua);
    return isChrome && isDesktop;
}

/**
 * Check Chrome Translator API status
 */
async function checkChromeTranslatorApi(): Promise<ChromeApiStatus> {
    if (!isChromeDesktop()) {
        return 'unavailable';
    }

    // Check if translation API exists
    if (typeof window.translation !== 'undefined' && window.translation !== null) {
        try {
            // Try to check if translation is possible
            const canTranslate = await window.translation.canTranslate({
                sourceLanguage: 'en',
                targetLanguage: getTargetLanguageLowerCase()
            });
            if (canTranslate !== 'no') {
                return 'available';
            }
        } catch {
            // API exists but may not be fully functional
            return 'disabled';
        }
    }

    // Chrome desktop but API not available - user needs to enable it
    return 'disabled';
}

/**
 * Translate using Chrome Translator API
 */
async function translateWithChrome(text: string): Promise<string> {
    if (!window.translation) {
        throw new Error('Chrome Translator API not available');
    }

    const targetLang = getTargetLanguageLowerCase();

    // Check availability first
    const canTranslate = await window.translation.canTranslate({
        sourceLanguage: 'en',
        targetLanguage: targetLang
    });

    if (canTranslate === 'no') {
        throw new Error('Translation not available for this language pair');
    }

    // Create translator (this will trigger language pack download if needed)
    const translator = await window.translation.createTranslator({
        sourceLanguage: 'en',
        targetLanguage: targetLang
    });

    return await translator.translate(text);
}

/**
 * Translate using DeepL API (backend)
 */
async function translateWithDeepL(text: string): Promise<string> {
    const targetLang = getTargetLanguage();
    const response = await translateText({ text, targetLang });
    return response.translatedText;
}

export function useTranslation(): UseTranslationReturn {
    const [isTranslating, setIsTranslating] = useState(false);
    const [chromeApiStatus, setChromeApiStatus] = useState<ChromeApiStatus>('unavailable');
    const [translationMethod, setTranslationMethod] = useState<TranslationMethod>(null);
    const [error, setError] = useState<string | null>(null);

    // Check Chrome API status on mount
    useEffect(() => {
        checkChromeTranslatorApi().then(setChromeApiStatus);
    }, []);

    const clearError = useCallback(() => {
        setError(null);
    }, []);

    const translate = useCallback(async (text: string): Promise<string> => {
        setIsTranslating(true);
        setError(null);

        try {
            // Try Chrome API first if available
            if (chromeApiStatus === 'available') {
                try {
                    const result = await translateWithChrome(text);
                    setTranslationMethod('chrome');
                    return result;
                } catch (chromeError) {
                    console.warn('Chrome translation failed, falling back to DeepL:', chromeError);
                    // Fall through to DeepL
                }
            }

            // Use DeepL API
            const result = await translateWithDeepL(text);
            setTranslationMethod('deepl');
            return result;
        } catch (err) {
            const message = err instanceof Error ? err.message : '翻訳に失敗しました';
            setError(message);
            throw err;
        } finally {
            setIsTranslating(false);
        }
    }, [chromeApiStatus]);

    return {
        translate,
        isTranslating,
        chromeApiStatus,
        translationMethod,
        error,
        clearError
    };
}
