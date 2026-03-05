import { useState, useCallback, useEffect } from 'react';

export type ChromeApiStatus = 'available' | 'downloadable' | 'disabled' | 'unavailable';

export interface DownloadProgress {
    loaded: number; // 0.0 ~ 1.0
    total: number;  // 通常 1.0
}

interface UseTranslationReturn {
    translate: (text: string) => Promise<string>;
    isTranslating: boolean;
    chromeApiStatus: ChromeApiStatus;
    downloadProgress: DownloadProgress | null;
    error: string | null;
    clearError: () => void;
}

// Chrome Translator API types (新 API: Translator in self)
interface ChromeTranslatorInstance {
    translate(text: string): Promise<string>;
    destroy(): void;
}

interface DownloadProgressEvent extends Event {
    loaded: number;
    total: number;
}

interface TranslatorMonitor {
    addEventListener(type: 'downloadprogress', listener: (e: DownloadProgressEvent) => void): void;
}

interface ChromeTranslatorCreateOptions {
    sourceLanguage: string;
    targetLanguage: string;
    monitor?: (monitor: TranslatorMonitor) => void;
}

interface ChromeTranslatorConstructor {
    availability(options: { sourceLanguage: string; targetLanguage: string }): Promise<'unavailable' | 'downloadable' | 'downloading' | 'available'>;
    create(options: ChromeTranslatorCreateOptions): Promise<ChromeTranslatorInstance>;
}

declare global {
    interface Window {
        Translator?: ChromeTranslatorConstructor;
        // 旧 API (フォールバック用)
        translation?: {
            canTranslate(options: { sourceLanguage: string; targetLanguage: string }): Promise<'no' | 'readily' | 'after-download'>;
            createTranslator(options: { sourceLanguage: string; targetLanguage: string }): Promise<{ translate(text: string): Promise<string> }>;
        };
    }
}

function getTargetLanguageLowerCase(): string {
    return navigator.language.split('-')[0].toLowerCase();
}

function isChromeDesktop(): boolean {
    const ua = navigator.userAgent;
    const isChrome = /Chrome/.test(ua) && !/Edge|Edg|OPR/.test(ua);
    const isDesktop = !/Android|iPhone|iPad|iPod/.test(ua);
    return isChrome && isDesktop;
}

async function checkChromeTranslatorApi(): Promise<ChromeApiStatus> {
    if (!isChromeDesktop()) {
        return 'unavailable';
    }

    // 新 API: Translator in self
    if ('Translator' in self && typeof (self as unknown as { Translator: ChromeTranslatorConstructor }).Translator?.availability === 'function') {
        try {
            const Translator = (self as unknown as { Translator: ChromeTranslatorConstructor }).Translator;
            const status = await Translator.availability({
                sourceLanguage: 'en',
                targetLanguage: getTargetLanguageLowerCase(),
            });
            if (status === 'available') return 'available';
            if (status === 'downloadable' || status === 'downloading') return 'downloadable';
        } catch {
            // fall through
        }
    }

    // 旧 API: window.translation (フォールバック)
    if (typeof window.translation !== 'undefined' && window.translation !== null) {
        try {
            const can = await window.translation.canTranslate({
                sourceLanguage: 'en',
                targetLanguage: getTargetLanguageLowerCase(),
            });
            if (can !== 'no') return 'available';
        } catch {
            return 'disabled';
        }
    }

    return 'disabled';
}

// Translator インスタンスをキャッシュして再利用（毎回 create するとモデル再ロードが走る）
let cachedTranslator: ChromeTranslatorInstance | null = null;
let cachedTargetLang = '';

async function getOrCreateTranslator(
    onProgress: (progress: DownloadProgress) => void
): Promise<ChromeTranslatorInstance> {
    const targetLang = getTargetLanguageLowerCase();

    if (cachedTranslator && cachedTargetLang === targetLang) {
        return cachedTranslator;
    }

    // 新 API
    if ('Translator' in self) {
        const Translator = (self as unknown as { Translator: ChromeTranslatorConstructor }).Translator!;
        const translator = await Translator.create({
            sourceLanguage: 'en',
            targetLanguage: targetLang,
            monitor(m) {
                m.addEventListener('downloadprogress', (e) => {
                    onProgress({ loaded: e.loaded, total: e.total || 1 });
                });
            },
        });
        cachedTranslator = translator;
        cachedTargetLang = targetLang;
        return translator;
    }

    // 旧 API フォールバック
    if (window.translation) {
        const translator = await window.translation.createTranslator({
            sourceLanguage: 'en',
            targetLanguage: targetLang,
        });
        // 旧 API は destroy なし
        cachedTranslator = { translate: (t) => translator.translate(t), destroy: () => {} };
        cachedTargetLang = targetLang;
        return cachedTranslator;
    }

    throw new Error('Chrome Translator API not available');
}

async function translateWithChrome(
    text: string,
    onProgress: (progress: DownloadProgress) => void
): Promise<string> {
    const translator = await getOrCreateTranslator(onProgress);
    return await translator.translate(text);
}

export function useTranslation(): UseTranslationReturn {
    const [isTranslating, setIsTranslating] = useState(false);
    const [chromeApiStatus, setChromeApiStatus] = useState<ChromeApiStatus>('unavailable');
    const [downloadProgress, setDownloadProgress] = useState<DownloadProgress | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        checkChromeTranslatorApi().then(setChromeApiStatus);
    }, []);

    const clearError = useCallback(() => setError(null), []);

    const translate = useCallback(async (text: string): Promise<string> => {
        setIsTranslating(true);
        setError(null);
        setDownloadProgress(null);

        try {
            const result = await translateWithChrome(text, (progress) => {
                setDownloadProgress(progress);
            });
            setDownloadProgress(null);
            return result;
        } catch (err) {
            const message = err instanceof Error ? err.message : '翻訳に失敗しました';
            setError(message);
            throw err;
        } finally {
            setIsTranslating(false);
        }
    }, []);

    return {
        translate,
        isTranslating,
        chromeApiStatus,
        downloadProgress,
        error,
        clearError,
    };
}
