export interface Label {
  id: string; // UUID
  userId: string;
  name: string;
  color: string; // HEX color (#RRGGBB)
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
