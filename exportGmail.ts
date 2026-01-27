import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import {google} from 'googleapis';

const SCOPES = ['https://www.googleapis.com/auth/gmail.readonly'];
const CREDENTIALS_PATH = path.join(process.cwd(), 'credentials.json');
const TOKEN_PATH = path.join(process.cwd(), 'token.json');
const OUTPUT_PATH = path.join(process.cwd(), 'gmail_export.csv');

function csvEscape(value: string): string {
    const v = (value ?? '').replace(/\r?\n/g, ' ').trim();
    if (/[",]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
    return v;
}

function parseFrom(fromRaw: string): {name: string; email: string} {
    const raw = (fromRaw || '').trim();
    const match = raw.match(/^(.*)<([^>]+)>$/);

    if (match?.[1] && match?.[2]) {
        return {
            name: match[1].replace(/^"|"$/g, '').trim(),
            email: match[2].trim().toLowerCase(),
        };
    }

    const emailMatch = raw.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
    const email = (emailMatch?.[0] || '').toLowerCase();
    const name = raw.replace(email, '').replace(/[<>"]/g, '').trim();
    return {name, email};
}

function getHeader(headers: any[] | undefined, name: string): string {
    const key = name.toLowerCase();
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

    // Desktop app creds live under "installed"
    const installed = json.installed ?? json.web;
    if (
        !installed?.client_id ||
        !installed?.client_secret ||
        !installed?.redirect_uris
    ) {
        throw new Error(
            "credentials.json doesn't look like an OAuth client file. Make sure you created an OAuth Client ID of type 'Desktop app' and downloaded the JSON."
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

async function main() {
    const auth = await authorize();
    const gmail = google.gmail({version: 'v1', auth});

    // Optional: filter
    // const q = "in:inbox newer_than:12m -category:promotions";
    const q = '';

    const out = fs.createWriteStream(OUTPUT_PATH, {encoding: 'utf-8'});
    out.write('from_name,from_email,subject,snippet\n');

    let pageToken: string | undefined = undefined;
    let count = 0;

    while (true) {
        const listParams: any = {userId: 'me', q, maxResults: 500};
        if (pageToken) listParams.pageToken = pageToken;

        const listRes = await gmail.users.messages.list(listParams);
        const messages = listRes.data.messages || [];
        if (messages.length === 0) break;

        for (const m of messages) {
            if (!m.id) continue;

            const msgRes = await gmail.users.messages.get({
                userId: 'me',
                id: m.id,
                format: 'metadata',
                metadataHeaders: ['From', 'Subject'],
                fields: 'snippet,payload(headers)',
            });

            const headers = msgRes.data.payload?.headers as any[] | undefined;
            const fromRaw = getHeader(headers, 'From');
            const subject = getHeader(headers, 'Subject');
            const snippet = msgRes.data.snippet || '';

            const {name, email} = parseFrom(fromRaw);
            out.write(
                [
                    csvEscape(name),
                    csvEscape(email),
                    csvEscape(subject),
                    csvEscape(snippet),
                ].join(',') + '\n'
            );

            count++;
            if (count % 500 === 0) console.log(`Exported ${count} emails...`);
        }

        pageToken = listRes.data.nextPageToken || undefined;
        if (!pageToken) break;
    }

    out.end();
    console.log(`\n✅ Done. Exported ${count} emails to ${OUTPUT_PATH}\n`);
}

// Make crashes readable (your last crash printed as null-prototype object)
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
