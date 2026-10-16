/**
 * Optional project configuration (.enchanted-agentfile.json).
 *
 * The file is JSON with two documented keys:
 *   { "source": "AGENTS.md", "tools": ["claude", "cursor", "copilot"] }
 *
 * Unknown keys are rejected so a typo never silently changes behavior.
 *
 * @module lib/config
 */

import { readText } from './util.mjs';

/** Default config file name. */
export const CONFIG_FILE = '.enchanted-agentfile.json';

const KNOWN_KEYS = new Set(['source', 'tools']);

/**
 * @typedef {Object} Config
 * @property {string} source
 * @property {string[]} tools
 * @property {string|null} path Path the config was loaded from, or null.
 */

/**
 * Load and validate a config file.
 * @param {string} configPath Absolute path.
 * @returns {{config: Config, error: null}|{config: null, error: string}}
 */
export function loadConfig(configPath) {
  const text = readText(configPath);
  if (text == null) {
    return { config: null, error: null };
  }

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    return { config: null, error: `${configPath}: invalid JSON (${err.message})` };
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { config: null, error: `${configPath}: expected a JSON object` };
  }
  for (const key of Object.keys(parsed)) {
    if (!KNOWN_KEYS.has(key)) {
      return {
        config: null,
        error: `${configPath}: unknown key "${key}" (allowed: source, tools)`,
      };
    }
  }

  const source = parsed.source === undefined ? 'AGENTS.md' : parsed.source;
  if (typeof source !== 'string' || source.trim() === '') {
    return { config: null, error: `${configPath}: "source" must be a non-empty string` };
  }

  let tools = [];
  if (parsed.tools !== undefined) {
    if (!Array.isArray(parsed.tools) || parsed.tools.some((t) => typeof t !== 'string')) {
      return { config: null, error: `${configPath}: "tools" must be an array of strings` };
    }
    tools = parsed.tools;
  }

  return { config: { source, tools, path: configPath }, error: null };
}
