#!/usr/bin/env node
/**
 * Genera prompts listos para el agente mapeador Pragmata.
 *
 * Uso:
 *   pnpm mapping:init <cliente>     → crea docs/feature-specs/<cliente>-brief.md
 *   pnpm mapping:prompt <cliente>   → genera prompts en docs/feature-specs/generated/<cliente>/
 *   pnpm mapping:prompt <cliente> --print   → solo stdout (system + user)
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SPECS = path.join(ROOT, 'docs/feature-specs');
const AGENT = path.join(SPECS, 'agent');

function slugify(name) {
  return name
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function extractTextFence(markdown, afterHeading) {
  const idx = markdown.indexOf(afterHeading);
  if (idx === -1) return null;
  const rest = markdown.slice(idx);
  const start = rest.indexOf('```text');
  if (start === -1) return null;
  const bodyStart = start + '```text'.length;
  const end = rest.indexOf('```', bodyStart);
  if (end === -1) return null;
  return rest.slice(bodyStart, end).trim();
}

function readSystemPrompt(long = true) {
  const md = fs.readFileSync(path.join(AGENT, 'SYSTEM_PROMPT.md'), 'utf8');
  const block = extractTextFence(
    md,
    long ? '## Bloque para copiar (inicio)' : '## Variante corta',
  );
  if (!block) {
    console.error('No se encontró el bloque del system prompt en SYSTEM_PROMPT.md');
    process.exit(1);
  }
  return block;
}

function briefPath(cliente) {
  return path.join(SPECS, `${cliente}-brief.md`);
}

function buildUserContext(cliente, briefContent) {
  const mappingYaml = `${cliente}-mapping.yaml`;
  return `## Contexto de sesión — mapeo Pragmata

Cliente (slug): **${cliente}**
Modo: solo mapeo (sin código hasta que yo diga \`IMPLEMENTAR\`).

Brief del cliente:
---
${briefContent.trim()}
---

Instrucciones:
- Sigue \`docs/feature-specs/agent/OUTPUT_CONTRACT.md\` en cada respuesta.
- Al cerrar FASE 4, el YAML final debe guardarse como: \`docs/feature-specs/${mappingYaml}\`
- Empieza por FASE 1 (máximo 5 preguntas).

---

**Mensaje de arranque:** Empezamos mapeo. Lee el brief. FASE 1: hazme las preguntas que falten (máximo 5).`;
}

function cmdInit(cliente) {
  const dest = briefPath(cliente);
  if (fs.existsSync(dest)) {
    console.error(`Ya existe: ${path.relative(ROOT, dest)}`);
    process.exit(1);
  }
  const template = fs.readFileSync(path.join(AGENT, 'CLIENT_BRIEF.template.md'), 'utf8');
  fs.writeFileSync(dest, template.replace('Nombre del cliente', cliente), 'utf8');
  console.log(`Creado: ${path.relative(ROOT, dest)}`);
  console.log(`Edita el brief y ejecuta: pnpm mapping:prompt ${cliente}`);
}

function cmdPrompt(cliente, opts) {
  const briefFile = briefPath(cliente);
  if (!fs.existsSync(briefFile)) {
    console.error(`No existe ${path.relative(ROOT, briefFile)}`);
    console.error(`Ejecuta: pnpm mapping:init ${cliente}`);
    process.exit(1);
  }

  const brief = fs.readFileSync(briefFile, 'utf8');
  const system = readSystemPrompt(!opts.short);
  const user = buildUserContext(cliente, brief);
  const combined = `${system}\n\n---\n\n${user}`;
  const kickoff = 'Empezamos mapeo. Lee el brief. FASE 1: hazme las preguntas que falten (máximo 5).';

  if (opts.print) {
    console.log('========== SYSTEM PROMPT ==========\n');
    console.log(system);
    console.log('\n========== USER CONTEXT ==========\n');
    console.log(user);
    console.log('\n========== KICKOFF ==========\n');
    console.log(kickoff);
    return;
  }

  const outDir = path.join(SPECS, 'generated', cliente);
  fs.mkdirSync(outDir, { recursive: true });

  const files = {
    'system-prompt.txt': system,
    'user-context.md': user,
    'combined-prompt.txt': combined,
    'kickoff.txt': kickoff,
    'README.txt': [
      `Prompts generados para: ${cliente}`,
      '',
      '1. Pega system-prompt.txt en el System prompt de tu IA',
      '2. Pega user-context.md como primer mensaje de usuario',
      '3. Envía kickoff.txt',
      '',
      'Comandos mientras mapeas: APROBADO FASE N | CORREGIR: ... | IMPLEMENTAR <id>',
      '',
      `Salida final: docs/feature-specs/${cliente}-mapping.yaml`,
    ].join('\n'),
  };

  for (const [name, content] of Object.entries(files)) {
    fs.writeFileSync(path.join(outDir, name), content, 'utf8');
  }

  console.log(`Generado en: ${path.relative(ROOT, outDir)}/`);
  for (const name of Object.keys(files)) {
    console.log(`  - ${name}`);
  }
  console.log('\nSiguiente: abre README.txt en esa carpeta.');
}

function printHelp() {
  console.log(`
Pragmata — generador de prompts de mapeo

  pnpm mapping:init <cliente>          Crea docs/feature-specs/<cliente>-brief.md
  pnpm mapping:prompt <cliente>          Escribe docs/feature-specs/generated/<cliente>/
  pnpm mapping:prompt <cliente> --print  Imprime en terminal
  pnpm mapping:prompt <cliente> --short  System prompt corto (menos tokens)

Ejemplo:
  pnpm mapping:init acme
  # editar docs/feature-specs/acme-brief.md
  pnpm mapping:prompt acme
`);
}

function main() {
  const args = process.argv.slice(2);
  const sub = args[0];

  if (!sub || sub === '--help' || sub === '-h') {
    printHelp();
    process.exit(0);
  }

  const cliente = slugify(args[1] ?? sub);
  const flags = new Set(args.filter((a) => a.startsWith('-')));

  if (sub === 'init') {
    if (!args[1]) {
      console.error('Uso: pnpm mapping:init <cliente>');
      process.exit(1);
    }
    cmdInit(cliente);
    return;
  }

  if (sub === 'prompt') {
    if (!args[1]) {
      console.error('Uso: pnpm mapping:prompt <cliente> [--print] [--short]');
      process.exit(1);
    }
    cmdPrompt(cliente, {
      print: flags.has('--print'),
      short: flags.has('--short'),
    });
    return;
  }

  printHelp();
  process.exit(1);
}

main();
