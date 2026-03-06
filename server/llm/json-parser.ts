import { logger } from '../logger.js';

export function robustJsonParse<T>(text: string): T {
  // Layer 1: Strip markdown code block markers
  let cleaned = text.replace(/^```(?:json)?\s*\n?/gm, '').replace(/\n?```\s*$/gm, '').trim();

  // Layer 2: Direct JSON.parse
  try {
    return JSON.parse(cleaned) as T;
  } catch { /* continue */ }

  // Layer 3: Extract JSON array
  const arrayMatch = cleaned.match(/\[[\s\S]*\]/);
  if (arrayMatch) {
    try {
      return JSON.parse(arrayMatch[0]) as T;
    } catch { /* continue */ }
  }

  // Layer 4: Extract JSON object
  const objectMatch = cleaned.match(/\{[\s\S]*\}/);
  if (objectMatch) {
    try {
      return JSON.parse(objectMatch[0]) as T;
    } catch { /* continue */ }
  }

  // Layer 5: Fix common issues (trailing commas, unescaped newlines)
  let fixed = cleaned
    .replace(/,\s*([}\]])/g, '$1')           // trailing commas
    .replace(/\n/g, '\\n')                     // unescaped newlines in strings
    .replace(/\t/g, '\\t');                    // unescaped tabs
  try {
    return JSON.parse(fixed) as T;
  } catch { /* continue */ }

  // Layer 5b: Try fixing the extracted object/array
  if (objectMatch) {
    fixed = objectMatch[0]
      .replace(/,\s*([}\]])/g, '$1')
      .replace(/(?<=:\s*"[^"]*)\n/g, '\\n');
    try {
      return JSON.parse(fixed) as T;
    } catch { /* continue */ }
  }

  // Layer 6: Extract individual JSON objects and assemble array
  const objects: any[] = [];
  const regex = /\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g;
  let match;
  while ((match = regex.exec(cleaned)) !== null) {
    try {
      objects.push(JSON.parse(match[0]));
    } catch { /* skip invalid */ }
  }
  if (objects.length > 0) {
    return objects as unknown as T;
  }

  logger.error('JSON parse failed after all layers', { text: text.slice(0, 500) });
  throw new Error(`Failed to parse JSON from LLM response: ${text.slice(0, 200)}`);
}
