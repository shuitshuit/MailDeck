import { fetchAuthSession } from 'aws-amplify/auth';
import type { RuleConditions } from '../types/autoLabeling';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

/**
 * Helper to make authenticated API requests
 */
async function authFetch(endpoint: string, options: RequestInit = {}, skipContentType = false) {
    const session = await fetchAuthSession();
    const token = session.tokens?.accessToken?.toString();

    if (!token) {
        throw new Error('No authentication token found');
    }

    const headers: Record<string, string> = {
        'Authorization': `Bearer ${token}`,
        ...(options.headers as Record<string, string>),
    };

    if (!skipContentType) {
        headers['Content-Type'] = 'application/json';
    }

    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        ...options,
        headers,
    });

    if (!response.ok) {
        const errorText = await response.text().catch(() => response.statusText);
        throw new Error(errorText || `API call failed: ${response.statusText}`);
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
export async function getInbox(configId: string, page = 1, pageSize?: number) {
    const params = new URLSearchParams({ configId, page: String(page) });
    if (pageSize !== undefined) params.set('pageSize', String(pageSize));
    const response = await authFetch(`/mail/inbox?${params}`);
    return await response.json();
}

/**
 * Get messages from a specific folder
 */
export async function getInboxFolder(configId: string, folderName: string, page = 1, pageSize?: number) {
    const params = new URLSearchParams({ configId, page: String(page) });
    if (pageSize !== undefined) params.set('pageSize', String(pageSize));
    const response = await authFetch(`/mail/inbox/${encodeURIComponent(folderName)}?${params}`);
    return await response.json();
}

/**
 * Send an email
 */
export async function sendMail(params: {
    configId: string;
    to: string;
    subject: string;
    body: string;
    cc?: string;
    bcc?: string;
    replyTo?: string;
    attachments?: File[];
}) {
    const formData = new FormData();
    formData.append('configId', params.configId);
    formData.append('to', params.to);
    formData.append('subject', params.subject);
    formData.append('body', params.body);
    formData.append('cc', params.cc ?? '');
    formData.append('bcc', params.bcc ?? '');
    formData.append('replyTo', params.replyTo ?? '');
    params.attachments?.forEach(file => formData.append('attachments', file));

    await authFetch('/mail/send', { method: 'POST', body: formData }, true);
}

/**
 * Download an attachment from a message
 */
export async function downloadAttachment(
    configId: string,
    messageId: string | number,
    partIndex: number,
    fileName: string
): Promise<void> {
    const session = await fetchAuthSession();
    const token = session.tokens?.accessToken?.toString();
    if (!token) throw new Error('No authentication token found');

    const response = await fetch(
        `${API_BASE_URL}/mail/attachment/${messageId}/${partIndex}?configId=${configId}`,
        { headers: { 'Authorization': `Bearer ${token}` } }
    );

    if (!response.ok) {
        const text = await response.text().catch(() => response.statusText);
        throw new Error(text || 'ダウンロードに失敗しました');
    }

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

/**
 * Get single message details
 */
export async function getMessage(configId: string, messageId: number) {
    const response = await authFetch(`/mail/message/${messageId}?configId=${configId}`);
    return await response.json();
}

/**
 * Delete a message
 */
export async function deleteMessage(configId: string, messageId: number) {
    await authFetch(`/mail/message/${messageId}?configId=${configId}`, {
        method: 'DELETE'
    });
}

/**
 * Mark a message as read on the IMAP server
 */
export async function markAsRead(configId: string, messageId: number) {
    await authFetch(`/mail/message/${messageId}/mark-read?configId=${configId}`, {
        method: 'PUT'
    });
}

/**
 * Mark multiple messages as read in a single IMAP connection
 */
export async function bulkMarkAsRead(configId: string, messageIds: string[]) {
    await authFetch(`/mail/messages/mark-read`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ configId, messageIds })
    });
}

/**
 * Move a message to trash
 */
export async function moveToTrash(configId: string, messageId: number) {
    const response = await authFetch(`/mail/move-to-trash/${messageId}?configId=${configId}`, {
        method: 'PUT'
    });
    return await response.json();
}

/**
 * Get mail folders
 */
export async function getFolders(configId: string, forceSync = false) {
    const response = await authFetch(`/mail/folders?configId=${configId}&forceSync=${forceSync}`);
    return await response.json();
}

/**
 * Sync mail folders (force refresh from IMAP)
 */
export async function syncFolders(configId: string) {
    const response = await authFetch(`/mail/folders/sync?configId=${configId}`, {
        method: 'POST'
    });
    return await response.json();
}

/**
 * Get drafts
 */
export async function getDrafts(configId: string, page = 1, pageSize?: number) {
    const params = new URLSearchParams({ configId, page: String(page) });
    if (pageSize !== undefined) params.set('pageSize', String(pageSize));
    const response = await authFetch(`/mail/drafts?${params}`);
    return await response.json();
}

/**
 * Save a draft
 */
export async function saveDraft(draft: { to?: string; subject?: string; body?: string; configId: string }) {
    const response = await authFetch('/mail/draft', {
        method: 'POST',
        body: JSON.stringify(draft)
    });
    return await response.json();
}

/**
 * Get a single draft
 */
export async function getDraft(configId: string, draftId: number) {
    const response = await authFetch(`/mail/draft/${draftId}?configId=${configId}`);
    return await response.json();
}

/**
 * Update a draft
 */
export async function updateDraft(configId: string, draftId: number, draft: { to?: string; subject?: string; body?: string }) {
    const response = await authFetch(`/mail/draft/${draftId}?configId=${configId}`, {
        method: 'PUT',
        body: JSON.stringify({ ...draft, configId })
    });
    return await response.json();
}

/**
 * Delete a draft
 */
export async function deleteDraft(configId: string, draftId: number) {
    await authFetch(`/mail/draft/${draftId}?configId=${configId}`, {
        method: 'DELETE'
    });
}

/**
 * Send a draft
 */
export async function sendDraft(configId: string, draftId: number) {
    const response = await authFetch(`/mail/draft/send/${draftId}?configId=${configId}`, {
        method: 'POST'
    });
    return await response.json();
}

/**
 * Get spam messages
 */
export async function getSpam(configId: string, page = 1, pageSize?: number) {
    const params = new URLSearchParams({ configId, page: String(page) });
    if (pageSize !== undefined) params.set('pageSize', String(pageSize));
    const response = await authFetch(`/mail/spam?${params}`);
    return await response.json();
}

/**
 * Get trash messages
 */
export async function getTrash(configId: string, page = 1, pageSize?: number) {
    const params = new URLSearchParams({ configId, page: String(page) });
    if (pageSize !== undefined) params.set('pageSize', String(pageSize));
    const response = await authFetch(`/mail/trash?${params}`);
    return await response.json();
}

/**
 * Permanently delete a message from trash
 */
export async function deleteFromTrash(configId: string, messageId: number) {
    const response = await authFetch(`/mail/trash/${messageId}?configId=${configId}`, {
        method: 'DELETE'
    });
    return await response.json();
}

/**
 * Restore a message from trash to inbox
 */
export async function restoreFromTrash(configId: string, messageId: number) {
    const response = await authFetch(`/mail/trash/restore/${messageId}?configId=${configId}`, {
        method: 'PUT'
    });
    return await response.json();
}

/**
 * Empty all messages from trash for a specific account
 */
export async function emptyTrash(configId: string) {
    const response = await authFetch(`/mail/trash?configId=${configId}`, {
        method: 'DELETE'
    });
    return await response.json();
}

// ============================================================================
// Bulk Operations API
// ============================================================================

/**
 * Move multiple messages to trash
 */
export async function bulkMoveToTrash(configId: string, messageIds: number[], sourceFolder?: string) {
    const response = await authFetch('/mail/bulk/move-to-trash', {
        method: 'POST',
        body: JSON.stringify({ configId, messageIds, sourceFolder })
    });
    return await response.json();
}

/**
 * Permanently delete multiple messages from trash
 */
export async function bulkDeleteFromTrash(configId: string, messageIds: number[]) {
    const response = await authFetch('/mail/bulk/delete-from-trash', {
        method: 'POST',
        body: JSON.stringify({ configId, messageIds })
    });
    return await response.json();
}

/**
 * Restore multiple messages from trash to inbox
 */
export async function bulkRestoreFromTrash(configId: string, messageIds: number[]) {
    const response = await authFetch('/mail/bulk/restore-from-trash', {
        method: 'POST',
        body: JSON.stringify({ configId, messageIds })
    });
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
        body: JSON.stringify({ email })
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
export async function createLabel(name: string, color: string = '#3B82F6', hideFromInbox: boolean = false, notifyEnabled: boolean = true) {
    const response = await authFetch('/labels', {
        method: 'POST',
        body: JSON.stringify({ name, color, hideFromInbox, notifyEnabled })
    });
    return await response.json();
}

/**
 * Update an existing label
 */
export async function updateLabel(id: string, name: string, color: string, hideFromInbox: boolean, notifyEnabled: boolean) {
    const response = await authFetch(`/labels/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ name, color, hideFromInbox, notifyEnabled })
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
    regexPatterns?: { patterns: { regex: string; nextOperator?: string }[] };
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
    regexPatterns?: { patterns: { regex: string; nextOperator?: string }[] };
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

// ============================================================================
// Consent API
// ============================================================================

export interface ConsentStatus {
    termsOfServiceConsented: boolean;
    termsOfServiceConsentedVersion: string | null;
    termsOfServiceConsentedAt: string | null;
    privacyPolicyConsented: boolean;
    privacyPolicyConsentedVersion: string | null;
    privacyPolicyConsentedAt: string | null;
    latestTermsOfServiceVersion: string;
    latestPrivacyPolicyVersion: string;
    requiresTermsOfServiceConsent: boolean;
    requiresPrivacyPolicyConsent: boolean;
}

/**
 * Get current consent status
 */
export async function getConsentStatus(): Promise<ConsentStatus> {
    const response = await authFetch('/consent/status');
    return await response.json();
}

/**
 * Record consent for terms of service and/or privacy policy
 */
export async function recordConsent(termsOfService: boolean, privacyPolicy: boolean): Promise<ConsentStatus> {
    const response = await authFetch('/consent', {
        method: 'POST',
        body: JSON.stringify({ termsOfService, privacyPolicy })
    });
    return await response.json();
}

// ============================================================================
// Translation API
// ============================================================================

export interface TranslateRequest {
    text: string;
    targetLang: string;
}

export interface TranslateResponse {
    translatedText: string;
    detectedSourceLang: string;
}

/**
 * Translate text using DeepL API (backend)
 */
export async function translateText(request: TranslateRequest): Promise<TranslateResponse> {
    const response = await authFetch('/translate', {
        method: 'POST',
        body: JSON.stringify(request)
    });
    return await response.json();
}
