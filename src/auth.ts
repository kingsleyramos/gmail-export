// src/auth.ts
// Gmail OAuth authentication with colorful output

import fs from 'node:fs';
import readline from 'node:readline';
import {google} from 'googleapis';
import chalk from 'chalk';

const SCOPES = ['https://www.googleapis.com/auth/gmail.readonly'];

// Use the OAuth2Client type from googleapis to avoid version mismatches
type OAuth2Client = InstanceType<typeof google.auth.OAuth2>;

interface Credentials {
    client_id: string;
    client_secret: string;
    redirect_uris: string[];
}

export function loadCredentials(credentialsPath: string): Credentials {
    if (!fs.existsSync(credentialsPath)) {
        throw new Error(
            `\n${chalk.red('❌ credentials.json not found at:')} ${chalk.yellow(credentialsPath)}\n\n` +
                `   To set up Gmail API credentials:\n` +
                `   ${chalk.cyan('1.')} Run: ${chalk.bold('npm run setup')}\n` +
                `   ${chalk.cyan('2.')} Follow the guide to create credentials\n` +
                `   ${chalk.cyan('3.')} Save the downloaded JSON as ${chalk.bold('credentials.json')}\n`
        );
    }

    const json = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'));
    const c = json.installed ?? json.web;

    if (!c?.client_id || !c?.client_secret || !c?.redirect_uris?.length) {
        throw new Error(
            `${chalk.red('❌ Invalid credentials.json format.')}\n` +
                `   Make sure you downloaded an OAuth ${chalk.bold('"Desktop app"')} credential.\n`
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
        rl.question(question, (answer) => {
            rl.close();
            resolve(answer.trim());
        })
    );
}

export async function authorize(
    credentialsPath: string,
    tokenPath: string
): Promise<OAuth2Client> {
    const {client_id, client_secret, redirect_uris} = loadCredentials(credentialsPath);

    const auth = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

    // Try to load existing token
    if (fs.existsSync(tokenPath)) {
        try {
            const tokens = JSON.parse(fs.readFileSync(tokenPath, 'utf8'));
            auth.setCredentials(tokens);
            console.log(chalk.green('🔑 Using saved authentication token'));
            return auth;
        } catch {
            console.log(chalk.yellow('⚠️  Existing token invalid, re-authenticating...'));
        }
    }

    // Need new authorization
    console.log('\n' + chalk.cyan.bold('📱 Gmail Authorization Required'));
    console.log(chalk.dim('─'.repeat(50)));

    const authUrl = auth.generateAuthUrl({
        access_type: 'offline',
        scope: SCOPES,
        prompt: 'consent',
    });

    console.log(`\n${chalk.cyan('1.')} Open this URL in your browser:\n`);
    console.log(chalk.yellow(`   ${authUrl}\n`));
    console.log(`${chalk.cyan('2.')} Sign in and authorize the app`);
    console.log(`${chalk.cyan('3.')} Copy the authorization code from the redirect URL`);
    console.log(chalk.dim('   (It appears after "code=" in the URL)\n'));
    console.log(chalk.dim('─'.repeat(50)));

    const code = await prompt(chalk.bold('\nPaste authorization code here: '));

    if (!code) {
        throw new Error('No authorization code provided');
    }

    const {tokens} = await auth.getToken(code);
    auth.setCredentials(tokens);

    // Save token for future use
    fs.writeFileSync(tokenPath, JSON.stringify(tokens, null, 2));
    console.log(chalk.green(`\n✅ Authorization successful!`));
    console.log(chalk.dim(`   Token saved to: ${tokenPath}`));
    console.log(chalk.dim('   (You won\'t need to authorize again unless you delete this file)\n'));

    return auth;
}
