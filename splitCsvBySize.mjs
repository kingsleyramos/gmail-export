// splitCsvBySize.mjs
// Splits a large CSV into multiple smaller CSV files by max size (MB), preserving the header row in each part.
// Does NOT modify the original CSV.
//
// Usage:
//   node splitCsvBySize.mjs --input ./file.csv --maxMB 30
//
// Options:
//   --input   Path to CSV (required)
//   --maxMB   Max size per output file in MB (required)
//   --outDir  Output directory (optional; default: same directory as input)
//   --prefix  Output prefix (optional; default: <inputBase>_split_)
//   --encoding (optional; default: utf8)
//
// Assumption: one record per line (your exporter enforces this by removing newlines inside fields).

import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';

function usage(msg) {
    if (msg) console.error(msg);
    console.error(`
Usage:
  node splitCsvBySize.mjs --input <file.csv> --maxMB <number> [--outDir <dir>] [--prefix <name>] [--encoding utf8]

Example:
  node splitCsvBySize.mjs --input ./gmail_export.csv --maxMB 30
`);
    process.exit(1);
}

function getArg(argv, name) {
    const idx = argv.indexOf(name);
    if (idx === -1) return undefined;
    const val = argv[idx + 1];
    if (!val || val.startsWith('--')) return undefined;
    return val;
}

function padPart(n) {
    return String(n).padStart(3, '0');
}

async function main() {
    const argv = process.argv.slice(2);

    const inputRaw = getArg(argv, '--input');
    const maxMBRaw = getArg(argv, '--maxMB');
    const outDirRaw = getArg(argv, '--outDir');
    const prefixRaw = getArg(argv, '--prefix');
    const encoding = getArg(argv, '--encoding') || 'utf8';

    if (!inputRaw) usage('Missing --input');
    if (!maxMBRaw) usage('Missing --maxMB');

    const maxMB = Number(maxMBRaw);
    if (!Number.isFinite(maxMB) || maxMB <= 0)
        usage('--maxMB must be a positive number (e.g. 30)');

    const input = path.resolve(inputRaw);
    if (!fs.existsSync(input)) usage(`Input file not found: ${input}`);
    const st = fs.statSync(input);
    if (!st.isFile()) usage(`Input path is not a file: ${input}`);

    const outDir = outDirRaw ? path.resolve(outDirRaw) : path.dirname(input);
    fs.mkdirSync(outDir, {recursive: true});

    const inputBase = path.basename(input, path.extname(input));
    const prefix = prefixRaw || `${inputBase}_split_`;

    const maxBytes = Math.floor(maxMB * 1024 * 1024);

    console.log(`Input: ${input} (${Math.round(st.size / (1024 * 1024))}MB)`);
    console.log(`Output dir: ${outDir}`);
    console.log(`Max per part: ${maxMB}MB`);

    const rl = readline.createInterface({
        input: fs.createReadStream(input, {encoding}),
        crlfDelay: Infinity,
    });

    let header = null;
    let part = 1;

    let outPath = path.join(outDir, `${prefix}${padPart(part)}.csv`);
    let out = fs.createWriteStream(outPath, {encoding});

    let bytesInPart = 0;
    let inputLines = 0;
    let dataLines = 0;

    const writeLine = (line) => {
        const row = line + '\n';
        out.write(row);
        bytesInPart += Buffer.byteLength(row, encoding);
    };

    const rotate = () => {
        out.end();
        part += 1;
        outPath = path.join(outDir, `${prefix}${padPart(part)}.csv`);
        out = fs.createWriteStream(outPath, {encoding});
        bytesInPart = 0;

        if (header !== null) {
            writeLine(header);
        }

        console.log(`Started: ${path.basename(outPath)}`);
    };

    for await (const line of rl) {
        inputLines++;

        if (header === null) {
            header = line;
            writeLine(header);
            continue;
        }

        const rowBytes = Buffer.byteLength(line + '\n', encoding);

        // If adding this row exceeds the limit, rotate first.
        // If a single row > maxBytes, we still write it (cannot split a row safely).
        if (bytesInPart > 0 && bytesInPart + rowBytes > maxBytes) {
            rotate();
        }

        writeLine(line);
        dataLines++;

        if (dataLines % 200000 === 0) {
            console.log(
                `Progress: ${dataLines.toLocaleString()} rows | parts=${part} | current=${Math.round(
                    bytesInPart / (1024 * 1024)
                )}MB`
            );
        }
    }

    out.end();

    console.log('Done.');
    console.log(`Input lines read: ${inputLines.toLocaleString()}`);
    console.log(`Data rows written: ${dataLines.toLocaleString()}`);
    console.log(`Parts created: ${part}`);
}

main().catch((err) => {
    console.error('splitCsvBySize failed:', err?.stack || err);
    process.exit(1);
});
