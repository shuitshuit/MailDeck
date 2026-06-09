export interface BlockedSender {
    id: string;
    userId: string;
    emailAddress: string;
    note?: string;
    isEnabled: boolean;
    createdAt: string;
    updatedAt: string;
}

export interface CreateBlockedSenderRequest {
    emailAddress: string;
    note?: string;
}

export interface UpdateBlockedSenderRequest {
    emailAddress: string;
    note?: string;
    isEnabled: boolean;
}
