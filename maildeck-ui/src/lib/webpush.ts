
import { fetchAuthSession } from 'aws-amplify/auth';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api'; // Match api.ts default

export async function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        try {
            const registration = await navigator.serviceWorker.register('/sw.js');
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
    const registration = await navigator.serviceWorker.ready;
    if (!registration) throw new Error('Service Worker not ready');

    // Explicitly request permission
    var permission = await Notification.requestPermission();
    if (permission !== 'granted') {
        permission = await Notification.requestPermission();
        if (permission !== 'granted') {
            throw new Error('Notification permission not granted');
        }
    }

    // 1. Get VAPID public key from backend
    const session = await fetchAuthSession();
    const token = session.tokens?.idToken?.toString();

    const response = await fetch(`${API_BASE_URL}/webpush/vapid-public-key`, {
        method: "GET",
        // Include auth headers if endpoint is protected (it probably should be, but currently get key might be public)
        headers: {
            'Authorization': `Bearer ${token}`
        }
    });

    if (!response.ok) {
        throw new Error('Failed to get VAPID public key');
    }

    const { publicKey } = await response.json();

    // 2. Subscribe using PushManager
    const convertedVapidKey = urlBase64ToUint8Array(publicKey);
    const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: convertedVapidKey
    });

    // 3. Send subscription to backend
    await saveSubscription(subscription);

    return subscription;
}

async function saveSubscription(subscription: PushSubscription) {
    const p256dh = arrayBufferToBase64(subscription.getKey('p256dh'));
    const auth = arrayBufferToBase64(subscription.getKey('auth'));

    const body = {
        endpoint: subscription.endpoint,
        p256dh: p256dh,
        auth: auth,
        userAgent: navigator.userAgent
    };

    const session = await fetchAuthSession();
    const token = session.tokens?.idToken?.toString();

    const response = await fetch(`${API_BASE_URL}/webpush/subscribe`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(body)
    });

    if (!response.ok) {
        throw new Error('Failed to save subscription to backend');
    }
}

function urlBase64ToUint8Array(base64String: string) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding)
        .replace(/\-/g, '+')
        .replace(/_/g, '/');

    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
}

function arrayBufferToBase64(buffer: ArrayBuffer | null) {
    if (!buffer) return '';
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
}
