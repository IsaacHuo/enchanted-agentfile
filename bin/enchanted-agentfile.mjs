#!/usr/bin/env node
/**
 * CLI entry point. All logic lives in lib/cli.mjs so it can be imported by
 * tests; this file only wires the process streams and exit code.
 */
import { run } from '../lib/cli.mjs';

process.exitCode = run(process.argv.slice(2));
