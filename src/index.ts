#!/usr/bin/env node
// src/index.ts
// Main entry point for gmail-export CLI

import path from 'node:path';
import {
    parseArgs,
    loadConfigFile,
    argsToConfig,
    mergeConfigs,
    printHelp,
} from './config.js';
import {
    runInteractiveSetup,
    showSetupGuide,
    showFieldsList,
    initConfigFile,
} from './interactive.js';
import {authorize} from './auth.js';
import {runExport} from './exporter.js';

async function main() {
    const args = parseArgs(process.argv);

    // Handle utility commands first
    if (args.help) {
        printHelp();
        process.exit(0);
    }

    if (args.guide) {
        showSetupGuide();
        process.exit(0);
    }

    if (args.listFields) {
        showFieldsList();
        process.exit(0);
    }

    if (args.init) {
        initConfigFile();
        process.exit(0);
    }

    // Load configuration
    let config;

    if (args.setup) {
        // Interactive mode - guided setup
        config = await runInteractiveSetup();
    } else {
        // Non-interactive: merge defaults + file + CLI args
        const fileConfig = loadConfigFile(args.config);
        const cliConfig = argsToConfig(args);
        config = mergeConfigs(fileConfig, cliConfig);
    }

    // Resolve paths relative to cwd
    config.credentialsPath = path.resolve(
        process.cwd(),
        config.credentialsPath,
    );
    config.tokenPath = path.resolve(process.cwd(), config.tokenPath);
    config.outputDir = path.resolve(process.cwd(), config.outputDir);

    // Authenticate
    const auth = await authorize(config.credentialsPath, config.tokenPath);

    // Run export
    await runExport(auth, config);
}

// Error handling
process.on('unhandledRejection', (reason) => {
    console.error('\n❌ UNHANDLED ERROR:', reason);
    process.exit(1);
});

process.on('uncaughtException', (err) => {
    console.error('\n❌ UNCAUGHT EXCEPTION:', err);
    process.exit(1);
});

main().catch((err) => {
    console.error('\n❌ Export failed:', err.message || err);
    if (process.env.DEBUG) {
        console.error(err);
    }
    process.exit(1);
});
