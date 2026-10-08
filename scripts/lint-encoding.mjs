#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');

const excludePattern = /(^|[\\/])(node_modules|\.git|dist|build|coverage|target|\.cache|graphify-out)([\\/]|$)/;
const validExtensions = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json', '.md', '.sh', '.py', '.yml', '.yaml'
]);

// Mojibake marker characters from ECL reference
const mojibakeMarkers = [
  '\u9505', '\u951B', '\u9286', '\u9983', '\u8133', '\u7459',
  '\u8930', '\u95C6', '\u9365', '\u9359', '\u9366', '\u93C8\uE047'
];

const violations = [];

function checkFile(filePath) {
  const buf = fs.readFileSync(filePath);
  // Check for UTF-8 BOM
  if (buf.length >= 3 && buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF) {
    violations.push(`${path.relative(root, filePath)}: Contains UTF-8 BOM`);
  }

  const text = buf.toString('utf8');
  for (const marker of mojibakeMarkers) {
    if (text.includes(marker)) {
      violations.push(`${path.relative(root, filePath)}: Contains mojibake marker U+${marker.charCodeAt(0).toString(16).toUpperCase()}`);
    }
  }
}

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (excludePattern.test(fullPath)) continue;
    if (entry.isDirectory()) {
      walk(fullPath);
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (validExtensions.has(ext)) {
        checkFile(fullPath);
      }
    }
  }
}

walk(root);

if (violations.length > 0) {
  console.error('\x1b[31mEncoding lint failed:\x1b[0m');
  for (const v of violations) console.error(`  - ${v}`);
  process.exit(1);
}

console.log('✓ Encoding lint passed.');
