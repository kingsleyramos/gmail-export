# gmail-export

Export structured metadata from your Gmail account to CSV files. Easy to use, highly customizable.

## Features

- **Interactive setup mode** - Guided prompts walk you through configuration
- **Flexible configuration** - Use config files, CLI arguments, or both
- **21 exportable fields** - From basic (sender, subject) to detailed (body text, thread IDs)
- **Smart output management** - Timestamped filenames, automatic file splitting for large exports
- **Read-only access** - Uses Gmail's read-only scope (cannot modify your emails)

## Quick Start

```bash
# Install dependencies
npm install

# Run interactive setup (recommended for first-time users)
npm run interactive

# Or run with defaults
npm run export
```

## Requirements

- **Node.js** v18 or higher (v20+ recommended)
- **Gmail or Google Workspace account**
- **Gmail API credentials** (see [Setup Guide](#gmail-api-setup))

## Installation

```bash
git clone https://github.com/kingsleyramos/gmail-export.git
cd gmail-export
npm install
```

## Gmail API Setup

First-time users need to set up Gmail API access. Run the built-in guide:

```bash
npm run setup
```

Or follow these steps:

### 1. Create a Google Cloud Project
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project (e.g., "Gmail Export")

### 2. Enable Gmail API
1. Go to **APIs & Services → Library**
2. Search for "Gmail API" and click **Enable**

### 3. Configure OAuth Consent Screen
1. Go to **APIs & Services → OAuth consent screen**
2. Select **External** → Create
3. Fill required fields (app name, support email)
4. **Important:** Add your Gmail address as a **Test User**

### 4. Create OAuth Credentials
1. Go to **APIs & Services → Credentials**
2. Click **Create Credentials → OAuth client ID**
3. Select **Desktop app**
4. Download JSON and save as `credentials.json` in project root

## Usage

### Interactive Mode (Recommended)

```bash
npm run interactive
```

This walks you through:
- Selecting which emails to export
- Choosing fields to include
- Configuring output settings
- Optionally saving your settings for future use

### Quick Export with Defaults

```bash
npm run export
```

Exports received mail (excluding sent, spam, trash) with default fields.

### Using CLI Arguments

```bash
# Export emails from a specific sender
npm run export -- --query "from:newsletter@example.com"

# Export only 100 emails (for testing)
npm run export -- --max-messages 100

# Export specific fields
npm run export -- --fields "from_email,subject,date,body_text"

# Custom output location
npm run export -- --output-dir ./my-backup --prefix my_emails

# Skip timestamp in filename
npm run export -- --no-timestamp
```

### Using a Config File

Create `gmail-export.config.json` in your project root:

```json
{
    "query": "-in:sent -in:spam -in:trash",
    "maxMessages": 0,
    "outputDir": "./exports",
    "outputPrefix": "gmail_export",
    "includeTimestamp": true,
    "fields": [
        "from_email",
        "from_name",
        "subject",
        "date",
        "snippet"
    ]
}
```

Or generate a sample config:

```bash
npm run export -- --init
```

## CLI Options

| Option | Short | Description |
|--------|-------|-------------|
| `--interactive` | `-i` | Launch interactive setup mode |
| `--setup` | | Show Gmail API setup guide |
| `--init` | | Create sample config file |
| `--list-fields` | | Show all available export fields |
| `--config <path>` | `-c` | Path to config file |
| `--query <query>` | `-q` | Gmail search query |
| `--max-messages <n>` | `-m` | Limit number of messages (0 = unlimited) |
| `--output-dir <dir>` | `-o` | Output directory |
| `--prefix <name>` | `-p` | Output filename prefix |
| `--fields <list>` | `-f` | Comma-separated list of fields |
| `--no-timestamp` | | Don't add timestamp to filename |
| `--body-max-chars <n>` | | Max characters for body_text |
| `--credentials <path>` | | Path to credentials.json |
| `--help` | `-h` | Show help |

## Configuration Priority

Settings are merged in this order (later overrides earlier):

1. **Defaults** - Built-in sensible defaults
2. **Config file** - `gmail-export.config.json`
3. **CLI arguments** - Command-line flags

## Output

Exports are saved to the `exports/` directory by default.

### Filename Format

```
{prefix}_{timestamp}.csv
{prefix}_{timestamp}_part002.csv  (if split)
```

Example: `gmail_export_20250129_143052.csv`

### File Splitting

Large exports are automatically split at 250MB per file. Customize with `maxBytesPerFile` in config.

## Available Fields

Run `npm run export -- --list-fields` to see all fields with descriptions.

| Category | Fields |
|----------|--------|
| **Sender** | `from_email`, `from_name`, `sender_domain`, `reply_to`, `reply_to_domain` |
| **Recipient** | `delivered_to`, `to`, `cc`, `bcc` |
| **Content** | `subject`, `snippet`, `body_text`, `body_html` |
| **Metadata** | `date`, `message_id`, `thread_id`, `labels` |
| **Attachments** | `has_attachment`, `attachment_types`, `attachment_count`, `has_list_unsubscribe` |

See [docs/FIELDS.md](docs/FIELDS.md) for detailed descriptions.

## Common Queries

| What you want | Query |
|--------------|-------|
| All received mail | `-in:sent -in:spam -in:trash` |
| Inbox only | `in:inbox` |
| From specific sender | `from:example@gmail.com` |
| With attachments | `has:attachment` |
| Starred emails | `is:starred` |
| Unread emails | `is:unread` |
| Date range | `after:2024/01/01 before:2024/12/31` |
| By label | `label:important` |
| Search content | `subject:invoice` or `"invoice"` |

Combine queries: `from:amazon.com has:attachment after:2024/01/01`

## Project Structure

```
gmail-export/
├── src/                    # Source code
│   ├── index.ts           # CLI entry point
│   ├── config.ts          # Configuration loading
│   ├── interactive.ts     # Interactive prompts
│   ├── auth.ts            # Gmail OAuth
│   ├── exporter.ts        # Export logic
│   ├── parser.ts          # Email parsing
│   ├── csv.ts             # CSV output
│   └── types.ts           # TypeScript types
├── config/                 # Config templates
├── docs/                   # Additional documentation
├── exports/                # Output directory (gitignored)
├── credentials.json        # Your OAuth credentials (gitignored)
├── token.json             # Auth token (gitignored)
└── gmail-export.config.json # Your config (optional)
```

## Security

**Do not commit these files:**
- `credentials.json` - OAuth client secret
- `token.json` - Your refresh token
- `exports/*.csv` - Personal email data
- `gmail-export.config.json` - May contain sensitive queries

These are already in `.gitignore`.

## Troubleshooting

### "Error 403: access_denied"
Add yourself as a Test User in OAuth consent screen.

### "Gmail API has not been used in project..."
Enable Gmail API in your Google Cloud project.

### "redirect_uri_mismatch"
Make sure you created a "Desktop app" credential, not "Web".

### Rate limit errors
Reduce concurrency or add delays. The Gmail API has quotas.

### Node experimental warnings
Expected with `--loader ts-node/esm` on newer Node versions. Safe to ignore.

## License

ISC
