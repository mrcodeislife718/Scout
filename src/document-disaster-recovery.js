import { RecoveryStore } from './disaster-recovery.js';

export class ScoutDocumentDisasterRecovery {
  constructor(root, options = {}) {
    this.recovery = new RecoveryStore(root, options);
  }

  async checkpoint(documentStore, { label = 'document-store' } = {}) {
    if (!documentStore || typeof documentStore.snapshot !== 'function') throw new TypeError('Scout document recovery requires a document store');
    return this.recovery.checkpoint(documentStore.snapshot(), { label });
  }

  async restoreLatest(documentStore) {
    if (!documentStore || typeof documentStore.restore !== 'function') throw new TypeError('Scout document recovery requires a document store');
    const restored = await this.recovery.restoreLatest();
    if (!restored) return null;
    documentStore.restore(restored.state);
    return { snapshot: documentStore.snapshot(), metadata: restored.metadata };
  }
}
