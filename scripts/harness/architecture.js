import { readFile } from 'node:fs/promises';
import { posix, resolve } from 'node:path';
import { parse } from 'acorn';
import { BROWSER_ROOTS, GAME_SIDE_EFFECTS, LAYERS, NODE_GLOBALS, ROOT } from './config.js';
import { isMain, listFiles } from './files.js';

export function walk(node, visit, parent = null, key = '') {
  if (!node || typeof node !== 'object') return;
  if (typeof node.type === 'string') visit(node, parent, key);
  for (const [name, value] of Object.entries(node)) {
    if (name === 'loc') continue;
    if (Array.isArray(value)) value.forEach((child) => walk(child, visit, node, name));
    else if (value && typeof value === 'object') walk(value, visit, node, name);
  }
}

export function inspectSource(source) {
  const ast = parse(source, { ecmaVersion: 'latest', sourceType: 'module', locations: true });
  const imports = [];
  walk(ast, (node) => {
    if (
      node.type === 'ImportDeclaration' ||
      node.type === 'ExportNamedDeclaration' ||
      node.type === 'ExportAllDeclaration' ||
      node.type === 'ImportExpression'
    ) {
      if (!node.source) return;
      imports.push({
        specifier: node.source.type === 'Literal' ? node.source.value : null,
        line: node.loc.start.line,
      });
    }
  });
  return { ast, imports };
}

export function layerFor(file) {
  return LAYERS.find(
    (layer) => layer.path === file || (layer.prefix && file.startsWith(layer.prefix)),
  );
}

function isPropertyName(node, parent, key) {
  return (
    (parent?.type === 'MemberExpression' && key === 'property' && !parent.computed) ||
    (['Property', 'MethodDefinition', 'PropertyDefinition'].includes(parent?.type) &&
      key === 'key' &&
      !parent.computed &&
      !parent.shorthand)
  );
}

export function checkModule(file, source, available) {
  const errors = [];
  const dependencies = [];
  const layer = layerFor(file);
  if (!layer) errors.push(`${file}: runtime module has no registered layer`);
  const { ast, imports } = inspectSource(source);
  for (const { specifier, line } of imports) {
    if (typeof specifier !== 'string' || !/^\.\.?\//.test(specifier)) {
      errors.push(`${file}:${line}: imports must use literal relative paths`);
      continue;
    }
    const target = posix.normalize(posix.join(posix.dirname(file), specifier));
    const dependency = layerFor(target);
    if (!available.has(target)) errors.push(`${file}:${line}: missing browser module ${target}`);
    else dependencies.push(target);
    if (layer && (!dependency || !layer.allows.includes(dependency.name))) {
      errors.push(`${file}:${line}: ${layer.name} cannot depend on ${dependency?.name ?? target}`);
    }
  }
  walk(ast, (node, parent, key) => {
    if (node.type !== 'Identifier' || isPropertyName(node, parent, key)) return;
    if (
      NODE_GLOBALS.has(node.name) ||
      (file.startsWith('game/') && GAME_SIDE_EFFECTS.has(node.name))
    ) {
      errors.push(`${file}:${node.loc.start.line}: forbidden platform API ${node.name}`);
    }
  });
  return { errors: [...new Set(errors)], dependencies };
}

export function findCycles(graph) {
  const visited = new Set();
  const active = [];
  const cycles = [];
  function visit(file) {
    const index = active.indexOf(file);
    if (index >= 0) {
      cycles.push([...active.slice(index), file].join(' -> '));
      return;
    }
    if (visited.has(file)) return;
    active.push(file);
    for (const target of graph.get(file) ?? []) visit(target);
    active.pop();
    visited.add(file);
  }
  for (const file of graph.keys()) visit(file);
  return cycles;
}

export async function checkArchitecture() {
  const files = (await listFiles(BROWSER_ROOTS)).filter((file) => file.endsWith('.js'));
  const available = new Set(files);
  const graph = new Map();
  const errors = [];
  for (const file of files) {
    try {
      const checked = checkModule(file, await readFile(resolve(ROOT, file), 'utf8'), available);
      errors.push(...checked.errors);
      graph.set(file, checked.dependencies);
    } catch (error) {
      errors.push(`${file}: ${error.message}`);
    }
  }
  errors.push(...findCycles(graph).map((cycle) => `Dependency cycle: ${cycle}`));
  const html = await readFile(resolve(ROOT, 'index.html'), 'utf8');
  if (/\son[a-z]+\s*=/i.test(html))
    errors.push('index.html: use delegated events, not inline handlers');
  if (errors.length) throw new Error(errors.join('\n'));
  console.log(
    `Architecture OK: ${files.length} browser modules, ${LAYERS.length} layers, no cycles.`,
  );
}

if (isMain(import.meta.url)) {
  checkArchitecture().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
