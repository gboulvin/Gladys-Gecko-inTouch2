// -----------------------------------------------------------------------------
// Consistency checks between `gladys-assistant-integration.json` and the code,
// and the store rules that are easiest to miss.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { ACTIONS } from '../src/actions.js';
import { SCENE_ACTIONS } from '../src/scenes.js';
import { WIDGETS } from '../src/widgets.js';
import { TRIGGERS } from '../src/spaManager.js';
import { DEFAULT_CONFIG } from '../src/config.js';
import { LANGUAGES, TEXTS_FOR_TESTS, WATERCARE_LABELS } from '../src/i18n.js';
import { WATERCARE_MODES } from '../src/gecko/protocol.js';

const manifest = JSON.parse(
  await readFile(new URL('../gladys-assistant-integration.json', import.meta.url), 'utf8'),
);
const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

const keysOf = (list) => (list ?? []).map((entry) => entry.key);

function minGladysVersion() {
  const match = manifest.gladys_version.match(/>=\s*(\d+)\.(\d+)\.(\d+)/);
  assert.ok(match, 'gladys_version must declare a minimum version');
  return match.slice(1).map(Number);
}

function isAtLeast(version, required) {
  for (let i = 0; i < required.length; i += 1) {
    if (version[i] !== required[i]) {
      return version[i] > required[i];
    }
  }
  return true;
}

// Every multi-language object of the manifest: label, description,
// placeholder, option labels, link labels...
function multiLanguageObjects(node, path = '$', found = []) {
  if (Array.isArray(node)) {
    node.forEach((item, index) => multiLanguageObjects(item, `${path}[${index}]`, found));
  } else if (node && typeof node === 'object') {
    if (typeof node.en === 'string') {
      found.push({ path, text: node });
      return found;
    }
    for (const [key, value] of Object.entries(node)) {
      multiLanguageObjects(value, `${path}.${key}`, found);
    }
  }
  return found;
}

test('every manifest text is translated in English, French, German and Spanish', () => {
  const texts = multiLanguageObjects(manifest);
  assert.ok(texts.length > 50);
  for (const { path, text } of texts) {
    assert.deepEqual(Object.keys(text).sort(), [...LANGUAGES].sort(), `${path}: languages`);
    for (const language of LANGUAGES) {
      assert.ok(text[language].trim().length > 0, `${path}.${language} is empty`);
    }
  }
});

test('every message of the code is translated in the four languages', () => {
  for (const [key, text] of Object.entries({ ...TEXTS_FOR_TESTS, ...WATERCARE_LABELS })) {
    assert.deepEqual(Object.keys(text).sort(), [...LANGUAGES].sort(), `text "${key}"`);
  }
});

test('the catalog description holds 10 to 100 characters per language', () => {
  for (const [lang, text] of Object.entries(manifest.description)) {
    assert.ok(
      text.length >= 10 && text.length <= 100,
      `description.${lang} has ${text.length} characters (10 to 100 allowed)`,
    );
  }
});

test('the integration is local only and declares its discovery port', () => {
  assert.deepEqual(manifest.transports, ['local']);
  assert.deepEqual(manifest.network_discovery, [{ type: 'udp-active-broadcast', ports: [10022] }]);
});

test('manifest actions, scene actions and widgets all have handlers, and vice versa', () => {
  assert.deepEqual(keysOf(manifest.actions).sort(), Object.keys(ACTIONS).sort());
  assert.deepEqual(keysOf(manifest.scene_actions).sort(), Object.keys(SCENE_ACTIONS).sort());
  assert.deepEqual(keysOf(manifest.widgets).sort(), Object.keys(WIDGETS).sort());
});

test('every scene trigger fired is declared, and every declared one is fired', () => {
  assert.deepEqual(keysOf(manifest.scene_triggers).sort(), Object.values(TRIGGERS).sort());
});

test('scene triggers, scene actions, widgets and categories require Gladys >= 5.1.0', () => {
  assert.ok(manifest.categories.length >= 1 && manifest.categories.length <= 3);
  assert.ok(isAtLeast(minGladysVersion(), [5, 1, 0]), manifest.gladys_version);
});

test('the watercare options of the scene action are the protocol modes', () => {
  const field = manifest.scene_actions
    .find((action) => action.key === 'set_watercare_mode')
    .fields.find((f) => f.key === 'mode');
  assert.deepEqual(
    field.options.map((option) => option.value),
    WATERCARE_MODES,
  );
});

test('config_schema defaults stay consistent with DEFAULT_CONFIG', () => {
  for (const field of manifest.config_schema) {
    if (field.default !== undefined) {
      assert.equal(DEFAULT_CONFIG[field.key], field.default, field.key);
    }
  }
});

test('section fields are purely presentational', () => {
  for (const section of manifest.config_schema.filter((f) => f.type === 'section')) {
    assert.equal(section.required, undefined);
    assert.equal(section.default, undefined);
    assert.ok(!(section.key in DEFAULT_CONFIG));
    for (const link of section.links ?? []) {
      assert.match(link.url, /^https:\/\//);
    }
  }
});

test('dynamic selects declare a source and no static options', () => {
  const fields = [
    ...manifest.config_schema,
    ...[...manifest.actions, ...manifest.scene_triggers, ...manifest.scene_actions].flatMap(
      (item) => item.fields ?? [],
    ),
    ...manifest.widgets.flatMap((widget) => widget.settings ?? []),
  ];
  for (const field of fields.filter((f) => f.source !== undefined)) {
    assert.equal(field.source, 'devices');
    assert.equal(field.options, undefined, field.key);
  }
});

test('the manifest version is the package version, and the image is tagged with it', () => {
  assert.equal(manifest.version, pkg.version);
  assert.ok(manifest.docker_image.endsWith(`:${manifest.version}`), manifest.docker_image);
});
