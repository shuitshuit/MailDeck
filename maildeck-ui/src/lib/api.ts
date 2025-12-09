import { fetchAuthSession } from 'aws-amplify/auth';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

/**
 * Helper to make authenticated API requests
 */
async function authFetch(endpoint: string, options: RequestInit = {}) {
    const session = await fetchAuthSession();
    const token = session.tokens?.idToken?.toString();

    if (!token) {
        throw new Error('No authentication token found');
    }

    const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        ...options.headers,
    };

    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        ...options,
        headers,
    });

    if (!response.ok) {
        throw new Error(`API call failed: ${response.statusText}`);
    }

    return response;
}

/**
 * Sync logged-in user with backend
 */
export async function syncUser() {
    try {
        await authFetch('/users/sync', {
            method: 'POST',
        });
        console.log('User synced successfully');
    } catch (error) {
        console.error('Failed to sync user:', error);
        // Don't throw, just log. We don't want to block the UI if sync fails silently? 
        // Or maybe we should allow it to be handled by caller. 
        // For now, log it is sufficient.
    }
}

/**
 * Get server configurations
 */
export async function getServerConfigs() {
    const response = await authFetch('/serverconfig');
    return await response.json();
}

/**
 * Get inbox messages
 */
export async function getInbox(configId: number, page = 1) {
    const response = await authFetch(`/mail/inbox?configId=${configId}&page=${page}`);
    return await response.json();
}

/**
 * Get single message details
 */
export async function getMessage(configId: number, messageId: string) {
    const response = await authFetch(`/mail/message/${messageId}?configId=${configId}`);
    return await response.json();
}

/**
 * Add a new server configuration
 */
export async function addServerConfig(config: any) {
    const response = await authFetch('/serverconfig', {
        method: 'POST',
        body: JSON.stringify(config)
    });
    return await response.json();
}

/**
 * Auto-discover server settings
 */
export async function autoConfig(email: string) {
    const response = await authFetch('/serverconfig/autoconfig', {
        method: 'POST',
        body: JSON.stringify(email)
    });
    return await response.json();
}

/**
 * Update server configuration
 */
export async function updateServerConfig(id: number, config: any) {
    const response = await authFetch(`/serverconfig/${id}`, {
        method: 'PUT',
        body: JSON.stringify(config)
    });
    return await response.json();
}

/**
 * Delete server configuration
 */
export async function deleteServerConfig(id: number) {
    await authFetch(`/serverconfig/${id}`, {
        method: 'DELETE'
    });
}

/**
 * Get all contacts
 */
export async function getContacts() {
    const response = await authFetch('/contacts');
    return await response.json();
}

/**
 * Update contact
 */
export async function updateContact(id: number, name: string, email: string) {
    const response = await authFetch(`/contacts/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ name, email })
    });
    return await response.json();
}
