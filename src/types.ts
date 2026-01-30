// src/types.ts
// Type definitions for gmail-export

import type { RedactionCategory } from './sanitizer.js';

export interface SanitizeConfig {
    enabled: boolean;
    categories: RedactionCategory[];
}

export interface ExportConfig {
    // Query options
    query: string;
    maxMessages: number; // 0 = unlimited

    // Output options
    outputDir: string;
    outputPrefix: string;
    maxBytesPerFile: number;
    includeTimestamp: boolean;

    // Content options
    fields: ExportField[];
    bodyMaxChars: number;

    // Sanitization
    sanitize: SanitizeConfig;

    // Auth paths
    credentialsPath: string;
    tokenPath: string;
}

export type ExportField =
    | 'from_email'
    | 'from_name'
    | 'sender_domain'
    | 'reply_to'
    | 'reply_to_domain'
    | 'delivered_to'
    | 'to'
    | 'cc'
    | 'bcc'
    | 'subject'
    | 'snippet'
    | 'date'
    | 'message_id'
    | 'thread_id'
    | 'labels'
    | 'has_attachment'
    | 'attachment_types'
    | 'attachment_count'
    | 'has_list_unsubscribe'
    | 'body_text'
    | 'body_html';

export interface FieldInfo {
    name: ExportField;
    description: string;
    category: 'sender' | 'recipient' | 'content' | 'metadata' | 'attachments';
    default: boolean;
}

export const FIELD_DEFINITIONS: FieldInfo[] = [
    // Sender fields
    {
        name: 'from_email',
        description: 'Email address of the sender',
        category: 'sender',
        default: true,
    },
    {
        name: 'from_name',
        description: 'Display name of the sender (if available)',
        category: 'sender',
        default: true,
    },
    {
        name: 'sender_domain',
        description: 'Domain extracted from sender email (e.g., "gmail.com")',
        category: 'sender',
        default: true,
    },
    {
        name: 'reply_to',
        description: 'Reply-To email address (often different from From)',
        category: 'sender',
        default: false,
    },
    {
        name: 'reply_to_domain',
        description: 'Domain of the Reply-To address',
        category: 'sender',
        default: true,
    },

    // Recipient fields
    {
        name: 'delivered_to',
        description: 'Email address the message was delivered to',
        category: 'recipient',
        default: true,
    },
    {
        name: 'to',
        description: 'To header (may include multiple recipients)',
        category: 'recipient',
        default: false,
    },
    {
        name: 'cc',
        description: 'CC recipients',
        category: 'recipient',
        default: false,
    },
    {
        name: 'bcc',
        description: 'BCC recipients (rarely populated)',
        category: 'recipient',
        default: false,
    },

    // Content fields
    {
        name: 'subject',
        description: 'Email subject line',
        category: 'content',
        default: true,
    },
    {
        name: 'snippet',
        description: 'Short preview of email content (from Gmail)',
        category: 'content',
        default: true,
    },
    {
        name: 'body_text',
        description: 'Plain text body content (cleaned, URLs preserved)',
        category: 'content',
        default: false,
    },
    {
        name: 'body_html',
        description: 'Raw HTML body content',
        category: 'content',
        default: false,
    },

    // Metadata fields
    {
        name: 'date',
        description: 'Date header (when the email was sent)',
        category: 'metadata',
        default: false,
    },
    {
        name: 'message_id',
        description: 'Unique Message-ID header',
        category: 'metadata',
        default: false,
    },
    {
        name: 'thread_id',
        description: 'Gmail thread ID (groups conversations)',
        category: 'metadata',
        default: false,
    },
    {
        name: 'labels',
        description: 'Gmail labels applied to this message',
        category: 'metadata',
        default: false,
    },

    // Attachment fields
    {
        name: 'has_attachment',
        description: 'Whether the email has attachments (true/false)',
        category: 'attachments',
        default: true,
    },
    {
        name: 'attachment_types',
        description: 'File extensions of attachments (semicolon-separated)',
        category: 'attachments',
        default: true,
    },
    {
        name: 'attachment_count',
        description: 'Number of attachments',
        category: 'attachments',
        default: false,
    },
    {
        name: 'has_list_unsubscribe',
        description: 'Whether email has List-Unsubscribe header (newsletter indicator)',
        category: 'attachments',
        default: true,
    },
];

export const DEFAULT_FIELDS: ExportField[] = FIELD_DEFINITIONS.filter(
    (f) => f.default
).map((f) => f.name);

export const ALL_FIELDS: ExportField[] = FIELD_DEFINITIONS.map((f) => f.name);

export interface ExportStats {
    totalExported: number;
    totalTime: number;
    averageRate: number;
    filesCreated: string[];
}
