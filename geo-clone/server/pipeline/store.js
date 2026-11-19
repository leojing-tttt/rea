const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_ROOT = path.join(__dirname, '..', '..', '.data', 'pipeline');

/**
 * In-memory + disk persistence for pipeline artifacts.
 * Disk layout: .data/pipeline/{taskId}/task.json|raw/*.json|parsed.json|aggregate.json
 * Index: .data/pipeline/_index/by_idempotency.json
 */
function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function taskDir(taskId) {
  return path.join(DATA_ROOT, taskId);
}

function writeJson(filePath, data) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

function readJson(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (_) {
    return null;
  }
}

function idempotencyKey({ prompt, brand, platforms }) {
  const normPlatforms = (platforms || [])
    .map((p) => `${p.platformId || p.id || p}:${p.modeId || p.mode || ''}`)
    .sort()
    .join(',');
  const payload = JSON.stringify({
    prompt: String(prompt || '').trim(),
    brand: String(brand || '').trim(),
    platforms: normPlatforms,
  });
  return crypto.createHash('sha256').update(payload).digest('hex').slice(0, 24);
}

class PipelineStore {
  constructor() {
    /** @type {Map<string, object>} */
    this.tasks = new Map();
    /** @type {Map<string, object[]>} */
    this.rawByTask = new Map();
    /** @type {Map<string, object[]>} */
    this.parsedByTask = new Map();
    /** @type {Map<string, object>} */
    this.aggregateByTask = new Map();
    /** @type {Map<string, string>} idempotency → task_id */
    this.idempotencyIndex = new Map();
    this._hydrated = false;
  }

  hydrateFromDisk() {
    if (this._hydrated) return { tasks: this.tasks.size };
    ensureDir(DATA_ROOT);
    const indexFile = path.join(DATA_ROOT, '_index', 'by_idempotency.json');
    const index = readJson(indexFile) || {};
    for (const [key, taskId] of Object.entries(index)) {
      this.idempotencyIndex.set(key, taskId);
    }
    const entries = fs.existsSync(DATA_ROOT) ? fs.readdirSync(DATA_ROOT) : [];
    let loaded = 0;
    for (const name of entries) {
      if (name.startsWith('_')) continue;
      const task = readJson(path.join(DATA_ROOT, name, 'task.json'));
      if (!task || !task.task_id) continue;
      this.tasks.set(task.task_id, task);
      const parsed = readJson(path.join(DATA_ROOT, name, 'parsed.json'));
      if (parsed && parsed.list) this.parsedByTask.set(task.task_id, parsed.list);
      const agg = readJson(path.join(DATA_ROOT, name, 'aggregate.json'));
      if (agg) this.aggregateByTask.set(task.task_id, agg);
      const rawIndex = readJson(path.join(DATA_ROOT, name, 'raw_index.json'));
      if (rawIndex) {
        const raw = this.getRaw(task.task_id);
        if (raw.length) this.rawByTask.set(task.task_id, raw);
      }
      if (task.idempotency_key) this.idempotencyIndex.set(task.idempotency_key, task.task_id);
      loaded += 1;
    }
    this._hydrated = true;
    this.persistIdempotencyIndex();
    return { tasks: loaded };
  }

  persistIdempotencyIndex() {
    writeJson(path.join(DATA_ROOT, '_index', 'by_idempotency.json'), Object.fromEntries(this.idempotencyIndex));
  }

  saveTask(task) {
    this.tasks.set(task.task_id, task);
    writeJson(path.join(taskDir(task.task_id), 'task.json'), task);
    if (task.idempotency_key) {
      this.idempotencyIndex.set(task.idempotency_key, task.task_id);
      this.persistIdempotencyIndex();
    }
    return task;
  }

  getTask(taskId) {
    return this.tasks.get(taskId) || readJson(path.join(taskDir(taskId), 'task.json'));
  }

  findByIdempotency(key) {
    if (!key) return null;
    const taskId = this.idempotencyIndex.get(key);
    if (!taskId) return null;
    return this.getTask(taskId);
  }

  saveRaw(taskId, rawList) {
    this.rawByTask.set(taskId, rawList);
    const dir = path.join(taskDir(taskId), 'raw');
    ensureDir(dir);
    for (const item of rawList) {
      const safe = String(item.platform_id || item.platform || 'unknown').replace(/[^\w.-]+/g, '_');
      writeJson(path.join(dir, `${safe}.json`), item);
    }
    writeJson(path.join(taskDir(taskId), 'raw_index.json'), {
      count: rawList.length,
      platforms: rawList.map((r) => r.platform_id || r.platform),
    });
    return rawList;
  }

  getRaw(taskId) {
    if (this.rawByTask.has(taskId)) return this.rawByTask.get(taskId);
    const index = readJson(path.join(taskDir(taskId), 'raw_index.json'));
    if (!index) return [];
    const dir = path.join(taskDir(taskId), 'raw');
    return (index.platforms || [])
      .map((p) => {
        const safe = String(p).replace(/[^\w.-]+/g, '_');
        return readJson(path.join(dir, `${safe}.json`));
      })
      .filter(Boolean);
  }

  saveParsed(taskId, parsedList) {
    this.parsedByTask.set(taskId, parsedList);
    writeJson(path.join(taskDir(taskId), 'parsed.json'), { list: parsedList });
    return parsedList;
  }

  getParsed(taskId) {
    if (this.parsedByTask.has(taskId)) return this.parsedByTask.get(taskId);
    const file = readJson(path.join(taskDir(taskId), 'parsed.json'));
    return (file && file.list) || [];
  }

  saveAggregate(taskId, aggregate) {
    this.aggregateByTask.set(taskId, aggregate);
    writeJson(path.join(taskDir(taskId), 'aggregate.json'), aggregate);
    return aggregate;
  }

  getAggregate(taskId) {
    return this.aggregateByTask.get(taskId) || readJson(path.join(taskDir(taskId), 'aggregate.json'));
  }

  allParsedDialogs() {
    const out = [];
    const seen = new Set();
    for (const [taskId, list] of this.parsedByTask.entries()) {
      for (const d of list) {
        const id = d.id || `${taskId}_${d.platform_id}`;
        if (seen.has(id)) continue;
        seen.add(id);
        out.push({ ...d, task_id: taskId });
      }
    }
    // also scan disk for tasks not fully in memory maps
    if (fs.existsSync(DATA_ROOT)) {
      for (const name of fs.readdirSync(DATA_ROOT)) {
        if (name.startsWith('_') || this.parsedByTask.has(name)) continue;
        const parsed = readJson(path.join(DATA_ROOT, name, 'parsed.json'));
        if (!parsed || !parsed.list) continue;
        for (const d of parsed.list) {
          const id = d.id || `${name}_${d.platform_id}`;
          if (seen.has(id)) continue;
          seen.add(id);
          out.push({ ...d, task_id: name });
        }
      }
    }
    return out;
  }

  allCitations() {
    const cites = [];
    for (const d of this.allParsedDialogs()) {
      for (const c of d.citations || []) {
        cites.push({
          ...c,
          platform: d.platform,
          task_id: d.task_id,
          brand_plan_id: d.brand_plan_id,
          date: d.date,
          sentiment: (d.sentiment && d.sentiment.label) || 'neutral',
        });
      }
    }
    return cites;
  }

  listTasks() {
    return [...this.tasks.values()].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  }
}

const store = new PipelineStore();
store.hydrateFromDisk();

module.exports = { store, PipelineStore, DATA_ROOT, idempotencyKey };
