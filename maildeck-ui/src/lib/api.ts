import { fetchAuthSession } from 'aws-amplify/auth';
import type { RuleConditions } from '../types/autoLabeling';

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
export async function getInbox(configId: string, page = 1) {
    const response = await authFetch(`/mail/inbox?configId=${configId}&page=${page}`);
    return await response.json();
}

/**
 * Get single message details
 */
export async function getMessage(configId: string, messageId: number) {
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
export async function updateServerConfig(id: string, config: any) {
    const response = await authFetch(`/serverconfig/${id}`, {
        method: 'PUT',
        body: JSON.stringify(config)
    });
    return await response.json();
}

/**
 * Delete server configuration
 */
export async function deleteServerConfig(id: string) {
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
export async function updateContact(id: string, name: string, email: string) {
    const response = await authFetch(`/contacts/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ name, email })
    });
    return await response.json();
}

// ============================================================================
// Labels API
// ============================================================================

/**
 * Get all labels for the authenticated user
 */
export async function getLabels() {
    const response = await authFetch('/labels');
    return await response.json();
}

/**
 * Create a new label
 */
export async function createLabel(name: string, color: string = '#3B82F6') {
    const response = await authFetch('/labels', {
        method: 'POST',
        body: JSON.stringify({ name, color })
    });
    return await response.json();
}

/**
 * Update an existing label
 */
export async function updateLabel(id: string, name: string, color: string) {
    const response = await authFetch(`/labels/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ name, color })
    });
    return await response.json();
}

/**
 * Delete a label
 */
export async function deleteLabel(id: string) {
    await authFetch(`/labels/${id}`, {
        method: 'DELETE'
    });
}

/**
 * Get all labels for a specific message
 */
export async function getLabelsForMessage(messageId: number, serverConfigId: string) {
    const response = await authFetch(`/labels/message/${messageId}?serverConfigId=${serverConfigId}`);
    return await response.json();
}

/**
 * Add a label to a message
 */
export async function addLabelToMessage(messageId: number, labelId: string, serverConfigId: string) {
    const response = await authFetch('/labels/message', {
        method: 'POST',
        body: JSON.stringify({ messageId, labelId, serverConfigId })
    });
    return await response.json();
}

/**
 * Remove a label from a message
 */
export async function removeLabelFromMessage(messageId: number, labelId: string, serverConfigId: string) {
    await authFetch(`/labels/message?messageId=${messageId}&labelId=${labelId}&serverConfigId=${serverConfigId}`, {
        method: 'DELETE'
    });
}

// ============================================================================
// Auto-Labeling Rules API
// ============================================================================

/**
 * Get all auto-labeling rules for the authenticated user
 */
export async function getAutoLabelingRules() {
    const response = await authFetch('/auto-labeling-rules');
    return await response.json();
}

/**
 * Create a new auto-labeling rule
 */
export async function createAutoLabelingRule(rule: {
    ruleName: string;
    labelId: string;
    priority: number;
    conditions: RuleConditions;
}) {
    const response = await authFetch('/auto-labeling-rules', {
        method: 'POST',
        body: JSON.stringify(rule)
    });
    return await response.json();
}

/**
 * Update an existing auto-labeling rule
 */
export async function updateAutoLabelingRule(id: string, rule: {
    ruleName: string;
    labelId: string;
    priority: number;
    isEnabled: boolean;
    conditions: RuleConditions;
}) {
    const response = await authFetch(`/auto-labeling-rules/${id}`, {
        method: 'PUT',
        body: JSON.stringify(rule)
    });
    return await response.json();
}

/**
 * Delete an auto-labeling rule
 */
export async function deleteAutoLabelingRule(id: string) {
    await authFetch(`/auto-labeling-rules/${id}`, {
        method: 'DELETE'
    });
}

/**
 * Toggle enabled/disabled state of an auto-labeling rule
 */
export async function toggleAutoLabelingRule(id: string) {
    const response = await authFetch(`/auto-labeling-rules/${id}/toggle`, {
        method: 'POST'
    });
    return await response.json();
}

// ============================================================================
// Custom Action Patterns API
// ============================================================================

/**
 * Get all custom action patterns for the authenticated user
 */
export async function getCustomActionPatterns() {
    const response = await authFetch('/custom-action-patterns');
    return await response.json();
}

/**
 * Create a new custom action pattern
 */
export async function createCustomActionPattern(pattern: {
    patternName: string;
    patternType: string;
    regexPattern: string;
    actionType: string;
    priority: number;
    description?: string;
    linkTemplate?: string;
}) {
    const response = await authFetch('/custom-action-patterns', {
        method: 'POST',
        body: JSON.stringify(pattern)
    });
    return await response.json();
}

/**
 * Update an existing custom action pattern
 */
export async function updateCustomActionPattern(id: string, pattern: {
    patternName: string;
    patternType: string;
    regexPattern: string;
    actionType: string;
    priority: number;
    isEnabled: boolean;
    description?: string;
    linkTemplate?: string;
}) {
    const response = await authFetch(`/custom-action-patterns/${id}`, {
        method: 'PUT',
        body: JSON.stringify(pattern)
    });
    return await response.json();
}

/**
 * Delete a custom action pattern
 */
export async function deleteCustomActionPattern(id: string) {
    await authFetch(`/custom-action-patterns/${id}`, {
        method: 'DELETE'
    });
}

/**
 * Toggle enabled/disabled state of a custom action pattern
 */
export async function toggleCustomActionPattern(id: string) {
    const response = await authFetch(`/custom-action-patterns/${id}/toggle`, {
        method: 'POST'
    });
    return await response.json();
}

// ============================================================================
// System Preset Patterns API
// ============================================================================

/**
 * Get all system preset patterns
 */
export async function getSystemPresetPatterns(category?: string) {
    const url = category
        ? `/system-preset-patterns?category=${encodeURIComponent(category)}`
        : '/system-preset-patterns';
    const response = await authFetch(url);
    return await response.json();
}

/**
 * Get all preset categories
 */
export async function getPresetCategories() {
    const response = await authFetch('/system-preset-patterns/categories');
    return await response.json();
}

/**
 * Import a single preset pattern
 */
export async function importPresetPattern(presetId: string) {
    const response = await authFetch(`/system-preset-patterns/${presetId}/import`, {
        method: 'POST'
    });
    return await response.json();
}

/**
 * Import multiple preset patterns at once
 */
export async function importMultiplePresetPatterns(presetIds: string[]) {
    const response = await authFetch('/system-preset-patterns/import-multiple', {
        method: 'POST',
        body: JSON.stringify(presetIds)
    });
    return await response.json();
}

// ============================================================================
// Pattern Usage Statistics API
// ============================================================================

/**
 * Record a pattern usage event
 */
export async function recordPatternUsage(patternId: string, actionType: string, matchedValue?: string) {
    const response = await authFetch('/pattern-usage-stats', {
        method: 'POST',
        body: JSON.stringify({ patternId, actionType, matchedValue })
    });
    return await response.json();
}

/**
 * Get pattern usage statistics
 */
export async function getPatternUsageStats(days: number = 30) {
    const response = await authFetch(`/pattern-usage-stats?days=${days}`);
    return await response.json();
}

/**
 * Get stats for a specific pattern
 */
export async function getPatternStats(patternId: string, days: number = 30) {
    const response = await authFetch(`/pattern-usage-stats/${patternId}?days=${days}`);
    return await response.json();
}
