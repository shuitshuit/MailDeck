import { useEffect, useState } from 'react';
import { disconnectGoogleIntegration, getGoogleIntegration, startGoogleIntegration } from '../lib/api';
import type { GoogleIntegrationStatus } from '../lib/api';
import { useToast } from '../contexts/ToastContext';
import { useConfirm } from '../contexts/ConfirmContext';

/**
 * Settings card for the Google Calendar / Tasks integration used by
 * "予定・ToDoに追加" in the mail detail view. Separate from the Gmail mail accounts.
 */
export default function GoogleIntegrationCard() {
    const [status, setStatus] = useState<GoogleIntegrationStatus | null>(null);
    const [busy, setBusy] = useState(false);
    const toast = useToast();
    const { confirm } = useConfirm();

    const load = async () => {
        try {
            setStatus(await getGoogleIntegration());
        } catch (err) {
            console.error('Failed to load Google integration status', err);
        }
    };

    useEffect(() => {
        load();

        // 同意画面から戻ってきたときの結果表示 (?google_integration=success|error&detail=...)
        const params = new URLSearchParams(window.location.search);
        const result = params.get('google_integration');
        if (!result) return;

        const detail = params.get('detail');
        if (result === 'success') {
            toast.success(`Googleカレンダー / ToDoを連携しました${detail ? ` (${detail})` : ''}`);
        } else {
            toast.error(`Googleカレンダー / ToDoの連携に失敗しました${detail ? ` (${detail})` : ''}`);
        }

        params.delete('google_integration');
        params.delete('detail');
        const query = params.toString();
        window.history.replaceState({}, '', `${window.location.pathname}${query ? `?${query}` : ''}`);
        // 初回マウント時だけ実行する
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    if (!status?.available) return null;

    const handleConnect = async () => {
        setBusy(true);
        try {
            window.location.href = await startGoogleIntegration();
        } catch (err) {
            console.error(err);
            toast.error('Google連携を開始できませんでした');
            setBusy(false);
        }
    };

    const handleDisconnect = async () => {
        const confirmed = await confirm({
            title: 'Google連携を解除',
            message: 'Googleカレンダー / ToDoとの連携を解除しますか？登録済みの予定やToDoは削除されません。',
            confirmText: '解除',
            cancelText: 'キャンセル',
            type: 'danger',
        });
        if (!confirmed) return;

        setBusy(true);
        try {
            await disconnectGoogleIntegration();
            await load();
            toast.success('Google連携を解除しました');
        } catch (err) {
            console.error(err);
            toast.error('解除に失敗しました');
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="mt-8">
            <h3 className="text-base font-semibold text-gray-800 mb-1">Google カレンダー / ToDo 連携</h3>
            <p className="text-sm text-gray-500 mb-3">
                メールから検出した予定やToDoを登録するために使います。メールアカウントとは別の連携です。
            </p>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-lg border border-gray-200 p-4">
                <div className="text-sm">
                    {status.connected ? (
                        <>
                            <span className="inline-block rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-800 mr-2">連携中</span>
                            <span className="text-gray-700 break-all">{status.email}</span>
                        </>
                    ) : (
                        <span className="text-gray-600">未連携</span>
                    )}
                </div>
                <div className="flex gap-2 shrink-0">
                    {status.connected && (
                        <button
                            onClick={handleDisconnect}
                            disabled={busy}
                            className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                        >
                            解除
                        </button>
                    )}
                    <button
                        onClick={handleConnect}
                        disabled={busy}
                        className="rounded-lg bg-brand-600 px-3 py-2 text-sm text-white hover:bg-brand-700 disabled:opacity-50"
                    >
                        {status.connected ? '再連携' : 'Googleと連携'}
                    </button>
                </div>
            </div>
        </div>
    );
}
