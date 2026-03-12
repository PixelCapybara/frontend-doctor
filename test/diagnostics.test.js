import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';

import { diagnoseWhiteScreen } from '../src/diagnostics/white-screen.js';
import { diagnoseJsErrors } from '../src/diagnostics/js-errors.js';
import { diagnoseResourceLoading } from '../src/diagnostics/resource-loading.js';
import { diagnoseHydration } from '../src/diagnostics/hydration.js';
import { diagnoseCssLayout } from '../src/diagnostics/css-layout.js';
import { diagnoseExtensionPopup } from '../src/diagnostics/extension-popup.js';

const TMP = join(import.meta.dirname, '__fixtures__');

function setup(files) {
  mkdirSync(TMP, { recursive: true });
  for (const [name, content] of Object.entries(files)) {
    const full = join(TMP, name);
    mkdirSync(join(full, '..'), { recursive: true });
    writeFileSync(full, content);
  }
}

function cleanup() {
  rmSync(TMP, { recursive: true, force: true });
}

describe('white-screen', () => {
  after(cleanup);

  it('detects missing root element in HTML', () => {
    setup({
      'package.json': JSON.stringify({ dependencies: { react: '18' } }),
      'index.html': '<!DOCTYPE html><html><body></body></html>',
    });
    const results = diagnoseWhiteScreen(TMP);
    assert.ok(results.some(r => r.rootCause.includes('Root mount element')));
  });

  it('detects missing .env file', () => {
    setup({
      'package.json': JSON.stringify({ dependencies: { react: '18', vite: '5' } }),
      'src/App.jsx': 'const url = import.meta.env.VITE_API_URL;',
    });
    const results = diagnoseWhiteScreen(TMP);
    assert.ok(results.some(r => r.rootCause.includes('Environment variables')));
  });
});

describe('js-errors', () => {
  after(cleanup);

  it('detects deep property access without optional chaining', () => {
    setup({
      'package.json': JSON.stringify({ dependencies: {} }),
      'src/app.js': 'const x = data.user.profile.name;',
    });
    const results = diagnoseJsErrors(TMP);
    assert.ok(results.some(r => r.rootCause.includes('optional chaining')));
  });
});

describe('resource-loading', () => {
  after(cleanup);

  it('detects mixed content http references', () => {
    setup({
      'package.json': JSON.stringify({ dependencies: {} }),
      'src/app.js': 'const img = "http://cdn.example.com/pic.png";',
    });
    const results = diagnoseResourceLoading(TMP);
    assert.ok(results.some(r => r.rootCause.includes('HTTP resource')));
  });
});

describe('hydration', () => {
  after(cleanup);

  it('detects window access without guard in React SSR', () => {
    setup({
      'package.json': JSON.stringify({ dependencies: { react: '18', next: '14' } }),
      'src/App.jsx': 'const width = window.innerWidth;',
    });
    const results = diagnoseHydration(TMP);
    assert.ok(results.some(r => r.rootCause.includes('window accessed during SSR')));
  });
});

describe('css-layout', () => {
  after(cleanup);

  it('detects 100vh usage', () => {
    setup({
      'package.json': JSON.stringify({ dependencies: {} }),
      'src/style.css': '.container { height: 100vh; }',
    });
    const results = diagnoseCssLayout(TMP);
    assert.ok(results.some(r => r.rootCause.includes('100vh')));
  });
});

describe('extension-popup', () => {
  after(cleanup);

  it('detects missing action in MV3 manifest', () => {
    setup({
      'package.json': JSON.stringify({ dependencies: {} }),
      'manifest.json': JSON.stringify({ manifest_version: 3, name: 'test', version: '1.0' }),
    });
    const results = diagnoseExtensionPopup(TMP);
    assert.ok(results.some(r => r.rootCause.includes('MV3 manifest missing "action"')));
  });

  it('detects localStorage usage in extension', () => {
    setup({
      'package.json': JSON.stringify({ dependencies: {} }),
      'manifest.json': JSON.stringify({ manifest_version: 3, name: 'test', version: '1.0', action: { default_popup: 'popup.html' } }),
      'popup.html': '<html><body><script src="popup.js"></script></body></html>',
      'popup.js': 'localStorage.setItem("key", "value");',
    });
    const results = diagnoseExtensionPopup(TMP);
    assert.ok(results.some(r => r.rootCause.includes('localStorage')));
  });
});
