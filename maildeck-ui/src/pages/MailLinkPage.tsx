import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { resolveMailLink } from '../lib/api';

/**
 * /m/:linkId — durable link to a mail (pasted into calendar events / tasks).
 * Resolves the link to the mail's current IMAP UID and hands off to the inbox's
 * existing ?configId=&messageId= deep link, which opens the mail detail modal.
 */
export default function MailLinkPage() {
    const { linkId } = useParams<{ linkId: string }>();
    const navigate = useNavigate();
    const [error, setError] = useState<{ title: string; detail?: string } | null>(null);

    useEffect(() => {
        if (!linkId) return;
        let cancelled = false;

        resolveMailLink(linkId)
            .then(result => {
                if (cancelled) return;
                if (result.status === 'found') {
                    const params = new URLSearchParams({ configId: result.configId, messageId: String(result.messageId) });
                    navigate(`/inbox?${params.toString()}`, { replace: true });
                } else if (result.status === 'message_not_found') {
                    setError({
                        title: 'メールが見つかりません',
                        detail: `${result.subject ? `「${result.subject}」は` : 'このメールは'}受信箱から移動または削除された可能性があります。`,
                    });
                } else {
                    setError({ title: 'リンクが無効です', detail: 'リンクが存在しないか、このアカウントのものではありません。' });
                }
            })
            .catch(err => {
                console.error('Failed to resolve mail link', err);
                if (!cancelled) setError({ title: 'メールを開けませんでした', detail: 'メールサーバーに接続できませんでした。時間をおいて再度お試しください。' });
            });

        return () => { cancelled = true; };
    }, [linkId, navigate]);

    if (!error) {
        return <div className="flex h-64 items-center justify-center text-gray-500">メールを開いています...</div>;
    }

    return (
        <div className="mx-auto max-w-md px-4 py-16 text-center">
            <h1 className="text-lg font-semibold text-gray-800">{error.title}</h1>
            {error.detail && <p className="mt-2 text-sm text-gray-600">{error.detail}</p>}
            <Link to="/inbox" className="mt-6 inline-block rounded-md bg-brand-600 px-4 py-2 text-sm text-white hover:bg-brand-700">
                受信箱へ
            </Link>
        </div>
    );
}
