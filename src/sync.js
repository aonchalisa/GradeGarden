// One revision per account: stale tabs cannot silently overwrite a newer plan.
export class SyncEngine {
  constructor({ api, userId, fresh, valid, storage, onPlan, onStatus, transform = plan => structuredClone(plan), delay = 600 }) {
    Object.assign(this, { api, userId, fresh, valid, storage, onPlan, onStatus, transform, delay });
    this.key = `grade-garden:draft:${userId}`;
    this.revision = null;
    this.pending = null;
    this.sequence = 0;
    this.disposed = false;
    this.conflict = false;
    this.inflight = null;
    this.localAvailable = true;
  }
  status(kind, extra = {}) { if (!this.disposed) this.onStatus({ kind, localAvailable: this.localAvailable, ...extra }); }
  readDraft() {
    try { const d = JSON.parse(this.storage.getItem(this.key)); return d && this.valid(d.plan) ? d : null; }
    catch { this.localAvailable = false; return null; }
  }
  persist() {
    try {
      if (this.pending) this.storage.setItem(this.key, JSON.stringify({ plan: this.pending, revision: this.revision }));
      else this.storage.removeItem(this.key);
    } catch { this.localAvailable = false; }
  }
  async open() {
    this.status('loading');
    const row = await this.api.load();
    if (this.disposed) return;
    if (row && !this.valid(row.data)) throw new Error('invalid_plan');
    this.revision = row?.revision ?? null;
    const draft = this.readDraft();
    if (draft) {
      this.pending = this.transform(draft.plan);
      this.onPlan(this.pending);
      if (draft.revision !== this.revision) {
        this.conflict = true;
        this.status('conflict');
        return;
      }
      await this.flush();
    } else if (row) {
      const plan = this.transform(row.data);
      this.onPlan(plan);
      if (JSON.stringify(plan) !== JSON.stringify(row.data)) {
        this.pending = plan;
        this.persist();
        await this.flush();
      } else this.status('saved');
    } else {
      const plan = this.fresh();
      this.onPlan(plan);
      this.pending = plan;
      this.persist();
      await this.flush();
    }
  }
  change(plan) {
    if (this.disposed || this.conflict) return;
    this.pending = this.transform(plan);
    this.sequence++;
    this.persist();
    this.status('pending');
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), this.delay);
  }
  async flush() {
    clearTimeout(this.timer);
    if (this.disposed || this.conflict) return false;
    if (this.inflight) return this.inflight;
    this.inflight = this.drain();
    try { return await this.inflight; }
    finally { this.inflight = null; }
  }
  async drain() {
    while (this.pending && !this.disposed && !this.conflict) {
      const snapshot = structuredClone(this.pending), sequence = this.sequence;
      this.status('saving');
      try {
        const row = await this.api.save(snapshot, this.revision);
        if (this.disposed) return false;
        this.revision = row.revision;
        if (sequence === this.sequence) this.pending = null;
        this.persist();
      } catch (error) {
        if (this.disposed) return false;
        this.conflict = error.code === 'P0001' || error.code === '23505';
        this.status(this.conflict ? 'conflict' : 'error');
        return false;
      }
    }
    if (!this.disposed) this.status('saved');
    return !this.disposed;
  }
  async reload() {
    // Caller confirms that the unsynced draft has been backed up/discarded.
    if (this.inflight) await this.inflight;
    const row = await this.api.load();
    if (this.disposed) return;
    if (!row || !this.valid(row.data)) throw new Error('invalid_plan');
    this.revision = row.revision;
    this.pending = null;
    this.conflict = false;
    this.persist();
    const plan = this.transform(row.data);
    this.onPlan(plan);
    if (JSON.stringify(plan) !== JSON.stringify(row.data)) {
      this.pending = plan;
      this.persist();
      await this.flush();
    } else this.status('saved');
  }
  dispose() { this.disposed = true; clearTimeout(this.timer); }
}
