export interface Label {
  id: string; // UUID
  userId: string;
  name: string;
  color: string; // HEX color (#RRGGBB)
  hideFromInbox: boolean; // When true, emails with this label won't appear in inbox
  notifyEnabled: boolean; // When false, new emails with this label won't trigger notifications
  createdAt: string;
  updatedAt: string;
}

export interface MailLabel {
  id: string; // UUID
  userId: string;
  messageId: string;
  labelId: string;
  serverConfigId: string;
  createdAt: string;
}

export interface AddLabelRequest {
  messageId: string;
  labelId: string;
  serverConfigId: string;
}

export interface LabelWithCount extends Label {
  messageCount: number; // Number of messages with this label (calculated client-side)
}
