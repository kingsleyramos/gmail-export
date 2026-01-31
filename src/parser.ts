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
        s.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0]?.toLowerCase() ??
        '';
    const name = email ? s.replace(email, '').replace(/[<>"]/g, '').trim() : '';
    return {name, email};
}

export function domainFromEmail(email: string): string {
    const at = email.indexOf('@');
    return at >= 0 ? email.slice(at + 1).toLowerCase() : '';
}

export function getHeader(
    headers: gmail_v1.Schema$MessagePartHeader[] | undefined,
    name: string,
): string {
    const key = name.toLowerCase();
    const hit = (headers ?? []).find(
        (h) => (h.name ?? '').toLowerCase() === key,
    );
    return hit?.value ?? '';
}

export function collectAttachmentTypes(
    payload: gmail_v1.Schema$MessagePart | undefined,
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

        const looksLikeAttachment =
            filename.length > 0 && (!!attachmentId || size > 0);
        if (looksLikeAttachment) {
            count++;
            const ext = filename
                .toLowerCase()
                .match(/\.([a-z0-9]{1,10})$/)?.[1];
            if (ext) types.add(ext);
            else if (part.mimeType)
                types.add(String(part.mimeType).toLowerCase());
            else types.add('unknown');
        }

        const parts = part.parts ?? [];
        for (const p of parts) walk(p);
    };

    walk(payload);

    return {
        hasAttachment: types.size > 0,
        types: Array.from(types).sort(),
        count,
    };
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
            String.fromCodePoint(parseInt(h as string, 16)),
        )
        .replace(/&#([0-9]+);/g, (_, n) =>
            String.fromCodePoint(parseInt(n as string, 10)),
        )
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&quot;/gi, '"')
        .replace(/&apos;/gi, "'")
        .replace(/&zwnj;|&zwj;|&lrm;|&rlm;/gi, '');
}

// Clean text: remove invisible characters, junk, and normalize whitespace
export function cleanText(s: string): string {
    return (
        s
            // Remove CSS blocks that slipped through: { property: value; }
            .replace(/\{[^}]*\}/g, ' ')
            // Remove CSS-like property patterns: property: value;
            .replace(/[\w\-]+\s*:\s*[^;{}]+;/g, ' ')
            // Remove invisible/zero-width named HTML entities FIRST (before decoding)
            .replace(/&zwnj;|&zwj;|&lrm;|&rlm;|&ZeroWidthSpace;/gi, '')
            // Remove soft hyphen
            .replace(/&shy;/gi, '')
            // Remove invisible/zero-width Unicode characters
            // U+034F Combining Grapheme Joiner, U+200B-U+200D zero-width chars, U+FEFF BOM
            // U+00AD soft hyphen, U+2060 word joiner, U+180E Mongolian vowel separator
            // U+2028 line separator, U+2029 paragraph separator, U+202A-U+202E bidi controls
            .replace(
                /[\u034F\u200B-\u200F\u2028-\u202F\u2060\uFEFF\u00AD\u180E]/g,
                '',
            )
            // Remove any remaining HTML tags that slipped through
            .replace(/<[^>]+>/g, ' ')
            // Decode common named HTML entities
            .replace(/&nbsp;/gi, ' ')
            .replace(/&amp;/gi, '&')
            .replace(/&lt;/gi, '<')
            .replace(/&gt;/gi, '>')
            .replace(/&quot;/gi, '"')
            .replace(/&apos;/gi, "'")
            .replace(/&reg;/gi, '\u00AE') // ®
            .replace(/&copy;/gi, '\u00A9') // ©
            .replace(/&trade;/gi, '\u2122') // ™
            .replace(/&bull;/gi, '\u2022') // •
            .replace(/&middot;/gi, '\u00B7') // ·
            .replace(/&ndash;/gi, '\u2013') // –
            .replace(/&mdash;/gi, '\u2014') // —
            .replace(/&lsquo;/gi, '\u2018') // '
            .replace(/&rsquo;/gi, '\u2019') // '
            .replace(/&ldquo;/gi, '\u201C') // "
            .replace(/&rdquo;/gi, '\u201D') // "
            .replace(/&hellip;/gi, '\u2026') // …
            .replace(/&dagger;/gi, '\u2020') // †
            .replace(/&Dagger;/gi, '\u2021') // ‡
            // Decode accented characters
            .replace(/&aacute;/gi, '\u00E1') // á
            .replace(/&eacute;/gi, '\u00E9') // é
            .replace(/&iacute;/gi, '\u00ED') // í
            .replace(/&oacute;/gi, '\u00F3') // ó
            .replace(/&uacute;/gi, '\u00FA') // ú
            .replace(/&ntilde;/gi, '\u00F1') // ñ
            .replace(/&Aacute;/gi, '\u00C1') // Á
            .replace(/&Eacute;/gi, '\u00C9') // É
            .replace(/&Iacute;/gi, '\u00CD') // Í
            .replace(/&Oacute;/gi, '\u00D3') // Ó
            .replace(/&Uacute;/gi, '\u00DA') // Ú
            .replace(/&Ntilde;/gi, '\u00D1') // Ñ
            // Remove numeric HTML entities for invisible chars
            .replace(
                /&#8203;|&#x200B;|&#847;|&#x34F;|&#65279;|&#xFEFF;|&#173;|&#xAD;/gi,
                '',
            )
            // Decode remaining numeric HTML entities
            .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => {
                const code = parseInt(h as string, 16);
                // Skip control characters and invisible chars
                if (
                    code < 32 ||
                    (code >= 0x200b && code <= 0x200f) ||
                    code === 0x34f ||
                    code === 0xfeff ||
                    code === 0xad
                )
                    return '';
                return String.fromCodePoint(code);
            })
            .replace(/&#([0-9]+);/g, (_, n) => {
                const code = parseInt(n as string, 10);
                // Skip control characters and invisible chars
                if (
                    code < 32 ||
                    (code >= 0x200b && code <= 0x200f) ||
                    code === 0x34f ||
                    code === 0xfeff ||
                    code === 0xad
                )
                    return '';
                return String.fromCodePoint(code);
            })
            // Remove any remaining unrecognized HTML entities that look like invisible/formatting junk
            .replace(/&[a-z]{2,10};/gi, (match) => {
                // Keep only recognized entities that slipped through, remove unknown ones
                const keep = ['&amp;', '&lt;', '&gt;'];
                return keep.includes(match.toLowerCase()) ? match : ' ';
            })
            // Collapse multiple spaces/tabs to single space
            .replace(/[ \t]+/g, ' ')
            // Collapse multiple newlines to max 2
            .replace(/\n{3,}/g, '\n\n')
            // Trim each line
            .split('\n')
            .map((line) => line.trim())
            .join('\n')
            // Final trim
            .trim()
    );
}

// Convert HTML to plain text while preserving URLs
export function htmlToTextKeepingLinks(html: string): string {
    let s = html
        // Remove HTML comments
        .replace(/<!--[\s\S]*?-->/g, ' ')
        // Remove script, style, noscript, head, svg blocks entirely
        .replace(
            /<\s*(script|style|noscript|head|svg)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi,
            ' ',
        )
        // Remove inline CSS blocks (/* ... */)
        .replace(/\/\*[\s\S]*?\*\//g, ' ')
        // Remove CSS rule blocks: .class { ... } or #id { ... } or element { ... }
        .replace(/[.#]?[\w\-]+\s*\{[^}]*\}/g, ' ')
        // Remove @media queries (including nested braces)
        .replace(/@media[^{]*\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/gi, ' ')
        // Remove @keyframes and other @rules
        .replace(/@[\w\-]+[^{]*\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/gi, ' ')
        // Remove any remaining CSS-like patterns
        .replace(/[\w\-]+\s*:\s*[^;{}]+;/g, ' ')
        // Remove HTML attribute fragments like width=""1"" height=""1""
        .replace(/\w+\s*=\s*""[^""]*""/g, ' ')
        // Remove standalone HTML attribute-like content
        .replace(
            /(?:width|height|border|style|class|id|align|valign|bgcolor|cellpadding|cellspacing)\s*=\s*["'][^"']*["']/gi,
            ' ',
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
        .replace(/<\s*li\s*>/gi, '\u2022 ');

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
    maxChars: number,
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

    // Clean the text (remove invisible chars, collapse spaces, etc.)
    out = cleanText(out);

    if (maxChars > 0 && out.length > maxChars) {
        out = out.slice(0, maxChars);
    }

    return out;
}

// Extract raw HTML body
export function extractBodyHtml(
    payload: gmail_v1.Schema$MessagePart | undefined,
    maxChars: number,
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
