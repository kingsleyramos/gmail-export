// exportGmail_v2.ts
// Exports Gmail message metadata to CSV with these columns:
// from_email, from_name, sender_domain, reply_to_domain, delivered_to, subject, snippet,
// has_attachment, attachment_types, has_list_unsubscribe
//
// Adds:
// - Progress % (based on mailbox messagesTotal)
// - ETA (based on recent throughput)
// - Exported count (always shown)
//
// Notes:
// - 500 is just the page size for listing message IDs; script paginates through ALL messages.
// - messagesTotal is for the whole mailbox; if you use QUERY filters, %/ETA will be relative to the whole mailbox
//   unless you add a separate query-count pass.
// - attachment_types is a semicolon-separated list of unique file extensions (fallback: mimeType/unknown).

import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import {google} from 'googleapis';

const SCOPES = ['https://www.googleapis.com/auth/gmail.readonly'];
const CREDENTIALS_PATH = path.join(process.cwd(), 'credentials.json');
const TOKEN_PATH = path.join(process.cwd(), 'token.json');
const OUTPUT_PATH = path.join(process.cwd(), 'gmail_export_v2.csv');

// Optional: set an output limit for quick testing (0 = no limit)
const MAX_MESSAGES = 0;

// Optional: Gmail search query (same syntax as Gmail search box)
// Examples:
//   "in:inbox newer_than:12m -category:promotions"
//   "label:receipts"
//   "from:amazon.com"
const QUERY = '-in:sent -in:spam -in:trash';

// How often to print progress (in exported message count)
const LOG_EVERY = 250;

// Track throughput using a moving window (how many recent samples)
const SPEED_WINDOW = 6;

function csvEscape(value: string): string {
    const v = (value ?? '').replace(/\r?\n/g, ' ').trim();
    if (/[",]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
    return v;
}

function parseEmailLike(raw: string): {name: string; email: string} {
    const s = (raw || '').trim();

    const angle = s.match(/^(.*)<([^>]+)>$/);
    if (angle?.[1] && angle?.[2]) {
        return {
            name: angle[1].replace(/^"|"$/g, '').trim(),
            email: angle[2].trim().toLowerCase(),
        };
    }

    const emailMatch = s.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
    const email = (emailMatch?.[0] || '').toLowerCase();
    const name = s.replace(email, '').replace(/[<>"]/g, '').trim();
    return {name, email};
}

function domainFromEmail(email: string): string {
    const at = email.indexOf('@');
    return at >= 0 ? email.slice(at + 1).toLowerCase() : '';
}

function getHeader(headers: any[] | undefined, headerName: string): string {
    const key = headerName.toLowerCase();
    const hit = (headers || []).find(
        (h) => (h?.name || '').toLowerCase() === key
    );
    return hit?.value || '';
}

function loadCredentials(): {
    client_id: string;
    client_secret: string;
    redirect_uris: string[];
} {
    const raw = fs.readFileSync(CREDENTIALS_PATH, 'utf-8');
    const json = JSON.parse(raw);

    const installed = json.installed ?? json.web;
    if (
        !installed?.client_id ||
        !installed?.client_secret ||
        !installed?.redirect_uris
    ) {
        throw new Error(
            "credentials.json doesn't look like an OAuth client file. Ensure you created an OAuth Client ID of type 'Desktop app' and downloaded the JSON."
        );
    }

    return {
        client_id: installed.client_id,
        client_secret: installed.client_secret,
        redirect_uris: installed.redirect_uris,
    };
}

async function prompt(question: string): Promise<string> {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });
    return new Promise((resolve) =>
        rl.question(question, (answer) => {
            rl.close();
            resolve(answer.trim());
        })
    );
}

async function authorize() {
    const {client_id, client_secret, redirect_uris} = loadCredentials();
    const oAuth2Client = new google.auth.OAuth2(
        client_id,
        client_secret,
        redirect_uris[0]
    );

    if (fs.existsSync(TOKEN_PATH)) {
        const token = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf-8'));
        oAuth2Client.setCredentials(token);
        return oAuth2Client;
    }

    const authUrl = oAuth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: SCOPES,
        prompt: 'consent',
    });

    console.log('\nAuthorize this app by visiting this url:\n');
    console.log(authUrl);
    console.log(
        "\nAfter approving, you’ll be redirected to a URL. Copy the 'code=' value.\n"
    );

    const code = await prompt('Paste authorization code here: ');
    const {tokens} = await oAuth2Client.getToken(code);
    oAuth2Client.setCredentials(tokens);

    fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2), 'utf-8');
    console.log(`\nSaved token to ${TOKEN_PATH}\n`);
    return oAuth2Client;
}

function collectAttachmentTypes(payload: any): {
    hasAttachment: boolean;
    types: string[];
} {
    const types = new Set<string>();

    const walk = (part: any) => {
        if (!part) return;

        const filename = (part.filename || '').trim();
        const body = part.body || {};
        const hasAttachmentId = !!body.attachmentId;
        const size = typeof body.size === 'number' ? body.size : 0;

        const looksLikeAttachment =
            filename.length > 0 && (hasAttachmentId || size > 0);
        if (looksLikeAttachment) {
            const extMatch = filename
                .toLowerCase()
                .match(/\.([a-z0-9]{1,10})$/);
            if (extMatch?.[1]) types.add(extMatch[1]);
            else if (part.mimeType)
                types.add(String(part.mimeType).toLowerCase());
            else types.add('unknown');
        }

        const parts = part.parts || [];
        for (const p of parts) walk(p);
    };

    walk(payload);

    return {hasAttachment: types.size > 0, types: Array.from(types).sort()};
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

async function main() {
    const auth = await authorize();
    const gmail = google.gmail({version: 'v1', auth});

    // Total messages in mailbox (for progress). Not filter-aware.
    const profileRes = await gmail.users.getProfile({userId: 'me'});
    const mailboxTotal = profileRes.data.messagesTotal ?? 0;

    const out = fs.createWriteStream(OUTPUT_PATH, {encoding: 'utf-8'});

    out.write(
        [
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
        ].join(',') + '\n'
    );

    let pageToken: string | undefined = undefined;
    let count = 0;

    const startMs = nowMs();

    // Throughput samples: [{tMs, count}]
    const samples: Array<{tMs: number; count: number}> = [];

    const logProgress = () => {
        const elapsedSec = (nowMs() - startMs) / 1000;

        samples.push({tMs: nowMs(), count});
        while (samples.length > SPEED_WINDOW) samples.shift();

        let rate = 0; // emails/sec

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
            `Exported ${count.toLocaleString()} emails | ${pctStr} of mailbox (${mailboxTotal.toLocaleString()}) | ${rateStr} | ETA ${formatSeconds(
                etaSec
            )}`
        );
    };

    console.log(
        `\nStarting export... mailbox messagesTotal=${mailboxTotal.toLocaleString()}${
            QUERY ? ` | QUERY="${QUERY}"` : ''
        }\n`
    );

    while (true) {
        const listParams: any = {userId: 'me', q: QUERY, maxResults: 500};
        if (pageToken) listParams.pageToken = pageToken;

        const listRes = await gmail.users.messages.list(listParams);
        const messages = listRes.data.messages || [];
        if (messages.length === 0) break;

        for (const m of messages) {
            if (!m.id) continue;

            const msgRes = await gmail.users.messages.get({
                userId: 'me',
                id: m.id,
                format: 'full',
                fields: 'snippet,payload',
            });

            const payload = msgRes.data.payload || {};
            const headers = payload.headers as any[] | undefined;

            const fromRaw = getHeader(headers, 'From');
            const subject = getHeader(headers, 'Subject');
            const listUnsub = getHeader(headers, 'List-Unsubscribe');
            const replyToRaw = getHeader(headers, 'Reply-To');
            const deliveredToRaw = getHeader(headers, 'Delivered-To');

            const {name: from_name, email: from_email} =
                parseEmailLike(fromRaw);
            const sender_domain = domainFromEmail(from_email);

            const {email: reply_to_email} = parseEmailLike(replyToRaw);
            const reply_to_domain = reply_to_email
                ? domainFromEmail(reply_to_email)
                : '';

            const {email: delivered_to} = parseEmailLike(deliveredToRaw);

            const snippet = msgRes.data.snippet || '';
            const {hasAttachment, types} = collectAttachmentTypes(payload);
            const has_list_unsubscribe = (listUnsub || '').trim().length > 0;

            out.write(
                [
                    csvEscape(from_email),
                    csvEscape(from_name),
                    csvEscape(sender_domain),
                    csvEscape(reply_to_domain),
                    csvEscape(delivered_to),
                    csvEscape(subject),
                    csvEscape(snippet),
                    csvEscape(hasAttachment ? 'true' : 'false'),
                    csvEscape(types.join(';')),
                    csvEscape(has_list_unsubscribe ? 'true' : 'false'),
                ].join(',') + '\n'
            );

            count++;

            if (count % LOG_EVERY === 0) logProgress();

            if (MAX_MESSAGES > 0 && count >= MAX_MESSAGES) break;
        }

        if (MAX_MESSAGES > 0 && count >= MAX_MESSAGES) break;

        // Correct pagination
        pageToken = listRes.data.nextPageToken || undefined;
        if (!pageToken) break;
    }

    out.end();

    // Final log
    const totalSec = (nowMs() - startMs) / 1000;
    const finalRate = totalSec > 0 ? count / totalSec : 0;

    console.log(
        `\n✅ Done. Exported ${count.toLocaleString()} emails to ${OUTPUT_PATH}\nAverage speed: ${finalRate.toFixed(
            2
        )}/s | Total time: ${formatSeconds(totalSec)}\n`
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
    console.error('❌ Export failed:', err);
    process.exit(1);
});
