// src/exporter.ts
// Main export logic with colorful progress display

import {google, gmail_v1} from 'googleapis';
import chalk from 'chalk';
import logUpdate from 'log-update';
import type {ExportConfig, ExportField, ExportStats} from './types.js';
import {createOutputManager, formatBytes} from './csv.js';
import {
    parseEmail,
    domainFromEmail,
    getHeader,
    collectAttachmentTypes,
    extractBodyText,
    extractBodyHtml,
} from './parser.js';
import {sanitizeText} from './sanitizer.js';

// Use the OAuth2Client type from googleapis to avoid version mismatches
type OAuth2Client = InstanceType<typeof google.auth.OAuth2>;

const SPEED_WINDOW = 6;
const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
const SPINNER_INTERVAL_MS = 60;
const PROGRESS_UPDATE_MS = 2000;

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

function progressBar(percent: number, width = 20): string {
    const filled = Math.round((percent / 100) * width);
    const empty = width - filled;
    const bar = chalk.green('█'.repeat(filled)) + chalk.dim('░'.repeat(empty));
    return `[${bar}]`;
}

class ProgressDisplay {
    private frameIndex = 0;
    private spinnerIntervalId: ReturnType<typeof setInterval> | null = null;
    private progressIntervalId: ReturnType<typeof setInterval> | null = null;
    private currentLine = '';
    private progressCallback: (() => void) | null = null;

    start(progressCallback: () => void): void {
        this.frameIndex = 0;
        this.progressCallback = progressCallback;
        
        // Initial progress update
        if (this.progressCallback) {
            this.progressCallback();
        }

        // Start spinner animation (60ms)
        this.spinnerIntervalId = setInterval(() => {
            this.render();
        }, SPINNER_INTERVAL_MS);

        // Start progress data updates (2 seconds)
        this.progressIntervalId = setInterval(() => {
            if (this.progressCallback) {
                this.progressCallback();
            }
        }, PROGRESS_UPDATE_MS);
    }

    private getFrame(): string {
        const frame = SPINNER_FRAMES[this.frameIndex % SPINNER_FRAMES.length];
        this.frameIndex++;
        return chalk.cyan(frame ?? '⠋');
    }

    updateLine(line: string): void {
        this.currentLine = line;
    }

    private render(): void {
        const spinner = this.getFrame();
        logUpdate(`  ${spinner} ${this.currentLine}`);
    }

    stop(): void {
        if (this.spinnerIntervalId) {
            clearInterval(this.spinnerIntervalId);
            this.spinnerIntervalId = null;
        }
        if (this.progressIntervalId) {
            clearInterval(this.progressIntervalId);
            this.progressIntervalId = null;
        }
        logUpdate.done();
    }
}

export async function runExport(
    auth: OAuth2Client,
    config: ExportConfig
): Promise<ExportStats> {
    const gmail = google.gmail({version: 'v1', auth});

    // Get mailbox info
    const profileRes = await gmail.users.getProfile({userId: 'me'});
    const mailboxTotal = profileRes.data.messagesTotal ?? 0;
    const emailAddress = profileRes.data.emailAddress ?? 'unknown';

    console.log(chalk.cyan.bold('\n📬 Export Details'));
    console.log(chalk.dim('─'.repeat(50)));
    console.log(`  ${chalk.dim('Account:')}     ${chalk.white(emailAddress)}`);
    console.log(`  ${chalk.dim('Mailbox:')}     ${chalk.yellow(mailboxTotal.toLocaleString())} total messages`);
    console.log(`  ${chalk.dim('Query:')}       ${chalk.white(config.query)}`);
    console.log(`  ${chalk.dim('Fields:')}      ${chalk.white(String(config.fields.length))} selected`);
    if (config.maxMessages > 0) {
        console.log(`  ${chalk.dim('Limit:')}       ${chalk.yellow(config.maxMessages.toLocaleString())} messages`);
    }
    if (config.sanitize.enabled) {
        console.log(`  ${chalk.dim('Redaction:')}   ${chalk.green(config.sanitize.categories.length + ' categories enabled')}`);
    }

    // Initialize output
    const output = createOutputManager({
        outputDir: config.outputDir,
        prefix: config.outputPrefix,
        includeTimestamp: config.includeTimestamp,
        maxBytesPerFile: config.maxBytesPerFile,
        fields: config.fields,
    });

    console.log(chalk.dim('─'.repeat(50)));
    console.log(`  ${chalk.dim('Output:')}      ${chalk.white(output.getCurrentPath())}`);
    if (config.maxBytesPerFile > 0) {
        console.log(`  ${chalk.dim('Split at:')}    ${chalk.white(formatBytes(config.maxBytesPerFile))} per file`);
    }

    // Progress tracking
    let pageToken: string | undefined = undefined;
    let count = 0;
    const startMs = Date.now();
    const samples: Array<{tMs: number; count: number}> = [];
    const progress = new ProgressDisplay();

    const updateProgressLine = () => {
        const elapsedSec = (Date.now() - startMs) / 1000;

        samples.push({tMs: Date.now(), count});
        while (samples.length > SPEED_WINDOW) samples.shift();

        let rate = 0;
        const first = samples.length > 0 ? samples[0] : undefined;
        const last = samples.length > 0 ? samples[samples.length - 1] : undefined;

        if (first && last && first !== last) {
            const dt = (last.tMs - first.tMs) / 1000;
            const dc = last.count - first.count;
            if (dt > 0 && dc > 0) rate = dc / dt;
        } else if (elapsedSec > 0 && count > 0) {
            rate = count / elapsedSec;
        }

        const effectiveTotal =
            config.maxMessages > 0
                ? Math.min(mailboxTotal, config.maxMessages)
                : mailboxTotal;
        const pct =
            effectiveTotal > 0 ? Math.min(100, (count / effectiveTotal) * 100) : NaN;
        const remaining = effectiveTotal > 0 ? Math.max(0, effectiveTotal - count) : 0;
        const etaSec = rate > 0 ? remaining / rate : Infinity;

        const pctStr = Number.isFinite(pct) ? `${pct.toFixed(1)}%` : '—';
        const rateStr = rate > 0 ? `${rate.toFixed(1)}/s` : '—';
        const bar = Number.isFinite(pct) ? progressBar(pct) : progressBar(0);

        const line = `${bar} ${chalk.cyan(count.toLocaleString().padStart(8))} exported  ${chalk.yellow(pctStr.padStart(6))}  ${chalk.dim('|')}  ${chalk.green(rateStr.padStart(8))}  ${chalk.dim('|')}  ETA: ${chalk.magenta(formatSeconds(etaSec).padStart(8))}  ${chalk.dim('|')}  ${chalk.dim(formatBytes(output.getBytesWritten()).padStart(10))}`;
        
        progress.updateLine(line);
    };

    // Determine which fields need body content
    const needsBody =
        config.fields.includes('body_text') || config.fields.includes('body_html');
    const fieldsForGmail = needsBody ? 'snippet,payload,labelIds,threadId' : 'snippet,payload,labelIds,threadId';

    console.log('\n' + chalk.green.bold('🚀 Starting export...') + '\n');

    // Start the progress display with spinner and periodic updates
    progress.start(updateProgressLine);

    // Main export loop
    while (true) {
        const listParams: gmail_v1.Params$Resource$Users$Messages$List = {
            userId: 'me',
            q: config.query,
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
                fields: fieldsForGmail,
            });

            const row = extractFields(msgRes.data, config);
            output.write(row);

            count++;

            if (config.maxMessages > 0 && count >= config.maxMessages) break;
        }

        if (config.maxMessages > 0 && count >= config.maxMessages) break;

        pageToken = listRes.data.nextPageToken ?? undefined;
        if (!pageToken) break;
    }

    output.close();

    // Stop progress display
    progress.stop();

    const totalSec = (Date.now() - startMs) / 1000;
    const finalRate = totalSec > 0 ? count / totalSec : 0;
    const filesCreated = output.getFilesCreated();

    // Final summary
    console.log(chalk.green.bold('\n✅ Export Complete!\n'));
    console.log(chalk.cyan('╔══════════════════════════════════════════════════════╗'));
    console.log(chalk.cyan('║') + chalk.bold.white('                    Summary                            ') + chalk.cyan('║'));
    console.log(chalk.cyan('╠══════════════════════════════════════════════════════╣'));
    console.log(chalk.cyan('║') + `  ${chalk.dim('Emails exported:')}  ${chalk.green.bold(count.toLocaleString().padStart(10))}                    ` + chalk.cyan('║'));
    console.log(chalk.cyan('║') + `  ${chalk.dim('Total time:')}       ${chalk.yellow(formatSeconds(totalSec).padStart(10))}                    ` + chalk.cyan('║'));
    console.log(chalk.cyan('║') + `  ${chalk.dim('Average speed:')}    ${chalk.green((finalRate.toFixed(2) + '/s').padStart(10))}                    ` + chalk.cyan('║'));
    console.log(chalk.cyan('║') + `  ${chalk.dim('Total size:')}       ${chalk.yellow(formatBytes(output.getBytesWritten()).padStart(10))}                    ` + chalk.cyan('║'));
    console.log(chalk.cyan('║') + `  ${chalk.dim('Files created:')}    ${chalk.white(String(filesCreated.length).padStart(10))}                    ` + chalk.cyan('║'));
    console.log(chalk.cyan('╚══════════════════════════════════════════════════════╝'));
    
    console.log(chalk.dim('\n  Output files:'));
    filesCreated.forEach((f) => console.log(chalk.dim('    •') + ` ${chalk.white(f)}`));
    console.log('');

    return {
        totalExported: count,
        totalTime: totalSec,
        averageRate: finalRate,
        filesCreated,
    };
}

function extractFields(
    msg: gmail_v1.Schema$Message,
    config: ExportConfig
): Record<ExportField, string> {
    const payload = msg.payload;
    const headers = payload?.headers;

    // Pre-extract common values
    const fromRaw = getHeader(headers, 'From');
    const {name: fromName, email: fromEmail} = parseEmail(fromRaw);

    const replyToRaw = getHeader(headers, 'Reply-To');
    const {email: replyToEmail} = parseEmail(replyToRaw);

    const deliveredToRaw = getHeader(headers, 'Delivered-To');
    const {email: deliveredTo} = parseEmail(deliveredToRaw);

    const attach = collectAttachmentTypes(payload);

    // Build row based on requested fields
    const row: Record<ExportField, string> = {
        from_email: '',
        from_name: '',
        sender_domain: '',
        reply_to: '',
        reply_to_domain: '',
        delivered_to: '',
        to: '',
        cc: '',
        bcc: '',
        subject: '',
        snippet: '',
        date: '',
        message_id: '',
        thread_id: '',
        labels: '',
        has_attachment: '',
        attachment_types: '',
        attachment_count: '',
        has_list_unsubscribe: '',
        body_text: '',
        body_html: '',
    };

    for (const field of config.fields) {
        switch (field) {
            case 'from_email':
                row.from_email = fromEmail;
                break;
            case 'from_name':
                row.from_name = fromName;
                break;
            case 'sender_domain':
                row.sender_domain = domainFromEmail(fromEmail);
                break;
            case 'reply_to':
                row.reply_to = replyToEmail;
                break;
            case 'reply_to_domain':
                row.reply_to_domain = replyToEmail ? domainFromEmail(replyToEmail) : '';
                break;
            case 'delivered_to':
                row.delivered_to = deliveredTo;
                break;
            case 'to':
                row.to = getHeader(headers, 'To');
                break;
            case 'cc':
                row.cc = getHeader(headers, 'Cc');
                break;
            case 'bcc':
                row.bcc = getHeader(headers, 'Bcc');
                break;
            case 'subject':
                row.subject = getHeader(headers, 'Subject');
                break;
            case 'snippet':
                row.snippet = msg.snippet ?? '';
                break;
            case 'date':
                row.date = getHeader(headers, 'Date');
                break;
            case 'message_id':
                row.message_id = getHeader(headers, 'Message-ID');
                break;
            case 'thread_id':
                row.thread_id = msg.threadId ?? '';
                break;
            case 'labels':
                row.labels = (msg.labelIds ?? []).join(';');
                break;
            case 'has_attachment':
                row.has_attachment = attach.hasAttachment ? 'true' : 'false';
                break;
            case 'attachment_types':
                row.attachment_types = attach.types.join(';');
                break;
            case 'attachment_count':
                row.attachment_count = String(attach.count);
                break;
            case 'has_list_unsubscribe':
                row.has_list_unsubscribe =
                    getHeader(headers, 'List-Unsubscribe').trim().length > 0
                        ? 'true'
                        : 'false';
                break;
            case 'body_text': {
                let bodyText = extractBodyText(payload, config.bodyMaxChars);
                if (config.sanitize.enabled) {
                    const result = sanitizeText(bodyText, config.sanitize);
                    bodyText = result.text;
                }
                row.body_text = bodyText;
                break;
            }
            case 'body_html': {
                let bodyHtml = extractBodyHtml(payload, config.bodyMaxChars);
                if (config.sanitize.enabled) {
                    const result = sanitizeText(bodyHtml, config.sanitize);
                    bodyHtml = result.text;
                }
                row.body_html = bodyHtml;
                break;
            }
        }
    }

    return row;
}
