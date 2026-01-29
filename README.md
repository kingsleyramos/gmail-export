# gmail-export

Export structured metadata from a Gmail account using the Gmail API, Node.js, and TypeScript. This exports headers/snippets (and optionally body, depending on the script you run). Attachments are not downloaded; attachment info is inferred from MIME metadata.

## What this project does

-   Authenticates to Gmail via OAuth (read-only)
-   Paginates through your mailbox
-   Writes rows to CSV

Your package is configured as an ESM project (`"type": "module"`).

## Requirements

-   Node.js v18+ (v20+ recommended). Your deps also work on newer Node, but `--loader ts-node/esm` prints warnings on recent Node versions (this is expected).
-   A Gmail or Google Workspace account

## One-time Google Cloud setup

### 1. Create a Google Cloud project

1. Go to Google Cloud Console
2. Create a new project (or select an existing one)

### 2. Enable the Gmail API

1. Go to “APIs & Services” → “Library”
2. Search for “Gmail API”
3. Click “Enable” ([Google for Developers][1])

If you skip this, you’ll get:
`Gmail API has not been used in project ... or it is disabled` (403).

### 3. Configure OAuth consent screen (fixes the 403 “only developer-approved testers”)

1. Go to “APIs & Services” → “OAuth consent screen”
2. Pick **External** (typical for personal Gmail)
3. Fill out the required fields (app name, support email, etc.)
4. In **Audience**, add your Gmail address under **Test users** ([Google for Developers][2])

If you don’t add yourself as a test user while the app is in Testing mode, Google blocks sign-in with:
`Error 403: access_denied ... can only be accessed by developer-approved testers`.

### 4. Create OAuth Client ID (Desktop app)

1. Go to “APIs & Services” → “Credentials”
2. “Create Credentials” → “OAuth client ID”
3. Application type: **Desktop app**
4. Download the JSON
5. Save it into the project root as `credentials.json`

Your repo expects a desktop-app credential JSON with `redirect_uris` including `http://localhost`.

## Local install

```bash
npm install
```

Your dependencies are `googleapis` and `@google-cloud/local-auth`.

## Runn Default script

Your current `package.json` has:

-   `npm run export` → runs `exportGmail_v2_with_body_split.ts`

Run:

```bash
npm run export
```

### First run authentication

On first run, the script prints an authorization URL. Open it, sign in, and c from the `http://localhost/?code=...` URL back into the terminal.

A `token.json` will be written locally and reused on future runs (so you don’t have to re-auth every time). Do not commit this file.

## Output files

Your CSV output filename depends on the script you run (v2/v2-with-body/split variants). The earlier README you had indicate:

-   from_email
-   from_name
-   sender_domain
-   reply_to_domain
-   delivered_to
-   subject
-   snippet
-   has_attachment
-   attachment_types
-   has_list_unsubscribe

## Which emails are included/excluded

A common default query for your exporters is:

-   Exclude sent mail
-   Exclude spam
-   Exclude trash

Exery:

```ts
-in:sent -in:spam -in:trash
```

So by default you export received mail and exclude spam/trash/sent.

If you ever see sent mail included, check the script’s `q:` value passed into `gmail.users.messages.list(...)`.

## Cost / billing

-   Gmail quire you to attach a billing account for this kind of personal export.
-   You are limited by quotas/rate limits, not per-request charges.
-   Running two scripts at the same time does not “double charge” you; it just increases API traffic and makes you more likely to hit quota/rate limits.

(If you hit rate limits, the fix is to reduce concurrency and/or add backoff.)

## Security and git hygiene

Do not commit:

-   `credentials.json` (OAuth client secret)
-   `token.json` (refresh token access)
-   any exported CSVs (they contain personal email data)

Minimum recommended `.gitignore`:

```gitignore
# secrets
credentials.json
token.json

# exports
*.csv

# node
node_modules/

# logs
npm-debug.log*
yarn-debug.log*
yarn-error.log*
pnpm-debug.log*
```

## Troubleshooting

### “Error 403: access_denied … only developer-approved testers”

-   Add your Gmail account as a **Test user** in OAuth consent screen while the app is in Testing mode. ([Google for Developers][2])

### “Gmail API has not been used in project … or it is disabled”

-   Enable Gmail API in your project. ([Google for Developers][1])

### Node prints `ExperimentalWarning: --experimental-loader`

-   Expected when running `node --loader ts-node/esm ...` on newer Node versions. It’s noisy but not the root cause of failures.
