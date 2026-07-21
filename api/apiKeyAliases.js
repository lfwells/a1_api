/**
 * Suggested by Copilot and I'm happy to go with it so we log
 * aliases and not API keys. No _actual_ student names will be
 * recorded here, only aliases we store with true identities
 * within University systems.
 */

import { readFileSync } from 'node:fs';

const content = readFileSync('config/apiKeyAliases.txt', 'utf8');

const apiKeyAliases = new Map();

for (const line of content.split('\n')) {
  const trimmed = line.trim();

  if (trimmed && !trimmed.startsWith('#')) {
    const [apiKey, alias] = trimmed.split('\t');
    apiKeyAliases.set(apiKey, alias);
  }
}

export default apiKeyAliases;