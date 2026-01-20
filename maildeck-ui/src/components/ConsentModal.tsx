import { useState, useEffect } from 'react';
import { useConsent } from '../contexts/ConsentContext';
import { useToast } from '../contexts/ToastContext';

export default function ConsentModal() {
    const { consentStatus, requiresConsent, submitConsent, isLoading } = useConsent();
    const toast = useToast();
    const [termsChecked, setTermsChecked] = useState(false);
    const [privacyChecked, setPrivacyChecked] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [termsContent, setTermsContent] = useState<string>('');
    const [privacyContent, setPrivacyContent] = useState<string>('');
    const [loadingContent, setLoadingContent] = useState(true);

    useEffect(() => {
        if (!requiresConsent || !consentStatus) return;

        const loadContent = async () => {
            setLoadingContent(true);
            try {
                const promises: Promise<Response>[] = [];

                if (consentStatus.requiresTermsOfServiceConsent) {
                    promises.push(fetch(`/legal/terms_of_service_${consentStatus.latestTermsOfServiceVersion}.txt`));
                }
                if (consentStatus.requiresPrivacyPolicyConsent) {
                    promises.push(fetch(`/legal/privacy_policy_${consentStatus.latestPrivacyPolicyVersion}.txt`));
                }

                const responses = await Promise.all(promises);
                let idx = 0;

                if (consentStatus.requiresTermsOfServiceConsent) {
                    const text = await responses[idx++].text();
                    setTermsContent(text);
                }
                if (consentStatus.requiresPrivacyPolicyConsent) {
                    const text = await responses[idx++].text();
                    setPrivacyContent(text);
                }
            } catch (error) {
                console.error('Failed to load legal documents:', error);
                toast.error('規約の読み込みに失敗しました');
            } finally {
                setLoadingContent(false);
            }
        };

        loadContent();
    }, [requiresConsent, consentStatus]);

    if (!requiresConsent || !consentStatus) return null;

    const canSubmit = (
        (!consentStatus.requiresTermsOfServiceConsent || termsChecked) &&
        (!consentStatus.requiresPrivacyPolicyConsent || privacyChecked) &&
        !isSubmitting &&
        !isLoading &&
        !loadingContent
    );

    const isUpdate = consentStatus.termsOfServiceConsentedVersion !== null ||
        consentStatus.privacyPolicyConsentedVersion !== null;

    const handleSubmit = async () => {
        setIsSubmitting(true);
        try {
            await submitConsent();
            toast.success('同意が記録されました。');
        } catch {
            toast.error('同意の記録に失敗しました。');
        } finally {
            setIsSubmitting(false);
        }
    };

    const renderContent = (content: string) => {
        return content.split('\n').map((line, index) => {
            if (line.startsWith('第') || /^\d+\./.test(line)) {
                return <p key={index} className="font-semibold mt-4 mb-2">{line}</p>;
            }
            if (line.startsWith('- ')) {
                return <p key={index} className="ml-4">{line}</p>;
            }
            if (line.trim() === '') {
                return <br key={index} />;
            }
            return <p key={index} className="mb-2">{line}</p>;
        });
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
                {/* Header */}
                <div className="p-6 border-b border-gray-200">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-brand-100 rounded-full flex items-center justify-center">
                            <svg className="w-5 h-5 text-brand-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                            </svg>
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-gray-900">
                                {isUpdate ? '利用規約の更新' : '利用規約への同意'}
                            </h2>
                            <p className="text-sm text-gray-500">
                                サービスをご利用いただくには、以下の内容への同意が必要です
                            </p>
                        </div>
                    </div>
                    {isUpdate && (
                        <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                            <p className="text-sm text-amber-800">
                                利用規約またはプライバシーポリシーが更新されました。内容をご確認の上、再度同意をお願いします。
                            </p>
                        </div>
                    )}
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    {loadingContent ? (
                        <div className="flex items-center justify-center py-8">
                            <svg className="animate-spin h-8 w-8 text-brand-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                        </div>
                    ) : (
                        <>
                            {/* Terms of Service */}
                            {consentStatus.requiresTermsOfServiceConsent && (
                                <div className="space-y-3">
                                    <div className="flex items-center justify-between">
                                        <h3 className="font-semibold text-gray-900">利用規約</h3>
                                        <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">
                                            {consentStatus.latestTermsOfServiceVersion}
                                        </span>
                                    </div>
                                    <div className="bg-gray-50 rounded-lg p-4 h-48 overflow-y-auto border border-gray-200 text-sm text-gray-700 leading-relaxed">
                                        {renderContent(termsContent)}
                                    </div>
                                    <label className="flex items-center gap-3 cursor-pointer group">
                                        <input
                                            type="checkbox"
                                            checked={termsChecked}
                                            onChange={(e) => setTermsChecked(e.target.checked)}
                                            className="w-5 h-5 rounded border-gray-300 text-brand-600 focus:ring-brand-500 cursor-pointer"
                                        />
                                        <span className="text-sm text-gray-700 group-hover:text-gray-900">
                                            利用規約に同意します
                                        </span>
                                    </label>
                                </div>
                            )}

                            {/* Privacy Policy */}
                            {consentStatus.requiresPrivacyPolicyConsent && (
                                <div className="space-y-3">
                                    <div className="flex items-center justify-between">
                                        <h3 className="font-semibold text-gray-900">プライバシーポリシー</h3>
                                        <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">
                                            {consentStatus.latestPrivacyPolicyVersion}
                                        </span>
                                    </div>
                                    <div className="bg-gray-50 rounded-lg p-4 h-48 overflow-y-auto border border-gray-200 text-sm text-gray-700 leading-relaxed">
                                        {renderContent(privacyContent)}
                                    </div>
                                    <label className="flex items-center gap-3 cursor-pointer group">
                                        <input
                                            type="checkbox"
                                            checked={privacyChecked}
                                            onChange={(e) => setPrivacyChecked(e.target.checked)}
                                            className="w-5 h-5 rounded border-gray-300 text-brand-600 focus:ring-brand-500 cursor-pointer"
                                        />
                                        <span className="text-sm text-gray-700 group-hover:text-gray-900">
                                            プライバシーポリシーに同意します
                                        </span>
                                    </label>
                                </div>
                            )}
                        </>
                    )}
                </div>

                {/* Footer */}
                <div className="p-6 border-t border-gray-200 bg-gray-50 rounded-b-xl">
                    <button
                        onClick={handleSubmit}
                        disabled={!canSubmit}
                        className="w-full px-6 py-3 bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-bold shadow-sm flex items-center justify-center gap-2"
                    >
                        {isSubmitting ? (
                            <>
                                <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                                <span>処理中...</span>
                            </>
                        ) : (
                            <>
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                </svg>
                                <span>同意して続ける</span>
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}
