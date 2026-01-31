// src/csv.ts
// CSV writing utilities

import fs from 'node:fs';
import path from 'node:path';
import type {ExportField} from './types.js';

export function csvEscape(value: string): string {
    // Replace all newline variants (CRLF, LF, CR) with spaces
    const v = (value ?? '')
        .replace(/\r\n/g, ' ') // Windows CRLF
        .replace(/\n/g, ' ') // Unix LF
        .replace(/\r/g, ' ') // Old Mac CR
        .replace(/\s+/g, ' ') // Collapse multiple spaces
        .trim();
    if (/[",]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
    return v;
}

export function generateTimestamp(): string {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');

    return [
        now.getFullYear(),
        pad(now.getMonth() + 1),
        pad(now.getDate()),
        '_',
        pad(now.getHours()),
        pad(now.getMinutes()),
        pad(now.getSeconds()),
    ].join('');
}

export interface OutputManager {
    write(row: Record<ExportField, string>): void;
    close(): void;
    getCurrentPath(): string;
    getFilesCreated(): string[];
    getBytesWritten(): number;
}

export function createOutputManager(options: {
    outputDir: string;
    prefix: string;
    includeTimestamp: boolean;
    maxBytesPerFile: number;
    fields: ExportField[];
}): OutputManager {
    const {outputDir, prefix, includeTimestamp, maxBytesPerFile, fields} =
        options;

    // Ensure output directory exists
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, {recursive: true});
    }

    const timestamp = includeTimestamp ? `_${generateTimestamp()}` : '';
    const baseFilename = `${prefix}${timestamp}`;

    let partIndex = 1;
    let currentPath = getPartPath(partIndex);
    let stream = fs.createWriteStream(currentPath, {encoding: 'utf8'});
    let bytesInCurrentFile = writeHeader(stream);
    let totalBytes = bytesInCurrentFile;
    const filesCreated: string[] = [currentPath];

    function getPartPath(part: number): string {
        const partSuffix =
            part > 1 ? `_part${String(part).padStart(3, '0')}` : '';
        return path.join(outputDir, `${baseFilename}${partSuffix}.csv`);
    }

    function writeHeader(s: fs.WriteStream): number {
        const headerLine = fields.join(',') + '\n';
        s.write(headerLine);
        return Buffer.byteLength(headerLine, 'utf8');
    }

    function rotateIfNeeded(nextLineBytes: number): void {
        // Check if adding the next line would exceed the limit
        if (
            maxBytesPerFile > 0 &&
            bytesInCurrentFile + nextLineBytes > maxBytesPerFile
        ) {
            stream.end();
            partIndex++;
            currentPath = getPartPath(partIndex);
            stream = fs.createWriteStream(currentPath, {encoding: 'utf8'});
            bytesInCurrentFile = writeHeader(stream);
            filesCreated.push(currentPath);
            console.log(`📄 Started new file: ${path.basename(currentPath)}`);
        }
    }

    return {
        write(row: Record<ExportField, string>): void {
            const values = fields.map((f) => csvEscape(row[f] ?? ''));
            const line = values.join(',') + '\n';
            const lineBytes = Buffer.byteLength(line, 'utf8');

            // Check and rotate BEFORE writing
            rotateIfNeeded(lineBytes);

            stream.write(line);
            bytesInCurrentFile += lineBytes;
            totalBytes += lineBytes;
        },

        close(): void {
            stream.end();
        },

        getCurrentPath(): string {
            return currentPath;
        },

        getFilesCreated(): string[] {
            return filesCreated;
        },

        getBytesWritten(): number {
            return totalBytes;
        },
    };
}

export function formatBytes(bytes: number): string {
    if (bytes < 1000) return `${bytes} B`;
    if (bytes < 1_000_000) return `${(bytes / 1000).toFixed(1)} KB`;
    if (bytes < 1_000_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`;
    return `${(bytes / 1_000_000_000).toFixed(2)} GB`;
}
