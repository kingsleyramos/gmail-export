// src/parser.ts
// Email parsing and extraction utilities

import type {gmail_v1} from 'googleapis';

export function parseEmail(raw: string): {name: string; email: string} {
    const s = (raw ?? '').trim();
    const m = s.match(/^(.*)<([^>]+)>$/);
    if (m?.[1] && m?.[2]) {
        return {
            name: m[1].replace(/"/g, '').trim(),
            email: m[2].trim().toLowerCase(),
        };
    }
    const email =
        s.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0]?.toLowerCase() ?? '';
    const name = email ? s.replace(email, '').replace(/[<>"]/g, '').trim() : '';
    return {name, email};
}

export function domainFromEmail(email: string): string {
    const at = email.indexOf('@');
    return at >= 0 ? email.slice(at + 1).toLowerCase() : '';
}

export function getHeader(
    headers: gmail_v1.Schema$MessagePartHeader[] | undefined,
    name: string
): string {
    const key = name.toLowerCase();
    const hit = (headers ?? []).find((h) => (h.name ?? '').toLowerCase() === key);
    return hit?.value ?? '';
}

export function collectAttachmentTypes(
    payload: gmail_v1.Schema$MessagePart | undefined
): {
    hasAttachment: boolean;
    types: string[];
    count: number;
} {
    const types = new Set<string>();
    let count = 0;

    const walk = (part: gmail_v1.Schema$MessagePart | undefined) => {
        if (!part) return;

        const filename = (part.filename ?? '').trim();
        const attachmentId = part.body?.attachmentId ?? undefined;
        const size = typeof part.body?.size === 'number' ? part.body.size : 0;

        const looksLikeAttachment = filename.length > 0 && (!!attachmentId || size > 0);
        if (looksLikeAttachment) {
            count++;
            const ext = filename.toLowerCase().match(/\.([a-z0-9]{1,10})$/)?.[1];
            if (ext) types.add(ext);
            else if (part.mimeType) types.add(String(part.mimeType).toLowerCase());
            else types.add('unknown');
        }

        const parts = part.parts ?? [];
        for (const p of parts) walk(p);
    };

    walk(payload);

    return {hasAttachment: types.size > 0, types: Array.from(types).sort(), count};
}

// Base64 URL decoding
export function decodeBase64Url(data: string): string {
    const b64 = data.replace(/-/g, '+').replace(/_/g, '/');
    const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4));
    return Buffer.from(b64 + pad, 'base64').toString('utf8');
}

// HTML entity decoding
export function decodeHtmlEntities(s: string): string {
    return s
        .replace(/&#x([0-9a-fA-F]+);/g, (_, h) =>
            String.fromCodePoint(parseInt(h as string, 16))
        )
        .replace(/&#([0-9]+);/g, (_, n) => String.fromCodePoint(parseInt(n as string, 10)))
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&quot;/gi, '"')
        .replace(/&apos;/gi, "'")
        .replace(/&zwnj;|&zwj;|&lrm;|&rlm;/gi, '');
}

// Convert HTML to plain text while preserving URLs
export function htmlToTextKeepingLinks(html: string): string {
    let s = html
        .replace(/<!--[\s\S]*?-->/g, ' ')
        .replace(
            /<\s*(script|style|noscript|head|svg)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi,
            ' '
        );

    // Convert links to "text (url)"
    s = s.replace(/<a\b([^>]*?)>([\s\S]*?)<\/a>/gi, (_full, attrs, inner) => {
        const a = String(attrs);
        const href =
            a.match(/\bhref\s*=\s*"([^"]+)"/i)?.[1] ??
            a.match(/\bhref\s*=\s*'([^']+)'/i)?.[1] ??
            a.match(/\bhref\s*=\s*([^\s>]+)/i)?.[1] ??
            '';

        const innerText = String(inner)
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();

        if (!href) return innerText || 'link';
        if (!innerText) return href;
        if (innerText.includes(href)) return innerText;
        return `${innerText} (${href})`;
    });

    // Preserve some structure
    s = s
        .replace(/<\s*br\s*\/?>/gi, '\n')
        .replace(/<\s*\/p\s*>/gi, '\n\n')
        .replace(/<\s*\/div\s*>/gi, '\n')
        .replace(/<\s*\/li\s*>/gi, '\n')
        .replace(/<\s*li\s*>/gi, '• ');

    // Strip tags
    s = s.replace(/<[^>]+>/g, ' ');

    // Decode HTML entities
    s = decodeHtmlEntities(s);

    // Normalize whitespace
    s = s
        .split('\n')
        .map((line) => line.replace(/\s+/g, ' ').trim())
        .join('\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();

    return s;
}

// Extract plain text body from email
export function extractBodyText(
    payload: gmail_v1.Schema$MessagePart | undefined,
    maxChars: number
): string {
    const plainParts: string[] = [];
    const htmlParts: string[] = [];

    const walk = (part: gmail_v1.Schema$MessagePart | undefined) => {
        if (!part) return;

        const filename = (part.filename ?? '').trim();
        const isAttachment = filename.length > 0 || !!part.body?.attachmentId;

        const mimeType = String(part.mimeType ?? '').toLowerCase();
        const data = part.body?.data ?? '';

        if (!isAttachment && data) {
            const text = decodeBase64Url(data);
            if (mimeType === 'text/plain') plainParts.push(text);
            else if (mimeType === 'text/html') htmlParts.push(text);
        }

        const parts = part.parts ?? [];
        for (const p of parts) walk(p);
    };

    walk(payload);

    let out = plainParts.join('\n').trim();
    if (!out) {
        const html = htmlParts.join('\n').trim();
        out = html ? htmlToTextKeepingLinks(html) : '';
    }

    if (maxChars > 0 && out.length > maxChars) {
        out = out.slice(0, maxChars);
    }

    return out;
}

// Extract raw HTML body
export function extractBodyHtml(
    payload: gmail_v1.Schema$MessagePart | undefined,
    maxChars: number
): string {
    const htmlParts: string[] = [];

    const walk = (part: gmail_v1.Schema$MessagePart | undefined) => {
        if (!part) return;

        const filename = (part.filename ?? '').trim();
        const isAttachment = filename.length > 0 || !!part.body?.attachmentId;

        const mimeType = String(part.mimeType ?? '').toLowerCase();
        const data = part.body?.data ?? '';

        if (!isAttachment && data && mimeType === 'text/html') {
            htmlParts.push(decodeBase64Url(data));
        }

        const parts = part.parts ?? [];
        for (const p of parts) walk(p);
    };

    walk(payload);

    let out = htmlParts.join('\n').trim();

    if (maxChars > 0 && out.length > maxChars) {
        out = out.slice(0, maxChars);
    }

    return out;
}
