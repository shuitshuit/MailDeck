import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import Logo from '../components/Logo';

export default function PrivacyPage() {
    const [content, setContent] = useState<string>('');
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        window.scrollTo(0, 0);
        fetch('/legal/privacy_policy.md')
            .then(res => res.text())
            .then(text => {
                setContent(text);
                setLoading(false);
            })
            .catch(() => setLoading(false));
    }, []);

    return (
        <div className="min-h-screen bg-gray-50">
            {/* Header */}
            <header className="bg-white border-b border-gray-100">
                <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex items-center h-16">
                        <Link to="/welcome">
                            <Logo size="sm" />
                        </Link>
                    </div>
                </div>
            </header>

            {/* Content */}
            <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
                {loading ? (
                    <div className="text-gray-500">読み込み中...</div>
                ) : (
                    <article className="prose prose-gray max-w-none prose-headings:text-gray-900 prose-h1:text-3xl prose-h1:font-bold prose-h1:mb-8 prose-h2:text-xl prose-h2:font-semibold prose-h2:mt-8 prose-h2:mb-4 prose-p:text-gray-700 prose-p:leading-relaxed prose-li:text-gray-700">
                        <ReactMarkdown>{content}</ReactMarkdown>
                    </article>
                )}

                <div className="mt-12 pt-8 border-t border-gray-200">
                    <Link to="/welcome" className="text-brand-600 hover:text-brand-700 font-medium">
                        &larr; トップページに戻る
                    </Link>
                </div>
            </main>
        </div>
    );
}
