// src/config.ts
// Configuration loading from file, CLI args, and defaults

import fs from 'node:fs';
import path from 'node:path';
import {ExportConfig, ExportField, DEFAULT_FIELDS, ALL_FIELDS} from './types.js';

const CONFIG_FILENAME = 'gmail-export.config.json';

export const DEFAULT_CONFIG: ExportConfig = {
    // Query
    query: '-in:sent -in:spam -in:trash',
    maxMessages: 0,

    // Output
    outputDir: './exports',
    outputPrefix: 'gmail_export',
    maxBytesPerFile: 250 * 1024 * 1024, // 250MB
    includeTimestamp: true,

    // Content
    fields: DEFAULT_FIELDS,
    bodyMaxChars: 8000,

    // Auth
    credentialsPath: './credentials.json',
    tokenPath: './token.json',
};

export function findConfigFile(): string | null {
    const locations = [
        path.join(process.cwd(), CONFIG_FILENAME),
        path.join(process.cwd(), 'config', CONFIG_FILENAME),
    ];

    for (const loc of locations) {
        if (fs.existsSync(loc)) {
            return loc;
        }
    }
    return null;
}

export function loadConfigFile(configPath?: string): Partial<ExportConfig> {
    const filePath = configPath || findConfigFile();

    if (!filePath || !fs.existsSync(filePath)) {
        return {};
    }

    try {
        const raw = fs.readFileSync(filePath, 'utf8');
        const parsed = JSON.parse(raw);
        console.log(`📄 Loaded config from: ${filePath}`);
        return validatePartialConfig(parsed);
    } catch (err) {
        console.warn(`⚠️  Warning: Could not parse config file: ${filePath}`);
        return {};
    }
}

function validatePartialConfig(obj: unknown): Partial<ExportConfig> {
    if (typeof obj !== 'object' || obj === null) {
        return {};
    }

    const config: Partial<ExportConfig> = {};
    const input = obj as Record<string, unknown>;

    if (typeof input.query === 'string') config.query = input.query;
    if (typeof input.maxMessages === 'number') config.maxMessages = input.maxMessages;
    if (typeof input.outputDir === 'string') config.outputDir = input.outputDir;
    if (typeof input.outputPrefix === 'string') config.outputPrefix = input.outputPrefix;
    if (typeof input.maxBytesPerFile === 'number') config.maxBytesPerFile = input.maxBytesPerFile;
    if (typeof input.includeTimestamp === 'boolean') config.includeTimestamp = input.includeTimestamp;
    if (typeof input.bodyMaxChars === 'number') config.bodyMaxChars = input.bodyMaxChars;
    if (typeof input.credentialsPath === 'string') config.credentialsPath = input.credentialsPath;
    if (typeof input.tokenPath === 'string') config.tokenPath = input.tokenPath;

    if (Array.isArray(input.fields)) {
        const validFields = input.fields.filter(
            (f): f is ExportField => typeof f === 'string' && ALL_FIELDS.includes(f as ExportField)
        );
        if (validFields.length > 0) {
            config.fields = validFields;
        }
    }

    return config;
}

export interface CLIArgs {
    config?: string;
    query?: string;
    maxMessages?: number;
    outputDir?: string;
    outputPrefix?: string;
    fields?: string;
    noTimestamp?: boolean;
    bodyMaxChars?: number;
    credentialsPath?: string;
    interactive?: boolean;
    setup?: boolean;
    help?: boolean;
    listFields?: boolean;
    init?: boolean;
}

export function parseArgs(argv: string[]): CLIArgs {
    const args: CLIArgs = {};

    for (let i = 2; i < argv.length; i++) {
        const arg = argv[i];
        const next = argv[i + 1];

        switch (arg) {
            case '-c':
            case '--config':
                args.config = next;
                i++;
                break;
            case '-q':
            case '--query':
                args.query = next;
                i++;
                break;
            case '-m':
            case '--max-messages':
                args.maxMessages = parseInt(next ?? '0', 10);
                i++;
                break;
            case '-o':
            case '--output-dir':
                args.outputDir = next;
                i++;
                break;
            case '-p':
            case '--prefix':
                args.outputPrefix = next;
                i++;
                break;
            case '-f':
            case '--fields':
                args.fields = next;
                i++;
                break;
            case '--no-timestamp':
                args.noTimestamp = true;
                break;
            case '--body-max-chars':
                args.bodyMaxChars = parseInt(next ?? '8000', 10);
                i++;
                break;
            case '--credentials':
                args.credentialsPath = next;
                i++;
                break;
            case '-i':
            case '--interactive':
                args.interactive = true;
                break;
            case '--setup':
                args.setup = true;
                break;
            case '-h':
            case '--help':
                args.help = true;
                break;
            case '--list-fields':
                args.listFields = true;
                break;
            case '--init':
                args.init = true;
                break;
        }
    }

    return args;
}

export function argsToConfig(args: CLIArgs): Partial<ExportConfig> {
    const config: Partial<ExportConfig> = {};

    if (args.query) config.query = args.query;
    if (args.maxMessages !== undefined) config.maxMessages = args.maxMessages;
    if (args.outputDir) config.outputDir = args.outputDir;
    if (args.outputPrefix) config.outputPrefix = args.outputPrefix;
    if (args.noTimestamp) config.includeTimestamp = false;
    if (args.bodyMaxChars !== undefined) config.bodyMaxChars = args.bodyMaxChars;
    if (args.credentialsPath) config.credentialsPath = args.credentialsPath;

    if (args.fields) {
        const fieldList = args.fields.split(',').map((f) => f.trim());
        const validFields = fieldList.filter(
            (f): f is ExportField => ALL_FIELDS.includes(f as ExportField)
        );
        if (validFields.length > 0) {
            config.fields = validFields;
        }
    }

    return config;
}

export function mergeConfigs(...configs: Partial<ExportConfig>[]): ExportConfig {
    const merged = {...DEFAULT_CONFIG};

    for (const config of configs) {
        if (config.query !== undefined) merged.query = config.query;
        if (config.maxMessages !== undefined) merged.maxMessages = config.maxMessages;
        if (config.outputDir !== undefined) merged.outputDir = config.outputDir;
        if (config.outputPrefix !== undefined) merged.outputPrefix = config.outputPrefix;
        if (config.maxBytesPerFile !== undefined) merged.maxBytesPerFile = config.maxBytesPerFile;
        if (config.includeTimestamp !== undefined) merged.includeTimestamp = config.includeTimestamp;
        if (config.fields !== undefined) merged.fields = config.fields;
        if (config.bodyMaxChars !== undefined) merged.bodyMaxChars = config.bodyMaxChars;
        if (config.credentialsPath !== undefined) merged.credentialsPath = config.credentialsPath;
        if (config.tokenPath !== undefined) merged.tokenPath = config.tokenPath;
    }

    return merged;
}

export function printHelp(): void {
    console.log(`
📧 gmail-export - Export Gmail metadata to CSV

USAGE:
  npx gmail-export [options]
  npm run export -- [options]

OPTIONS:
  -i, --interactive     Launch interactive mode with guided prompts
  --setup               Show Gmail API setup guide
  --init                Create a sample config file
  --list-fields         Show all available export fields

  -c, --config <path>   Path to config file (default: gmail-export.config.json)
  -q, --query <query>   Gmail search query (default: "-in:sent -in:spam -in:trash")
  -m, --max-messages N  Limit number of messages (0 = unlimited)
  -o, --output-dir      Output directory (default: ./exports)
  -p, --prefix          Output filename prefix (default: gmail_export)
  -f, --fields          Comma-separated list of fields to export
  --no-timestamp        Don't add timestamp to output filename
  --body-max-chars N    Max characters for body_text field (default: 8000)
  --credentials <path>  Path to credentials.json

  -h, --help            Show this help message

EXAMPLES:
  # Interactive mode (recommended for first-time users)
  npx gmail-export --interactive

  # Quick export with defaults
  npx gmail-export

  # Export only emails from a specific sender
  npx gmail-export --query "from:newsletter@example.com"

  # Export specific fields only
  npx gmail-export --fields "from_email,subject,date,body_text"

  # Limit to 100 messages for testing
  npx gmail-export --max-messages 100

  # Custom output location
  npx gmail-export --output-dir ./my-exports --prefix my_backup

CONFIG FILE:
  Create gmail-export.config.json in your project root:
  
  {
    "query": "-in:sent -in:spam -in:trash",
    "maxMessages": 0,
    "outputDir": "./exports",
    "fields": ["from_email", "from_name", "subject", "date"]
  }

For more information, see README.md and docs/FIELDS.md
`);
}

export function generateSampleConfig(): string {
    const sample = {
        query: '-in:sent -in:spam -in:trash',
        maxMessages: 0,
        outputDir: './exports',
        outputPrefix: 'gmail_export',
        includeTimestamp: true,
        bodyMaxChars: 8000,
        fields: DEFAULT_FIELDS,
    };
    return JSON.stringify(sample, null, 4);
}
