import fs from 'node:fs';
import path from 'node:path';
import {google} from 'googleapis';

// node --loader ts-node/esm countEmails.ts

const SCOPES = ['https://www.googleapis.com/auth/gmail.readonly'];
const CREDENTIALS_PATH = path.join(process.cwd(), 'credentials.json');
const TOKEN_PATH = path.join(process.cwd(), 'token.json');

function loadCredentials() {
    const raw = fs.readFileSync(CREDENTIALS_PATH, 'utf-8');
    const json = JSON.parse(raw);
    const installed = json.installed ?? json.web;

    if (
        !installed?.client_id ||
        !installed?.client_secret ||
        !installed?.redirect_uris
    ) {
        throw new Error(
            'Invalid credentials.json — must be Desktop OAuth client'
        );
    }

    return installed;
}

async function main() {
    if (!fs.existsSync(TOKEN_PATH)) {
        throw new Error(
            'token.json not found. Run exportGmail.ts once to authorize.'
        );
    }

    const token = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf-8'));
    const {client_id, client_secret, redirect_uris} = loadCredentials();

    const auth = new google.auth.OAuth2(
        client_id,
        client_secret,
        redirect_uris[0]
    );

    auth.setCredentials(token);

    const gmail = google.gmail({version: 'v1', auth});

    /**
     * This returns profile metadata ONLY
     * No messages are downloaded
     */
    const profile = await gmail.users.getProfile({userId: 'me'});

    const total = profile.data.messagesTotal;
    const threads = profile.data.threadsTotal;

    console.log('\n📬 Gmail Statistics');
    console.log('------------------');
    console.log(`Total emails (messages): ${total?.toLocaleString()}`);
    console.log(`Total threads:           ${threads?.toLocaleString()}\n`);
}

main().catch((err) => {
    console.error('❌ Failed to count emails:', err);
    process.exit(1);
});
