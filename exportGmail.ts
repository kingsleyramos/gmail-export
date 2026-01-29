// exportGmail_v2_with_body_split.ts
// Exports Gmail metadata + cleaned plain-text body, splits CSV into ~250MB parts.
// Fixes TS typing issues by (1) using explicit gmail_v1 types and (2) avoiding optional chaining pitfalls.

import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import {google, gmail_v1} from 'googleapis';

/* =======================
   CONFIG
======================= */

const SCOPES = ['https://www.googleapis.com/auth/gmail.readonly'];
const CREDENTIALS_PATH = path.join(process.cwd(), 'credentials.json');
const TOKEN_PATH = path.join(process.cwd(), 'token.json');

const OUTPUT_BASENAME = 'gmail_export_part';
const MAX_BYTES_PER_FILE = 250 * 1024 * 1024; // 250MB

// Received mail only by default
const QUERY = '-in:sent -in:spam -in:trash';

// Optional: test limit (0 = unlimited)
const MAX_MESSAGES = 0;

// Keep files manageable (0 = unlimited, but size can explode)
const BODY_MAX_CHARS = 8000;

// Progress logging
const LOG_EVERY = 250;
const SPEED_WINDOW = 6;

/* =======================
   CSV
======================= */

const CSV_HEADERS = [
    'from_email',
    'from_name',
    'sender_domain',
    'reply_to_domain',
    'delivered_to',
    'subject',
    'snippet',
    'has_attachment',
    'attachment_types',
    'has_list_unsubscribe',
    'body_text',
];

function csvEscape(value: string): string {
    const v = (value ?? '').replace(/\r?\n/g, ' ').trim();
    if (/[",]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
    return v;
}

/* =======================
   AUTH
======================= */

function loadCredentials(): {
    client_id: string;
    client_secret: string;
    redirect_uris: string[];
} {
    const json = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf8'));
    const c = json.installed ?? json.web;

    if (!c?.client_id || !c?.client_secret || !c?.redirect_uris?.length) {
        throw new Error(
            'Invalid credentials.json. Download an OAuth Desktop client JSON and name it credentials.json'
        );
    }

    return {
        client_id: c.client_id,
        client_secret: c.client_secret,
        redirect_uris: c.redirect_uris,
    };
}

async function prompt(question: string): Promise<string> {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });
    return new Promise((resolve) =>
        rl.question(question, (a) => {
            rl.close();
            resolve(a.trim());
        })
    );
}

async function authorize() {
    const {client_id, client_secret, redirect_uris} = loadCredentials();
    const auth = new google.auth.OAuth2(
        client_id,
        client_secret,
        redirect_uris[0]
    );

    if (fs.existsSync(TOKEN_PATH)) {
        auth.setCredentials(JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8')));
        return auth;
    }

    const url = auth.generateAuthUrl({
        access_type: 'offline',
        scope: SCOPES,
        prompt: 'consent',
    });

    console.log(url);
    const code = await prompt('Paste authorization code: ');
    const {tokens} = await auth.getToken(code);
    auth.setCredentials(tokens);
    fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2));
    return auth;
}

/* =======================
   HEADER / EMAIL PARSING
======================= */

function parseEmail(raw: string): {name: string; email: string} {
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

function domainFromEmail(email: string): string {
    const at = email.indexOf('@');
    return at >= 0 ? email.slice(at + 1).toLowerCase() : '';
}

function getHeader(
    headers: gmail_v1.Schema$MessagePartHeader[] | undefined,
    name: string
): string {
    const key = name.toLowerCase();
    const hit = (headers ?? []).find(
        (h) => (h.name ?? '').toLowerCase() === key
    );
    return hit?.value ?? '';
}

/* =======================
   ATTACHMENT DETECTION
======================= */

function collectAttachmentTypes(
    payload: gmail_v1.Schema$MessagePart | undefined
): {
    hasAttachment: boolean;
    types: string[];
} {
    const types = new Set<string>();

    const walk = (part: gmail_v1.Schema$MessagePart | undefined) => {
        if (!part) return;

        const filename = (part.filename ?? '').trim();
        const attachmentId = part.body?.attachmentId ?? undefined;
        const size = typeof part.body?.size === 'number' ? part.body!.size! : 0;

        const looksLikeAttachment =
            filename.length > 0 && (!!attachmentId || size > 0);
        if (looksLikeAttachment) {
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

    return {hasAttachment: types.size > 0, types: Array.from(types).sort()};
}

/* =======================
   BODY EXTRACTION (TEXT ONLY, KEEP URLS)
======================= */

function decodeBase64Url(data: string): string {
    const b64 = data.replace(/-/g, '+').replace(/_/g, '/');
    const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4));
    return Buffer.from(b64 + pad, 'base64').toString('utf8');
}

function decodeHtmlEntities(s: string): string {
    return s
        .replace(/&#x([0-9a-fA-F]+);/g, (_, h) =>
            String.fromCodePoint(parseInt(h, 16))
        )
        .replace(/&#([0-9]+);/g, (_, n) =>
            String.fromCodePoint(parseInt(n, 10))
        )
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&quot;/gi, '"')
        .replace(/&apos;/gi, "'")
        .replace(/&zwnj;|&zwj;|&lrm;|&rlm;/gi, '');
}

function htmlToTextKeepingLinks(html: string): string {
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

    // Decode entities + remove zero-width/invisible chars
    s = decodeHtmlEntities(s)
        .replace(/[\u200B-\u200D\uFEFF]/g, '')
        .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');

    // Remove base64 blobs / data URIs
    s = s.replace(/[A-Za-z0-9+/=]{200,}/g, ' ');
    s = s.replace(/data:[^,\s]+,[A-Za-z0-9+/=]+/gi, ' ');

    // Normalize whitespace but keep newlines
    s = s
        .replace(/[ \t]+\n/g, '\n')
        .replace(/\n[ \t]+/g, '\n')
        .replace(/[ \t]{2,}/g, ' ')
        .replace(/\n{3,}/g, '\n\n')
        .trim();

    return s;
}

function extractBodyText(
    payload: gmail_v1.Schema$MessagePart | undefined
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

    if (BODY_MAX_CHARS > 0 && out.length > BODY_MAX_CHARS)
        out = out.slice(0, BODY_MAX_CHARS);
    return out;
}

/* =======================
   PROGRESS / SPLITTING
======================= */

function partPath(partIndex: number): string {
    const num = String(partIndex).padStart(3, '0');
    return path.join(process.cwd(), `${OUTPUT_BASENAME}${num}.csv`);
}

function writeHeader(stream: fs.WriteStream): number {
    const headerLine = CSV_HEADERS.join(',') + '\n';
    stream.write(headerLine);
    return Buffer.byteLength(headerLine, 'utf8');
}

function formatSeconds(totalSeconds: number): string {
    if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return '—';
    const s = Math.round(totalSeconds);
    const hours = Math.floor(s / 3600);
    const minutes = Math.floor((s % 3600) / 60);
    const seconds = s % 60;
    if (hours > 0) return `${hours}h ${minutes}m`;
    if (minutes > 0) return `${minutes}m ${seconds}s`;
    return `${seconds}s`;
}

function nowMs(): number {
    return Date.now();
}

/* =======================
   MAIN
======================= */

async function main() {
    const auth = await authorize();
    const gmail = google.gmail({version: 'v1', auth}) as gmail_v1.Gmail;

    const profileRes = await gmail.users.getProfile({userId: 'me'});
    const mailboxTotal = profileRes.data.messagesTotal ?? 0;

    let partIndex = 1;
    let currentPath = partPath(partIndex);
    let out = fs.createWriteStream(currentPath, {encoding: 'utf8'});
    let bytesInCurrentFile = 0;
    bytesInCurrentFile += writeHeader(out);

    let pageToken: string | undefined = undefined;
    let count = 0;

    const startMs = nowMs();
    const samples: Array<{tMs: number; count: number}> = [];

    const logProgress = () => {
        const elapsedSec = (nowMs() - startMs) / 1000;

        samples.push({tMs: nowMs(), count});
        while (samples.length > SPEED_WINDOW) samples.shift();

        let rate = 0;
        const first = samples.length > 0 ? samples[0] : undefined;
        const last =
            samples.length > 0 ? samples[samples.length - 1] : undefined;

        if (first && last && first !== last) {
            const dt = (last.tMs - first.tMs) / 1000;
            const dc = last.count - first.count;
            if (dt > 0 && dc > 0) rate = dc / dt;
        } else if (elapsedSec > 0 && count > 0) {
            rate = count / elapsedSec;
        }

        const pct =
            mailboxTotal > 0
                ? Math.min(100, (count / mailboxTotal) * 100)
                : Number.NaN;
        const remaining =
            mailboxTotal > 0 ? Math.max(0, mailboxTotal - count) : 0;
        const etaSec = rate > 0 ? remaining / rate : Number.POSITIVE_INFINITY;

        const pctStr = Number.isFinite(pct) ? `${pct.toFixed(1)}%` : '—';
        const rateStr = rate > 0 ? `${rate.toFixed(1)}/s` : '—';

        console.log(
            `Exported ${count.toLocaleString()} | ${pctStr} of mailbox (${mailboxTotal.toLocaleString()}) | ${rateStr} | ETA ${formatSeconds(
                etaSec
            )} | ${path.basename(currentPath)} (${Math.round(
                bytesInCurrentFile / (1024 * 1024)
            )}MB)`
        );
    };

    const rotateFileIfNeeded = () => {
        if (bytesInCurrentFile < MAX_BYTES_PER_FILE) return;

        out.end();

        partIndex += 1;
        currentPath = partPath(partIndex);
        out = fs.createWriteStream(currentPath, {encoding: 'utf8'});

        bytesInCurrentFile = 0;
        bytesInCurrentFile += writeHeader(out);

        console.log(`Started new output file: ${path.basename(currentPath)}`);
    };

    console.log(
        `Starting export... messagesTotal=${mailboxTotal.toLocaleString()} | QUERY="${QUERY}"`
    );
    console.log(
        `Splitting at ~${Math.round(
            MAX_BYTES_PER_FILE / (1024 * 1024)
        )}MB per file`
    );

    while (true) {
        const listParams: gmail_v1.Params$Resource$Users$Messages$List = {
            userId: 'me',
            q: QUERY,
            maxResults: 500,
        };
        if (pageToken) listParams.pageToken = pageToken;

        const listRes = await gmail.users.messages.list(listParams);
        const messages = listRes.data.messages ?? [];
        if (messages.length === 0) break;

        for (const m of messages) {
            const id = m.id;
            if (!id) continue;

            const msgRes = await gmail.users.messages.get({
                userId: 'me',
                id,
                format: 'full',
                fields: 'snippet,payload',
            });

            const payload = msgRes.data.payload;
            const headers = payload?.headers;

            const fromRaw = getHeader(headers, 'From');
            const replyToRaw = getHeader(headers, 'Reply-To');
            const deliveredToRaw = getHeader(headers, 'Delivered-To');
            const subject = getHeader(headers, 'Subject');
            const listUnsub = getHeader(headers, 'List-Unsubscribe');

            const {name: from_name, email: from_email} = parseEmail(fromRaw);
            const {email: reply_to_email} = parseEmail(replyToRaw);
            const {email: delivered_to} = parseEmail(deliveredToRaw);

            const sender_domain = domainFromEmail(from_email);
            const reply_to_domain = reply_to_email
                ? domainFromEmail(reply_to_email)
                : '';

            const snippet = msgRes.data.snippet ?? '';

            const attach = collectAttachmentTypes(payload);
            const has_attachment = attach.hasAttachment;
            const attachment_types = attach.types.join(';');

            const has_list_unsubscribe = (listUnsub ?? '').trim().length > 0;

            const body_text = extractBodyText(payload);

            const row =
                [
                    from_email,
                    from_name,
                    sender_domain,
                    reply_to_domain,
                    delivered_to,
                    subject,
                    snippet,
                    has_attachment ? 'true' : 'false',
                    attachment_types,
                    has_list_unsubscribe ? 'true' : 'false',
                    body_text,
                ]
                    .map(csvEscape)
                    .join(',') + '\n';

            out.write(row);
            bytesInCurrentFile += Buffer.byteLength(row, 'utf8');

            count++;
            if (count % LOG_EVERY === 0) logProgress();

            rotateFileIfNeeded();

            if (MAX_MESSAGES > 0 && count >= MAX_MESSAGES) break;
        }

        if (MAX_MESSAGES > 0 && count >= MAX_MESSAGES) break;

        pageToken = listRes.data.nextPageToken ?? undefined;
        if (!pageToken) break;
    }

    out.end();

    const totalSec = (nowMs() - startMs) / 1000;
    const finalRate = totalSec > 0 ? count / totalSec : 0;

    console.log(
        `Done. Exported ${count.toLocaleString()} emails.\nAverage speed: ${finalRate.toFixed(
            2
        )}/s | Total time: ${formatSeconds(totalSec)}`
    );
}

process.on('unhandledRejection', (reason) => {
    console.error('UNHANDLED REJECTION:', reason);
    process.exit(1);
});
process.on('uncaughtException', (err) => {
    console.error('UNCAUGHT EXCEPTION:', err);
    process.exit(1);
});

main().catch((err) => {
    console.error('Export failed:', err);
    process.exit(1);
});
