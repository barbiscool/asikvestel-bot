#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');
const srcDir = path.join(root, 'src');

// Architectural layer definitions (lower index = lower layer)
const layerDefinitions = [
  // Layer 0: Primitives / Config / Utilities (Must have no internal dependencies on higher layers)
  {
    layer: 0,
    name: 'Foundation & Config',
    files: ['config.js', 'crypto.js', 'dynamicDataDefaults.js']
  },
  // Layer 1: Persistence & Storage
  {
    layer: 1,
    name: 'Persistence & Parsing',
    files: ['db.js', 'vaultStorage.js', 'parser.js']
  },
  // Layer 2: Domain Services & Tracking
  {
    layer: 2,
    name: 'Domain Services & Features',
    files: [
      'botEmbeds.js',
      'vaultWorker.js',
      'cdnRefresher.js',
      'systemStats.js',
      'mediaStorageWatchdog.js',
      'vcTracker.js',
      'discordSpotifyTracker.js',
      'chatBridge.js',
      'statsSync.js'
    ]
  },
  // Layer 3: Bot Integrations & Scanners
  {
    layer: 3,
    name: 'Bot Client & Automation',
    files: [
      'bot.js',
      'slashCommands.js',
      'backfill.js',
      'scanNewServer.js',
      'scanMediaAndGifs.js'
    ]
  },
  // Layer 4: Entry Points
  {
    layer: 4,
    name: 'Entry Point & Process Lifecycle',
    files: ['index.js']
  }
];

const fileToLayer = new Map();
for (const def of layerDefinitions) {
  for (const f of def.files) {
    fileToLayer.set(f, def.layer);
  }
}

const violations = [];

if (fs.existsSync(srcDir)) {
  const files = fs.readdirSync(srcDir).filter(f => f.endsWith('.js'));
  const requireRegex = /(?:require\s*\(\s*['"](\.[^'"]+)['"]\s*\)|from\s+['"](\.[^'"]+)['"])/g;

  for (const file of files) {
    const filePath = path.join(srcDir, file);
    const content = fs.readFileSync(filePath, 'utf8');
    const sourceLayer = fileToLayer.get(file);

    if (sourceLayer === undefined) {
      console.warn(`[Warning] ${file} is not mapped to an architectural layer.`);
      continue;
    }

    let match;
    while ((match = requireRegex.exec(content)) !== null) {
      const importPath = match[1] || match[2];
      const resolved = path.basename(importPath.endsWith('.js') ? importPath : `${importPath}.js`);

      if (fileToLayer.has(resolved)) {
        const targetLayer = fileToLayer.get(resolved);
        // Violation if importing from a strictly higher layer
        if (targetLayer > sourceLayer) {
          violations.push({
            file: `src/${file}`,
            sourceLayer,
            imported: `src/${resolved}`,
            targetLayer,
            message: `Layer ${sourceLayer} (${layerDefinitions[sourceLayer].name}) cannot import Layer ${targetLayer} (${layerDefinitions[targetLayer].name}). Lower layers must not depend on higher layers.`
          });
        }
      }
    }
  }
}

if (violations.length > 0) {
  console.error('\x1b[31m✗ Architecture layer lint violations found:\x1b[0m\n');
  for (const v of violations) {
    console.error(`  ${v.file} imports ${v.imported}:`);
    console.error(`    ${v.message}\n`);
  }
  process.exit(1);
}

console.log('✓ Architecture layer lint passed: All src modules respect layer hierarchy.');
