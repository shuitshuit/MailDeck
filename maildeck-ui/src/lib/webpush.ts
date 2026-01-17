import { getToken } from "firebase/messaging";
import { messaging } from "../firebase/firebaseConfig"
import { fetchAuthSession } from 'aws-amplify/auth';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api'; // Match api.ts default

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
    const registration = await navigator.serviceWorker.ready;
    if (!registration) throw new Error('Service Worker not ready');

    // Explicitly request permission
    let permission = await Notification.requestPermission();
    if (permission !== 'granted') {
        permission = await Notification.requestPermission();
        if (permission !== 'granted') {
            throw new Error('Notification permission not granted');
        }
    }

    // 1. Get VAPID public key from backend
    const session = await fetchAuthSession();
    const id_token = session.tokens?.idToken?.toString();

    const response = await fetch(`${API_BASE_URL}/webpush/vapid-public-key`, {
        method: "GET",
        headers: {
            'Authorization': `Bearer ${id_token}`
        }
    });

    if (!response.ok) {
        throw new Error('Failed to get VAPID public key');
    }

    const { publicKey } = await response.json();

    const token = await getToken(messaging, {
        vapidKey: publicKey
    });

    // 3. Send subscription to backend
    await saveSubscription(token);
}

async function saveSubscription(token: string) {
    const body = {
        token: token,
        userAgent: navigator.userAgent
    };

    const session = await fetchAuthSession();
    const id_token = session.tokens?.idToken?.toString();

    const response = await fetch(`${API_BASE_URL}/webpush/subscribe`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${id_token}`
        },
        body: JSON.stringify(body)
    });

    if (!response.ok) {
        throw new Error('Failed to save subscription to backend');
    }
}
