// src/interactive.ts
// Interactive CLI prompts with arrow-key navigation and colors

import {select, input, confirm, checkbox, Separator} from '@inquirer/prompts';
import chalk from 'chalk';
import fs from 'node:fs';
import path from 'node:path';
import {
    ExportConfig,
    ExportField,
    FIELD_DEFINITIONS,
    DEFAULT_FIELDS,
    ALL_FIELDS,
    SanitizeConfig,
} from './types.js';
import {DEFAULT_CONFIG} from './config.js';
import {
    RedactionCategory,
    REDACTION_CATEGORIES,
    ALL_REDACTION_CATEGORIES,
    DEFAULT_REDACTION_CATEGORIES,
} from './sanitizer.js';

// Color theme
const theme = {
    title: chalk.bold.cyan,
    subtitle: chalk.gray,
    success: chalk.green,
    warning: chalk.yellow,
    error: chalk.red,
    info: chalk.blue,
    highlight: chalk.bold.white,
    dim: chalk.dim,
    step: chalk.bold.magenta,
    field: chalk.cyan,
    value: chalk.yellow,
};

function banner(): void {
    console.log('\n');
    console.log(
        theme.title(
            '  ╔══════════════════════════════════════════════════════╗',
        ),
    );
    console.log(
        theme.title('  ║') +
            chalk.bold.white(
                '           📧  Gmail Export  📧                      ',
            ) +
            theme.title('║'),
    );
    console.log(
        theme.title('  ║') +
            theme.subtitle(
                '        Export your emails to CSV easily              ',
            ) +
            theme.title('║'),
    );
    console.log(
        theme.title(
            '  ╚══════════════════════════════════════════════════════╝',
        ),
    );
    console.log('\n');
}

function stepHeader(step: number, total: number, title: string): void {
    console.log(
        '\n' + theme.step(`━━━ Step ${step}/${total}: ${title} ━━━`) + '\n',
    );
}

export async function runInteractiveSetup(): Promise<ExportConfig> {
    const config: Partial<ExportConfig> = {};

    banner();

    // Check for credentials
    const defaultCredsPath = path.join(process.cwd(), 'credentials.json');
    if (!fs.existsSync(defaultCredsPath)) {
        console.log(
            theme.warning(
                '  ⚠️  No credentials.json found in the current directory.',
            ),
        );
        console.log(
            theme.dim(
                '     Run with --setup to see the Gmail API setup guide.\n',
            ),
        );

        const proceed = await confirm({
            message: 'Continue anyway?',
            default: false,
        });

        if (!proceed) {
            console.log(
                theme.info('\n  Run ') +
                    theme.highlight('npm run setup') +
                    theme.info(' to see the setup guide.\n'),
            );
            process.exit(0);
        }
    }

    // ═══════════════════════════════════════════════════════════════════
    // STEP 1: Query Selection
    // ═══════════════════════════════════════════════════════════════════
    stepHeader(1, 6, 'Select Emails');

    const queryPreset = await select({
        message: 'Which emails do you want to export?',
        choices: [
            {
                value: 'received',
                name: `${chalk.green('●')} All received mail ${theme.dim('(excludes sent, spam, trash)')}`,
            },
            {
                value: 'all',
                name: `${chalk.blue('●')} All mail ${theme.dim('(including sent)')}`,
            },
            {
                value: 'inbox',
                name: `${chalk.cyan('●')} Inbox only`,
            },
            {
                value: 'starred',
                name: `${chalk.yellow('★')} Starred emails`,
            },
            {
                value: 'unread',
                name: `${chalk.magenta('●')} Unread emails`,
            },
            new Separator(theme.dim('─────────────────────────────')),
            {
                value: 'custom',
                name: `${chalk.white('◆')} Custom query...`,
            },
        ],
        loop: true,
    });

    const queryMap: Record<string, string> = {
        received: '-in:sent -in:spam -in:trash',
        all: '-in:spam -in:trash',
        inbox: 'in:inbox',
        starred: 'is:starred',
        unread: 'is:unread',
    };

    if (queryPreset === 'custom') {
        config.query = await input({
            message: 'Enter Gmail search query:',
            default: DEFAULT_CONFIG.query,
        });
    } else {
        config.query = queryMap[queryPreset] ?? DEFAULT_CONFIG.query;
    }

    console.log(theme.dim(`  Using query: ${config.query}`));

    // ═══════════════════════════════════════════════════════════════════
    // STEP 2: Message Limit
    // ═══════════════════════════════════════════════════════════════════
    stepHeader(2, 6, 'Export Limit');

    const limitChoice = await select({
        message: 'How many emails to export?',
        choices: [
            {
                value: '0',
                name: `${chalk.green('∞')} All emails ${theme.dim('(may take a while for large mailboxes)')}`,
            },
            {
                value: '100',
                name: `${chalk.cyan('●')} First 100 ${theme.dim('(quick test)')}`,
            },
            {
                value: '1000',
                name: `${chalk.blue('●')} First 1,000`,
            },
            {
                value: '10000',
                name: `${chalk.magenta('●')} First 10,000`,
            },
            new Separator(theme.dim('─────────────────────────────')),
            {
                value: 'custom',
                name: `${chalk.white('◆')} Custom limit...`,
            },
        ],
        loop: true,
    });

    if (limitChoice === 'custom') {
        const customLimit = await input({
            message: 'Enter max messages (0 = unlimited):',
            default: '0',
            validate: (val) => {
                const n = parseInt(val, 10);
                return !isNaN(n) && n >= 0
                    ? true
                    : 'Please enter a valid number';
            },
        });
        config.maxMessages = parseInt(customLimit, 10) || 0;
    } else {
        config.maxMessages = parseInt(limitChoice, 10);
    }

    const limitDisplay =
        config.maxMessages === 0
            ? 'Unlimited'
            : config.maxMessages.toLocaleString();
    console.log(theme.dim(`  Limit: ${limitDisplay} messages`));

    // ═══════════════════════════════════════════════════════════════════
    // STEP 3: Field Selection
    // ═══════════════════════════════════════════════════════════════════
    stepHeader(3, 6, 'Select Fields');

    const fieldChoice = await select({
        message: 'Which fields do you want to export?',
        choices: [
            {
                value: 'default',
                name: `${chalk.green('●')} Default fields ${theme.dim('(recommended - 10 fields)')}`,
            },
            {
                value: 'minimal',
                name: `${chalk.cyan('●')} Minimal ${theme.dim('(from, subject, date - 3 fields)')}`,
            },
            {
                value: 'full',
                name: `${chalk.blue('●')} All fields ${theme.dim('(21 fields - larger files)')}`,
            },
            new Separator(theme.dim('─────────────────────────────')),
            {
                value: 'custom',
                name: `${chalk.white('◆')} Choose specific fields...`,
            },
        ],
        loop: true,
    });

    if (fieldChoice === 'custom') {
        // Group fields by category for better UX
        const categoryIcons: Record<string, string> = {
            sender: '👤',
            recipient: '📬',
            content: '📝',
            metadata: '🏷️',
            attachments: '📎',
        };

        const categoryOrder = [
            'sender',
            'recipient',
            'content',
            'metadata',
            'attachments',
        ];

        const choices: Array<
            {value: string; name: string; checked: boolean} | Separator
        > = [];

        for (const category of categoryOrder) {
            const categoryFields = FIELD_DEFINITIONS.filter(
                (f) => f.category === category,
            );
            const icon = categoryIcons[category] ?? '●';
            const categoryName =
                category.charAt(0).toUpperCase() + category.slice(1);

            choices.push(
                new Separator(theme.dim(`\n  ${icon} ${categoryName}`)),
            );

            for (const field of categoryFields) {
                choices.push({
                    value: field.name,
                    name: `${theme.field(field.name)} ${theme.dim('- ' + field.description)}`,
                    checked: DEFAULT_FIELDS.includes(field.name),
                });
            }
        }

        const selected = await checkbox({
            message: 'Select fields (space to toggle, enter to confirm):',
            choices,
            loop: true,
            pageSize: 15,
        });

        config.fields = selected as ExportField[];
    } else if (fieldChoice === 'minimal') {
        config.fields = ['from_email', 'subject', 'date'];
    } else if (fieldChoice === 'full') {
        config.fields = ALL_FIELDS;
    } else {
        config.fields = DEFAULT_FIELDS;
    }

    console.log(theme.dim(`  Selected ${config.fields?.length ?? 0} fields`));

    // Body text options (if selected)
    if (
        config.fields?.includes('body_text') ||
        config.fields?.includes('body_html')
    ) {
        console.log('');
        const bodyLimit = await select({
            message: 'Max body text length per email?',
            choices: [
                {value: '2000', name: `2,000 chars ${theme.dim('(compact)')}`},
                {value: '8000', name: `8,000 chars ${theme.dim('(default)')}`},
                {
                    value: '50000',
                    name: `50,000 chars ${theme.dim('(full content)')}`,
                },
                {
                    value: '0',
                    name: `No limit ${theme.dim('(warning: very large files)')}`,
                },
            ],
        });
        config.bodyMaxChars = parseInt(bodyLimit, 10);
    }

    // ═══════════════════════════════════════════════════════════════════
    // STEP 4: Output Settings
    // ═══════════════════════════════════════════════════════════════════
    stepHeader(4, 6, 'Output Settings');

    config.outputDir = await input({
        message: 'Output directory:',
        default: './exports',
    });

    config.outputPrefix = await input({
        message: 'Filename prefix:',
        default: 'gmail_export',
    });

    config.includeTimestamp = await confirm({
        message: 'Add timestamp to filename? (prevents overwrites)',
        default: true,
    });

    // File splitting option
    const splitChoice = await select({
        message: 'Split large exports into multiple files?',
        choices: [
            {
                value: '0',
                name: `${chalk.green('●')} No splitting ${theme.dim('(single file)')}`,
            },
            {
                value: '25',
                name: `${chalk.cyan('●')} 25 MB per file`,
            },
            {
                value: '30',
                name: `${chalk.cyan('●')} 30 MB per file`,
            },
            {
                value: '50',
                name: `${chalk.blue('●')} 50 MB per file`,
            },
            {
                value: '100',
                name: `${chalk.blue('●')} 100 MB per file`,
            },
            {
                value: '250',
                name: `${chalk.magenta('●')} 250 MB per file`,
            },
            new Separator(theme.dim('─────────────────────────────')),
            {
                value: 'custom',
                name: `${chalk.white('◆')} Custom size...`,
            },
        ],
        loop: true,
    });

    if (splitChoice === 'custom') {
        const customSize = await input({
            message: 'Enter max file size in MB:',
            default: '250',
            validate: (val) => {
                const n = parseInt(val, 10);
                return !isNaN(n) && n > 0
                    ? true
                    : 'Please enter a valid number greater than 0';
            },
        });
        config.maxBytesPerFile = parseInt(customSize, 10) * 1_000_000; // Use decimal MB
    } else if (splitChoice === '0') {
        config.maxBytesPerFile = 0; // No splitting
    } else {
        config.maxBytesPerFile = parseInt(splitChoice, 10) * 1_000_000; // Use decimal MB
    }

    const exampleFilename = config.includeTimestamp
        ? `${config.outputPrefix}_20250129_143052.csv`
        : `${config.outputPrefix}.csv`;
    console.log(theme.dim(`  Example: ${config.outputDir}/${exampleFilename}`));

    if (config.maxBytesPerFile && config.maxBytesPerFile > 0) {
        const sizeMB = Math.round(config.maxBytesPerFile / 1_000_000);
        console.log(theme.dim(`  Split at: ${sizeMB} MB per file`));
        console.log(
            theme.dim(
                `  Note: Files will be named ${config.outputPrefix}_*_part001.csv, etc.`,
            ),
        );
    }

    // ═══════════════════════════════════════════════════════════════════
    // STEP 5: Privacy / Sanitization
    // ═══════════════════════════════════════════════════════════════════
    stepHeader(5, 6, 'Privacy Settings');

    const sanitizeChoice = await select({
        message: 'Redact personal information from email body?',
        choices: [
            {
                value: 'recommended',
                name: `${chalk.green('●')} Yes - recommended settings ${theme.dim('(cards, passwords, phone numbers, etc.)')}`,
            },
            {
                value: 'all',
                name: `${chalk.blue('●')} Yes - redact everything ${theme.dim('(all categories)')}`,
            },
            {
                value: 'custom',
                name: `${chalk.cyan('●')} Yes - let me choose what to redact...`,
            },
            new Separator(theme.dim('─────────────────────────────')),
            {
                value: 'none',
                name: `${chalk.yellow('●')} No - keep original content ${theme.dim('(not recommended for AI analysis)')}`,
            },
        ],
        loop: true,
    });

    config.sanitize = {
        enabled: sanitizeChoice !== 'none',
        categories: DEFAULT_REDACTION_CATEGORIES,
    };

    if (sanitizeChoice === 'custom') {
        // Group categories: defaults first, then optional
        const defaultCategories = ALL_REDACTION_CATEGORIES.filter(
            (cat) => REDACTION_CATEGORIES[cat].default,
        );
        const optionalCategories = ALL_REDACTION_CATEGORIES.filter(
            (cat) => !REDACTION_CATEGORIES[cat].default,
        );

        const categoryChoices = [
            new Separator(theme.dim('── Recommended (on by default) ──')),
            ...defaultCategories.map((cat) => {
                const info = REDACTION_CATEGORIES[cat];
                return {
                    value: cat,
                    name: `${theme.field(info.name)} ${theme.dim('- ' + info.description)}`,
                    checked: true,
                };
            }),
            new Separator(theme.dim('── Optional (off by default) ──')),
            ...optionalCategories.map((cat) => {
                const info = REDACTION_CATEGORIES[cat];
                return {
                    value: cat,
                    name: `${theme.field(info.name)} ${theme.dim('- ' + info.description)}`,
                    checked: false,
                };
            }),
        ];

        const selectedCategories = await checkbox({
            message: 'Select categories to redact (space to toggle):',
            choices: categoryChoices,
            loop: true,
            pageSize: 15,
        });

        config.sanitize.categories = selectedCategories as RedactionCategory[];
    } else if (sanitizeChoice === 'all') {
        config.sanitize.categories = ALL_REDACTION_CATEGORIES;
    }

    if (config.sanitize.enabled) {
        console.log(
            theme.dim(
                `  Redacting: ${config.sanitize.categories.length} categories`,
            ),
        );
        console.log(
            theme.dim(
                `  Personal info will be replaced with [REDACTED_*] placeholders`,
            ),
        );
    } else {
        console.log(
            theme.warning(
                `  ⚠️  No redaction - export will contain all personal information`,
            ),
        );
    }

    // ═══════════════════════════════════════════════════════════════════
    // STEP 6: Save & Confirm
    // ═══════════════════════════════════════════════════════════════════
    stepHeader(6, 6, 'Confirm & Save');

    const saveConfig = await confirm({
        message: 'Save these settings for future use?',
        default: true,
    });

    if (saveConfig) {
        const configToSave = {
            query: config.query,
            maxMessages: config.maxMessages,
            outputDir: config.outputDir,
            outputPrefix: config.outputPrefix,
            includeTimestamp: config.includeTimestamp,
            maxBytesPerFile: config.maxBytesPerFile,
            bodyMaxChars: config.bodyMaxChars,
            fields: config.fields,
            sanitize: config.sanitize,
        };
        const configPath = path.join(process.cwd(), 'gmail-export.config.json');
        fs.writeFileSync(configPath, JSON.stringify(configToSave, null, 4));
        console.log(theme.success(`  ✓ Config saved to: ${configPath}`));
    }

    // Summary
    const splitDisplay =
        config.maxBytesPerFile && config.maxBytesPerFile > 0
            ? `${Math.round(config.maxBytesPerFile / 1_000_000)} MB`
            : 'No';
    const sanitizeDisplay = config.sanitize?.enabled
        ? `${config.sanitize.categories.length} categories`
        : 'Off';

    console.log(
        '\n' +
            theme.title(
                '┌──────────────────────────────────────────────────────┐',
            ),
    );
    console.log(
        theme.title('│') +
            chalk.bold.white(
                '              📋 Export Summary                       ',
            ) +
            theme.title('│'),
    );
    console.log(
        theme.title('├──────────────────────────────────────────────────────┤'),
    );
    console.log(
        theme.title('│') +
            `  ${theme.dim('Query:')}      ${theme.value(config.query ?? '')}`.padEnd(
                63,
            ) +
            theme.title('│'),
    );
    console.log(
        theme.title('│') +
            `  ${theme.dim('Limit:')}      ${theme.value(config.maxMessages === 0 ? 'Unlimited' : String(config.maxMessages))}`.padEnd(
                63,
            ) +
            theme.title('│'),
    );
    console.log(
        theme.title('│') +
            `  ${theme.dim('Fields:')}     ${theme.value(String(config.fields?.length ?? 0) + ' selected')}`.padEnd(
                63,
            ) +
            theme.title('│'),
    );
    console.log(
        theme.title('│') +
            `  ${theme.dim('Output:')}     ${theme.value(config.outputDir + '/')}`.padEnd(
                63,
            ) +
            theme.title('│'),
    );
    console.log(
        theme.title('│') +
            `  ${theme.dim('Splitting:')}  ${theme.value(splitDisplay)}`.padEnd(
                63,
            ) +
            theme.title('│'),
    );
    console.log(
        theme.title('│') +
            `  ${theme.dim('Redaction:')}  ${theme.value(sanitizeDisplay)}`.padEnd(
                63,
            ) +
            theme.title('│'),
    );
    console.log(
        theme.title('└──────────────────────────────────────────────────────┘'),
    );
    console.log('');

    const startExport = await confirm({
        message: chalk.bold('Start export now?'),
        default: true,
    });

    if (!startExport) {
        console.log(
            theme.info('\n  Export cancelled. Run again when ready!\n'),
        );
        process.exit(0);
    }

    console.log('');

    return {...DEFAULT_CONFIG, ...config};
}

export function showSetupGuide(): void {
    console.log('');
    console.log(
        theme.title(
            '╔══════════════════════════════════════════════════════════════════════╗',
        ),
    );
    console.log(
        theme.title('║') +
            chalk.bold.white(
                '              📧 Gmail Export - Setup Guide                          ',
            ) +
            theme.title('║'),
    );
    console.log(
        theme.title(
            '╚══════════════════════════════════════════════════════════════════════╝',
        ),
    );
    console.log('');

    console.log(theme.step('━━━ Step 1: Create a Google Cloud Project ━━━'));
    console.log('');
    console.log(
        `  ${theme.info('1.')} Go to: ${theme.highlight('https://console.cloud.google.com/')}`,
    );
    console.log(
        `  ${theme.info('2.')} Click the project dropdown (top left) → ${theme.highlight('"New Project"')}`,
    );
    console.log(
        `  ${theme.info('3.')} Name it something like ${theme.value('"Gmail Export"')} → Create`,
    );
    console.log(
        `  ${theme.info('4.')} Wait for it to be created, then select it`,
    );
    console.log('');

    console.log(theme.step('━━━ Step 2: Enable the Gmail API ━━━'));
    console.log('');
    console.log(`  ${theme.info('1.')} In Google Cloud Console, go to:`);
    console.log(`     ${theme.highlight('APIs & Services → Library')}`);
    console.log(
        `  ${theme.info('2.')} Search for ${theme.value('"Gmail API"')}`,
    );
    console.log(
        `  ${theme.info('3.')} Click on it → Click ${theme.highlight('"Enable"')}`,
    );
    console.log('');

    console.log(theme.step('━━━ Step 3: Configure OAuth Consent Screen ━━━'));
    console.log('');
    console.log(
        `  ${theme.info('1.')} Go to: ${theme.highlight('APIs & Services → OAuth consent screen')}`,
    );
    console.log(
        `  ${theme.info('2.')} Select ${theme.value('"External"')} → Create`,
    );
    console.log(`  ${theme.info('3.')} Fill in required fields:`);
    console.log(`     • App name: ${theme.value('"Gmail Export"')}`);
    console.log(`     • User support email: ${theme.dim('your email')}`);
    console.log(`     • Developer contact: ${theme.dim('your email')}`);
    console.log(
        `  ${theme.info('4.')} Click "Save and Continue" through the scopes page`,
    );
    console.log(
        `  ${theme.info('5.')} ${theme.warning('⚠️  IMPORTANT:')} On "Test users" page:`,
    );
    console.log(
        `     Click ${theme.highlight('"Add Users"')} and add ${theme.highlight('YOUR Gmail address')}`,
    );
    console.log(`  ${theme.info('6.')} Save and Continue → Back to Dashboard`);
    console.log('');

    console.log(theme.step('━━━ Step 4: Create OAuth Credentials ━━━'));
    console.log('');
    console.log(
        `  ${theme.info('1.')} Go to: ${theme.highlight('APIs & Services → Credentials')}`,
    );
    console.log(
        `  ${theme.info('2.')} Click ${theme.highlight('"Create Credentials"')} → ${theme.highlight('"OAuth client ID"')}`,
    );
    console.log(
        `  ${theme.info('3.')} Application type: ${theme.value('"Desktop app"')}`,
    );
    console.log(
        `  ${theme.info('4.')} Name: anything (e.g., "Gmail Export CLI")`,
    );
    console.log(`  ${theme.info('5.')} Click "Create"`);
    console.log(
        `  ${theme.info('6.')} Click ${theme.highlight('"Download JSON"')} on the popup`,
    );
    console.log(
        `  ${theme.info('7.')} Save the file as ${theme.highlight('credentials.json')} in your project folder:`,
    );
    console.log(`     ${theme.dim(process.cwd() + '/credentials.json')}`);
    console.log('');

    console.log(theme.step('━━━ Step 5: Run the Export ━━━'));
    console.log('');
    console.log(
        `  ${theme.info('1.')} Make sure ${theme.highlight('credentials.json')} is in your project folder`,
    );
    console.log(
        `  ${theme.info('2.')} Run: ${theme.highlight('npm run interactive')}`,
    );
    console.log(
        `  ${theme.info('3.')} First time: a browser will open to authorize the app`,
    );
    console.log(`     • Sign in with YOUR Gmail account`);
    console.log(`     • Click "Continue" (even if it shows a warning)`);
    console.log(`     • Copy the authorization code from the redirect`);
    console.log(`     • Paste it back in the terminal`);
    console.log(
        `  ${theme.info('4.')} A ${theme.highlight('token.json')} will be saved (don't commit this!)`,
    );
    console.log(
        `  ${theme.info('5.')} Future runs won't need re-authorization`,
    );
    console.log('');

    console.log(
        theme.title(
            '──────────────────────────────────────────────────────────────────────',
        ),
    );
    console.log(theme.error('  Troubleshooting'));
    console.log(
        theme.title(
            '──────────────────────────────────────────────────────────────────────',
        ),
    );
    console.log('');
    console.log(`  ${theme.error('"Error 403: access_denied"')}`);
    console.log(
        `  → Add yourself as a ${theme.highlight('Test User')} in OAuth consent screen`,
    );
    console.log('');
    console.log(`  ${theme.error('"Gmail API has not been used..."')}`);
    console.log(`  → Enable ${theme.highlight('Gmail API')} in your project`);
    console.log('');
    console.log(`  ${theme.error('"redirect_uri_mismatch"')}`);
    console.log(
        `  → Make sure you created a ${theme.highlight('"Desktop app"')} credential, not "Web"`,
    );
    console.log('');
}

export function showFieldsList(): void {
    console.log('');
    console.log(
        theme.title(
            '╔══════════════════════════════════════════════════════════════════════╗',
        ),
    );
    console.log(
        theme.title('║') +
            chalk.bold.white(
                '              📋 Available Export Fields                            ',
            ) +
            theme.title('║'),
    );
    console.log(
        theme.title(
            '╚══════════════════════════════════════════════════════════════════════╝',
        ),
    );
    console.log('');

    const categories = [
        'sender',
        'recipient',
        'content',
        'metadata',
        'attachments',
    ] as const;
    const categoryLabels: Record<
        (typeof categories)[number],
        {icon: string; name: string}
    > = {
        sender: {icon: '👤', name: 'Sender Information'},
        recipient: {icon: '📬', name: 'Recipient Information'},
        content: {icon: '📝', name: 'Content'},
        metadata: {icon: '🏷️ ', name: 'Metadata'},
        attachments: {icon: '📎', name: 'Attachments'},
    };

    for (const category of categories) {
        const fields = FIELD_DEFINITIONS.filter((f) => f.category === category);
        const {icon, name} = categoryLabels[category];

        console.log(theme.step(`  ${icon} ${name}`));
        console.log(theme.dim('  ' + '─'.repeat(40)));

        for (const field of fields) {
            const defaultMarker = field.default
                ? theme.success(' (default)')
                : '';
            console.log(`    ${theme.field(field.name)}${defaultMarker}`);
            console.log(`    ${theme.dim(field.description)}`);
            console.log('');
        }
    }

    console.log(
        theme.title(
            '──────────────────────────────────────────────────────────────────────',
        ),
    );
    console.log(
        `  Use ${theme.highlight('--fields')} to select specific fields:`,
    );
    console.log(
        `  ${theme.dim('npx gmail-export --fields "from_email,subject,date,body_text"')}`,
    );
    console.log('');
}

export function initConfigFile(): void {
    const configPath = path.join(process.cwd(), 'gmail-export.config.json');

    if (fs.existsSync(configPath)) {
        console.log(
            theme.warning(`\n  ⚠️  Config file already exists: ${configPath}`),
        );
        console.log(
            theme.dim('     Delete it first if you want to regenerate.\n'),
        );
        return;
    }

    const sample = {
        query: '-in:sent -in:spam -in:trash',
        maxMessages: 0,
        outputDir: './exports',
        outputPrefix: 'gmail_export',
        includeTimestamp: true,
        bodyMaxChars: 8000,
        fields: DEFAULT_FIELDS,
    };

    fs.writeFileSync(configPath, JSON.stringify(sample, null, 4));
    console.log(theme.success(`\n  ✓ Created sample config: ${configPath}`));
    console.log(
        theme.dim('    Edit this file to customize your export settings.\n'),
    );
}
