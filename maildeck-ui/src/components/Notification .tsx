import { onMessage } from 'firebase/messaging';
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../contexts/ToastContext';
import { messaging } from '../firebase/firebaseConfig';

export default function NotificationListener() {
    const { info } = useToast();
    const navigate = useNavigate();

    useEffect(() => {
        const unsubscribe = onMessage(messaging, (payload) => {
            playNotificationSound();
            if (payload.notification) {
                const title = payload.notification.title || 'New Message';
                const body = payload.notification.body || '';
                info(`${title}: ${body}`);
            }
        });

        return () => { unsubscribe(); };
    }, [info]);

    // Tauri (Android) FCM通知ナビゲーション: 認証状態に依存せず早期に登録
    useEffect(() => {
        if (!('__TAURI__' in window)) return;

        let unlisten: (() => void) | null = null;
        import('@tauri-apps/api/core').then(({ addPluginListener, invoke }) => {
            addPluginListener<{ configId: string; messageId: string }>('fcm', 'navigation', (payload) => {
                if (payload.configId && payload.messageId) {
                    navigate(`/inbox?configId=${payload.configId}&messageId=${payload.messageId}`);
                }
            }).then(listener => {
                unlisten = () => listener.unregister();
                // リスナー登録完了をAndroidに通知 → 保留中ナビゲーションをemitしてもらう
                invoke('plugin:fcm|notifyListenerReady').catch(() => {});
            });
        });

        return () => { unlisten?.(); };
    }, []);

    return null;
}

const playNotificationSound = () => {
    try {
        const AudioContextClass = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!AudioContextClass) return;

        const ctx = new AudioContextClass();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.3);

        gain.gain.setValueAtTime(0.1, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);

        osc.start();
        osc.stop(ctx.currentTime + 0.3);
    } catch (e) {
        console.error("Failed to play notification sound", e);
    }
};
