#!/usr/bin/env npx tsx
/**
 * i18n Key Usage Checker
 *
 * This script analyzes i18n translation files and checks if all keys are actually
 * used in the codebase. It outputs results in a machine-readable JSON format.
 *
 * Usage:
 *   npx tsx scripts/check-i18n-keys.ts [options]
 *
 * Options:
 *   --locale <locale>     Locale file to check (default: en)
 *   --fix                 Remove unused keys (writes changes to file)
 *   --json                Output only JSON (no human-readable summary)
 *   --verbose             Show detailed progress information
 *   --ignore <keys>       Comma-separated list of key patterns to ignore
 *
 * Output Format (JSON):
 *   {
 *     "timestamp": "2024-01-26T12:00:00.000Z",
 *     "locale": "en",
 *     "totalKeys": 100,
 *     "usedKeys": 90,
 *     "unusedKeys": ["key1", "key2"],
 *     "missingKeys": ["key3", "key4"],
 *     "dynamicKeyPatterns": ["views.*.title"],
 *     "duplicateValues": [
 *       { "value": "Submit", "keys": ["common.submit", "form.submit"] }
 *     ],
 *     "summary": {
 *       "unused": 10,
 *       "missing": 2,
 *       "dynamic": 5,
 *       "duplicateValues": 1
 *     },
 *     "exitCode": 1
 *   }
 *
 * Exit Codes:
 *   0 - No missing keys or duplicate values (showstoppers)
 *   1 - Missing keys or duplicate values found
 *   2 - Error during execution
 *
 * Note: Unused keys are reported but don't cause a non-zero exit code.
 *       They are informational and can be cleaned up with --fix.
 */

import * as fs from 'fs';
import * as path from 'path';

// Configuration
const CONFIG = {
  localesDir: 'src/client/locales',
  sourcePatterns: ['src/client/**/*.vue', 'src/client/**/*.ts'],
  // Patterns that indicate dynamic key usage (these keys should be ignored)
  dynamicKeyIndicators: [
    /t\s*\(\s*`[^`]*\$\{/, // Template literals with interpolation: t(`key.${var}`)
    /t\s*\(\s*[a-zA-Z_$][a-zA-Z0-9_$]*\s*\)/, // Variable as key: t(someVar)
    /t\s*\(\s*[a-zA-Z_$][a-zA-Z0-9_$]*\s*,/, // Variable as key with params: t(someVar, {})
    /\[['"]?[a-zA-Z_$][a-zA-Z0-9_$.]*['"]?\]/, // Bracket notation: obj['key'] or obj[var]
  ],
  // Keys that are known to be dynamically constructed
  ignoredKeyPatterns: [
    /^settings\.authMethods\./, // Auth methods are dynamic
    /^views\.subscriptions\.frequencies\./, // Frequencies are dynamic
    /^views\.subscriptions\.units\./, // Units are dynamic
    /^components\.converter\.operator/, // Operators are dynamic
    /^components\.dateRangeFilter\.presets\./, // Presets are dynamic
  ],
};

interface DuplicateValueGroup {
  value: string;
  keys: string[];
}

interface CheckResult {
  timestamp: string;
  locale: string;
  localeFile: string;
  totalKeys: number;
  usedKeys: string[];
  unusedKeys: string[];
  missingKeys: string[];
  dynamicKeyPatterns: string[];
  ignoredKeys: string[];
  duplicateValues: DuplicateValueGroup[];
  summary: {
    total: number;
    used: number;
    unused: number;
    missing: number;
    dynamic: number;
    ignored: number;
    duplicateValues: number;
  };
  exitCode: number;
}

interface Options {
  locale: string;
  fix: boolean;
  jsonOnly: boolean;
  verbose: boolean;
  ignorePatterns: string[];
}

// Parse command line arguments
function parseArgs(): Options {
  const args = process.argv.slice(2);
  const options: Options = {
    locale: 'en',
    fix: false,
    jsonOnly: false,
    verbose: false,
    ignorePatterns: [],
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case '--locale':
        options.locale = args[++i] || 'en';
        break;
      case '--fix':
        options.fix = true;
        break;
      case '--json':
        options.jsonOnly = true;
        break;
      case '--verbose':
        options.verbose = true;
        break;
      case '--ignore':
        options.ignorePatterns = (args[++i] || '').split(',').filter(Boolean);
        break;
      case '--help':
      case '-h':
        printHelp();
        process.exit(0);
    }
  }

  return options;
}

function printHelp(): void {
  console.log(`
i18n Key Usage Checker

Usage: npx tsx scripts/check-i18n-keys.ts [options]

Options:
  --locale <locale>   Locale file to check (default: en)
  --fix               Remove unused keys (writes changes to file)
  --json              Output only JSON (no human-readable summary)
  --verbose           Show detailed progress information
  --ignore <keys>     Comma-separated list of key patterns to ignore
  --help, -h          Show this help message

Examples:
  npx tsx scripts/check-i18n-keys.ts
  npx tsx scripts/check-i18n-keys.ts --locale en --json
  npx tsx scripts/check-i18n-keys.ts --fix --verbose
  npx tsx scripts/check-i18n-keys.ts --ignore "legacy.*,deprecated.*"
`);
}

// Recursively get all keys from a nested object
function getAllKeys(obj: Record<string, unknown>, prefix = ''): string[] {
  const keys: string[] = [];

  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;

    if (value && typeof value === 'object' && !Array.isArray(value)) {
      // Recurse into nested objects
      keys.push(...getAllKeys(value as Record<string, unknown>, fullKey));
    } else {
      // Leaf node (actual translation string)
      keys.push(fullKey);
    }
  }

  return keys;
}

// Recursively get all key-value pairs from a nested object
function getAllKeyValues(obj: Record<string, unknown>, prefix = ''): Map<string, string> {
  const keyValues = new Map<string, string>();

  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;

    if (value && typeof value === 'object' && !Array.isArray(value)) {
      // Recurse into nested objects
      const nested = getAllKeyValues(value as Record<string, unknown>, fullKey);
      for (const [k, v] of nested) {
        keyValues.set(k, v);
      }
    } else if (typeof value === 'string') {
      // Leaf node (actual translation string)
      keyValues.set(fullKey, value);
    }
  }

  return keyValues;
}

// Find duplicate values in translations
function findDuplicateValues(keyValues: Map<string, string>): DuplicateValueGroup[] {
  // Group keys by their values
  const valueToKeys = new Map<string, string[]>();

  for (const [key, value] of keyValues) {
    // Normalize value for comparison (trim whitespace)
    const normalizedValue = value.trim();
    
    // Skip very short values (single characters, empty strings)
    // as they're likely intentional (e.g., punctuation, separators)
    if (normalizedValue.length <= 1) continue;

    const existing = valueToKeys.get(normalizedValue);
    if (existing) {
      existing.push(key);
    } else {
      valueToKeys.set(normalizedValue, [key]);
    }
  }

  // Filter to only groups with duplicates and sort
  const duplicates: DuplicateValueGroup[] = [];
  for (const [value, keys] of valueToKeys) {
    if (keys.length > 1) {
      duplicates.push({
        value,
        keys: keys.sort(),
      });
    }
  }

  // Sort by number of duplicates (most first), then alphabetically by value
  return duplicates.sort((a, b) => {
    if (b.keys.length !== a.keys.length) {
      return b.keys.length - a.keys.length;
    }
    return a.value.localeCompare(b.value);
  });
}

// Find all source files matching patterns
function findSourceFiles(patterns: string[], baseDir: string): string[] {
  const files: string[] = [];

  function walkDir(dir: string, pattern: RegExp): void {
    if (!fs.existsSync(dir)) return;

    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        // Skip node_modules and other common exclusions
        if (!['node_modules', 'dist', 'coverage', '.git'].includes(entry.name)) {
          walkDir(fullPath, pattern);
        }
      } else if (entry.isFile() && pattern.test(entry.name)) {
        files.push(fullPath);
      }
    }
  }

  for (const pattern of patterns) {
    // Convert glob-like pattern to directory and file pattern
    const parts = pattern.split('**/');
    const startDir = path.join(baseDir, parts[0] || '');
    const filePattern = parts[parts.length - 1] || '*';

    // Convert file pattern to regex
    const regex = new RegExp(
      '^' + filePattern.replace(/\./g, '\\.').replace(/\*/g, '.*') + '$'
    );

    walkDir(startDir, regex);
  }

  return [...new Set(files)]; // Remove duplicates
}

// Extract i18n keys used in source code
function extractUsedKeys(content: string): Set<string> {
  const keys = new Set<string>();

  // Patterns to match i18n key usage
  const patterns = [
    // t('key') or t("key") - basic usage
    /\bt\s*\(\s*['"]([^'"]+)['"]\s*(?:,|\))/g,
    // $t('key') or $t("key") - Vue template usage
    /\$t\s*\(\s*['"]([^'"]+)['"]\s*(?:,|\))/g,
    // i18n.t('key') or i18n.global.t('key')
    /i18n(?:\.global)?\.t\s*\(\s*['"]([^'"]+)['"]\s*(?:,|\))/g,
    // String literals that look like i18n keys assigned to properties or in objects
    // Must start with known prefixes to avoid false positives
    /['"]((app|common|components|navigation|settings|tools|views)\.[a-zA-Z][a-zA-Z0-9.]*)['"]/g,
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(content)) !== null) {
      const key = match[1];
      // Skip if it looks like a variable or dynamic key
      if (key && !key.includes('${') && !key.startsWith('`')) {
        keys.add(key);
      }
    }
  }

  return keys;
}

// Detect potential dynamic key patterns
function detectDynamicKeyPatterns(content: string): string[] {
  const patterns: string[] = [];

  // Look for patterns like t(`prefix.${variable}`)
  const templateLiteralPattern = /\bt\s*\(\s*`([^`]+)\$\{[^}]+\}([^`]*)`/g;
  let match;

  while ((match = templateLiteralPattern.exec(content)) !== null) {
    const prefix = match[1];
    const suffix = match[2] || '';
    patterns.push(`${prefix}*${suffix}`);
  }

  return patterns;
}

// Check if a key matches any ignore pattern
function isIgnored(key: string, ignorePatterns: (string | RegExp)[]): boolean {
  for (const pattern of ignorePatterns) {
    if (typeof pattern === 'string') {
      // Convert glob-like pattern to regex
      const regex = new RegExp(
        '^' + pattern.replace(/\./g, '\\.').replace(/\*/g, '.*') + '$'
      );
      if (regex.test(key)) return true;
    } else if (pattern instanceof RegExp) {
      if (pattern.test(key)) return true;
    }
  }
  return false;
}

// Remove keys from translation object
function removeKeys(
  obj: Record<string, unknown>,
  keysToRemove: Set<string>,
  prefix = ''
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;

    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const nested = removeKeys(value as Record<string, unknown>, keysToRemove, fullKey);
      // Only include if the nested object has remaining keys
      if (Object.keys(nested).length > 0) {
        result[key] = nested;
      }
    } else if (!keysToRemove.has(fullKey)) {
      result[key] = value;
    }
  }

  return result;
}

// Main check function
async function checkI18nKeys(options: Options): Promise<CheckResult> {
  const baseDir = process.cwd();
  const localeFile = path.join(baseDir, CONFIG.localesDir, `${options.locale}.json`);

  // Load translation file
  if (!fs.existsSync(localeFile)) {
    throw new Error(`Locale file not found: ${localeFile}`);
  }

  const translations = JSON.parse(fs.readFileSync(localeFile, 'utf-8'));
  const allKeys = getAllKeys(translations);
  const allKeyValues = getAllKeyValues(translations);

  if (options.verbose) {
    console.error(`Loaded ${allKeys.length} translation keys from ${options.locale}.json`);
  }

  // Find and process source files
  const sourceFiles = findSourceFiles(CONFIG.sourcePatterns, baseDir);

  if (options.verbose) {
    console.error(`Found ${sourceFiles.length} source files to analyze`);
  }

  const usedKeysSet = new Set<string>();
  const dynamicPatterns: string[] = [];

  for (const file of sourceFiles) {
    const content = fs.readFileSync(file, 'utf-8');
    const keys = extractUsedKeys(content);
    const patterns = detectDynamicKeyPatterns(content);

    for (const key of keys) {
      usedKeysSet.add(key);
    }

    dynamicPatterns.push(...patterns);

    if (options.verbose && keys.size > 0) {
      console.error(`  ${path.relative(baseDir, file)}: ${keys.size} keys`);
    }
  }

  // Combine ignore patterns
  const allIgnorePatterns: (string | RegExp)[] = [
    ...CONFIG.ignoredKeyPatterns,
    ...options.ignorePatterns,
  ];

  // Categorize keys
  const unusedKeys: string[] = [];
  const ignoredKeys: string[] = [];
  const usedKeys: string[] = [];

  for (const key of allKeys) {
    if (usedKeysSet.has(key)) {
      usedKeys.push(key);
    } else if (isIgnored(key, allIgnorePatterns)) {
      ignoredKeys.push(key);
    } else {
      unusedKeys.push(key);
    }
  }

  // Find missing keys (keys used in code but not in translations)
  const missingKeys: string[] = [];
  for (const key of usedKeysSet) {
    if (!allKeys.includes(key)) {
      missingKeys.push(key);
    }
  }

  // Sort for consistent output
  unusedKeys.sort();
  missingKeys.sort();
  usedKeys.sort();
  ignoredKeys.sort();

  // Find duplicate values
  const duplicateValues = findDuplicateValues(allKeyValues);

  if (options.verbose && duplicateValues.length > 0) {
    console.error(`Found ${duplicateValues.length} duplicate value groups`);
  }

  const result: CheckResult = {
    timestamp: new Date().toISOString(),
    locale: options.locale,
    localeFile: path.relative(baseDir, localeFile),
    totalKeys: allKeys.length,
    usedKeys,
    unusedKeys,
    missingKeys,
    dynamicKeyPatterns: [...new Set(dynamicPatterns)],
    ignoredKeys,
    duplicateValues,
    summary: {
      total: allKeys.length,
      used: usedKeys.length,
      unused: unusedKeys.length,
      missing: missingKeys.length,
      dynamic: [...new Set(dynamicPatterns)].length,
      ignored: ignoredKeys.length,
      duplicateValues: duplicateValues.length,
    },
    // Only missing keys and duplicate values are showstoppers
    // Unused keys are informational only (can be cleaned up with --fix)
    exitCode: missingKeys.length > 0 || duplicateValues.length > 0 ? 1 : 0,
  };

  // Fix mode: remove unused keys
  if (options.fix && unusedKeys.length > 0) {
    const keysToRemove = new Set(unusedKeys);
    const cleanedTranslations = removeKeys(translations, keysToRemove);
    fs.writeFileSync(localeFile, JSON.stringify(cleanedTranslations, null, 2) + '\n', 'utf-8');

    if (!options.jsonOnly) {
      console.error(`\nRemoved ${unusedKeys.length} unused keys from ${options.locale}.json`);
    }
  }

  return result;
}

// Format human-readable output
function formatOutput(result: CheckResult): string {
  const lines: string[] = [];

  lines.push('');
  lines.push('═══════════════════════════════════════════════════════════════');
  lines.push('                    i18n Key Usage Report                       ');
  lines.push('═══════════════════════════════════════════════════════════════');
  lines.push('');
  lines.push(`  Locale:        ${result.locale}`);
  lines.push(`  File:          ${result.localeFile}`);
  lines.push(`  Timestamp:     ${result.timestamp}`);
  lines.push('');
  lines.push('───────────────────────────────────────────────────────────────');
  lines.push('                         Summary                                ');
  lines.push('───────────────────────────────────────────────────────────────');
  lines.push('');
  lines.push(`  Total Keys:    ${result.summary.total}`);
  lines.push(`  Used:          ${result.summary.used} ✓`);
  lines.push(`  Unused:        ${result.summary.unused} ${result.summary.unused > 0 ? '⚠' : '✓'}`);
  lines.push(`  Missing:       ${result.summary.missing} ${result.summary.missing > 0 ? '✗' : '✓'}`);
  lines.push(`  Duplicates:    ${result.summary.duplicateValues} ${result.summary.duplicateValues > 0 ? '⚠' : '✓'}`);
  lines.push(`  Ignored:       ${result.summary.ignored}`);
  lines.push(`  Dynamic:       ${result.summary.dynamic} patterns detected`);
  lines.push('');

  if (result.unusedKeys.length > 0) {
    lines.push('───────────────────────────────────────────────────────────────');
    lines.push('                      Unused Keys                              ');
    lines.push('───────────────────────────────────────────────────────────────');
    lines.push('');
    for (const key of result.unusedKeys) {
      lines.push(`  • ${key}`);
    }
    lines.push('');
  }

  if (result.missingKeys.length > 0) {
    lines.push('───────────────────────────────────────────────────────────────');
    lines.push('                      Missing Keys                             ');
    lines.push('───────────────────────────────────────────────────────────────');
    lines.push('');
    for (const key of result.missingKeys) {
      lines.push(`  • ${key}`);
    }
    lines.push('');
  }

  if (result.duplicateValues.length > 0) {
    lines.push('───────────────────────────────────────────────────────────────');
    lines.push('                    Duplicate Values                           ');
    lines.push('───────────────────────────────────────────────────────────────');
    lines.push('');
    lines.push('  These translation values appear in multiple keys:');
    lines.push('');
    for (const dup of result.duplicateValues) {
      const displayValue = dup.value.length > 40 
        ? dup.value.substring(0, 40) + '...' 
        : dup.value;
      lines.push(`  "${displayValue}" (${dup.keys.length} keys):`);
      for (const key of dup.keys) {
        lines.push(`    • ${key}`);
      }
      lines.push('');
    }
  }

  if (result.dynamicKeyPatterns.length > 0) {
    lines.push('───────────────────────────────────────────────────────────────');
    lines.push('                  Dynamic Key Patterns                         ');
    lines.push('───────────────────────────────────────────────────────────────');
    lines.push('');
    lines.push('  These patterns suggest dynamically constructed keys:');
    lines.push('');
    for (const pattern of result.dynamicKeyPatterns) {
      lines.push(`  • ${pattern}`);
    }
    lines.push('');
  }

  lines.push('═══════════════════════════════════════════════════════════════');

  if (result.exitCode === 0) {
    if (result.summary.unused > 0) {
      lines.push('  ✓ No critical issues (unused keys can be cleaned with --fix)');
    } else {
      lines.push('  ✓ All i18n keys are properly used                           ');
    }
  } else {
    lines.push('  ✗ Critical issues found (missing keys or duplicate values)  ');
  }

  lines.push('═══════════════════════════════════════════════════════════════');
  lines.push('');

  return lines.join('\n');
}

// Main entry point
async function main(): Promise<void> {
  const options = parseArgs();

  try {
    const result = await checkI18nKeys(options);

    if (options.jsonOnly) {
      // Output only JSON for machine consumption
      console.log(JSON.stringify(result, null, 2));
    } else {
      // Human-readable output to stderr, JSON to stdout
      console.error(formatOutput(result));
      console.log(JSON.stringify(result, null, 2));
    }

    process.exit(result.exitCode);
  } catch (error) {
    const errorResult = {
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : String(error),
      exitCode: 2,
    };

    if (options.jsonOnly) {
      console.log(JSON.stringify(errorResult, null, 2));
    } else {
      console.error(`Error: ${errorResult.error}`);
      console.log(JSON.stringify(errorResult, null, 2));
    }

    process.exit(2);
  }
}

main();
