import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createDocumentStore } from '../src/language-service.js';
import { ScoutDocumentDisasterRecovery } from '../src/document-disaster-recovery.js';

test('Scout restores prior intact document state when newest recovery generation is corrupt', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'scout-doc-dr-'));
  try {
    const documents = createDocumentStore();
    documents.open('file:///a.scout', '{"value":1}', 1);
    const dr = new ScoutDocumentDisasterRecovery(root, { maxGenerations: 4 });
    await dr.checkpoint(documents, { label: 'stable' });

    documents.update('file:///a.scout', [{ text: '{"value":' }], 2);
    assert.equal(documents.get('file:///a.scout').incomplete, true);
    await new Promise((resolve) => setTimeout(resolve, 2));
    await dr.checkpoint(documents, { label: 'incomplete-edit' });

    const newest = (await dr.recovery.list())[0];
    await fs.writeFile(path.join(root, newest), '{}');

    const reopened = createDocumentStore();
    const restored = await new ScoutDocumentDisasterRecovery(root, { maxGenerations: 4 }).restoreLatest(reopened);
    assert.equal(restored.snapshot.documents[0].version, 1);
    assert.equal(reopened.get('file:///a.scout').source, '{"value":1}');
    assert.equal(reopened.get('file:///a.scout').incomplete, false);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('Scout preserves incomplete editor text while retaining a last-known-valid recovery base', () => {
  const documents = createDocumentStore();
  documents.open('file:///a.scout', '{"value":1}', 1);
  documents.update('file:///a.scout', [{ text: '{"value":' }], 2);
  const snapshot = documents.snapshot();
  assert.equal(snapshot.documents[0].source, '{"value":');
  assert.equal(snapshot.documents[0].lastValidSource, '{"value":1}');

  const restored = createDocumentStore();
  restored.restore(snapshot);
  assert.equal(restored.get('file:///a.scout').source, '{"value":');
  assert.equal(restored.get('file:///a.scout').incomplete, true);
  assert.ok(restored.diagnostics('file:///a.scout').every((diagnostic) => diagnostic.source === 'scout'));
});
