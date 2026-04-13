import { fetchAuthSession } from 'aws-amplify/auth';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

const isTauri = (): boolean => typeof window !== 'undefined' && '__TAURI__' in window;

// ---- Tauri (Android) FCMトークン取得 ----
async function getTauriFcmToken(): Promise<string> {
    const { invoke } = await import('@tauri-apps/api/core');
    const result = await invoke<{ token: string | null }>('plugin:fcm|getFcmToken');
    if (!result.token) {
        throw new Error('FCM token not yet available. Please wait and retry.');
    }
    return result.token;
}

// ---- Web FCMトークン取得 (既存フロー) ----
async function getWebFcmToken(): Promise<string> {
    const { getToken } = await import('firebase/messaging');
    const { messaging } = await import('../firebase/firebaseConfig');

    await registerServiceWorker();

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
        throw new Error('Notification permission not granted');
    }

    const session = await fetchAuthSession();
    const id_token = session.tokens?.idToken?.toString();

    const response = await fetch(`${API_BASE_URL}/webpush/vapid-public-key`, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${id_token}` }
    });
    if (!response.ok) throw new Error('Failed to get VAPID public key');

    const { publicKey } = await response.json();
    return getToken(messaging, { vapidKey: publicKey });
}

export async function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        try {
            const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
            console.log('Service Worker registered with scope:', registration.scope);
            return registration;
        } catch (error) {
            console.error('Service Worker registration failed:', error);
            throw error;
        }
    }
    return null;
}

export async function subscribeToPush() {
    let token: string;
    let platform: 'android' | 'web';

    if (isTauri()) {
        token = await getTauriFcmToken();
        platform = 'android';
    } else {
        token = await getWebFcmToken();
        platform = 'web';
    }

    await saveSubscription(token, platform);
}

async function saveSubscription(token: string, platform: 'android' | 'web') {
    const session = await fetchAuthSession();
    const id_token = session.tokens?.idToken?.toString();

    const response = await fetch(`${API_BASE_URL}/webpush/subscribe`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${id_token}`
        },
        body: JSON.stringify({ token, platform, userAgent: navigator.userAgent })
    });

    if (!response.ok) {
        throw new Error('Failed to save subscription to backend');
    }
}
