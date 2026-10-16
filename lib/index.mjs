/**
 * Public programmatic API. The CLI is a thin wrapper over these functions.
 * @module lib/index
 */

export { TOOLS, toolById, generationTools, targetsOf, DEFAULT_SOURCE } from './tools.mjs';
export { EXIT, STATUS, makeContext, collectEntries, diagnoseEntry, planSync, applySync, runCheck } from './engine.mjs';
export { runDoctor, LABEL } from './doctor.mjs';
export { renderBlock, extractBlockBody, findBlock, upsertBlock, hasBlock } from './markers.mjs';
export { renderBody, expectedContent, resolveTargetAbs } from './plan.mjs';
export { unified, diffLines } from './diff.mjs';
export { loadConfig, CONFIG_FILE } from './config.mjs';
