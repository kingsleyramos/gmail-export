# Gmail Metadata Export

Export structured metadata from a Gmail account using the Gmail API, Node.js, and TypeScript.

This project exports **headers and snippets only**. Email bodies and attachments are not downloaded.

---

## What This Exports

Each email is written as a single CSV row with the following columns:

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

---

## What Is Excluded

By default, the export excludes:

-   Sent mail
-   Spam
-   Trash

The default Gmail search query used is:

```ts
-in:sent -in:spam -in:trash
```

Only received, non-spam messages are included.

---

## Requirements

-   Node.js v18+ (v20+ recommended)
-   npm
-   Gmail or Google Workspace account

---

## Google Cloud Setup (One Time)

1. Create a Google Cloud project
2. Enable the **Gmail API**
3. Create an **OAuth Client ID**

    - Application type: Desktop app

4. Download the OAuth credentials
5. Rename the file to:

    ```
    credentials.json
    ```

6. Place it in the project root

---

## Install Dependencies

```bash
npm install
```

---

## Run the Export

```bash
npm run exportv2
```

On first run:

-   You will be prompted to authorize Gmail read-only access
-   A `token.json` file will be saved locally

Subsequent runs reuse the token and do not require login.

---

## Output

The script generates:

```
gmail_export_v2.csv
```

Progress output includes:

-   Number of emails exported
-   Percentage of mailbox processed
-   Processing rate (emails/second)
-   Estimated time remaining

---

## Customization

### Change which emails are exported

Edit this line in `exportGmail_v2.ts`:

```ts
const QUERY = '-in:sent -in:spam -in:trash';
```

Examples:

```ts
'in:inbox';
'from:amazon.com';
'label:receipts';
'in:anywhere';
```

### Limit export size (for testing)

```ts
const MAX_MESSAGES = 100;
```

Set to `0` for no limit.

---

## Cost and Billing

-   Gmail API usage is free
-   No billing account required
-   No per-request charges
-   Running multiple scripts does not incur cost

Only Gmail API quotas apply; normal usage is far below limits.

---

## Security

The following files must never be committed:

-   credentials.json
-   token.json
-   \*.csv

They are excluded via `.gitignore`.

---

## Notes

-   Progress percentage is based on total mailbox size
-   If a query filter is used, progress may stop below 100%
-   Attachment detection is based on MIME metadata only

---
