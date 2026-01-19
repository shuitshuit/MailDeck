import { onMessage } from 'firebase/messaging';
import { useEffect } from 'react';
import { useToast } from '../contexts/ToastContext';
import { messaging } from '../firebase/firebaseConfig';

export default function NotificationListener() {
    const { info } = useToast();

    useEffect(() => {
        const unsubscribe = onMessage(messaging, (payload) => {
            // Play sound
            playNotificationSound();

            // Show toast
            if (payload.notification) {
                const title = payload.notification.title || 'New Message';
                const body = payload.notification.body || '';
                info(`${title}: ${body}`);
            }
        });

        return () => {
            unsubscribe();
        };
    }, [info]);

    return null;
}

const playNotificationSound = () => {
    try {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        if (!AudioContextClass) return;

        const ctx = new AudioContextClass();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.connect(gain);
        gain.connect(ctx.destination);

        // Simple "ping" sound
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
