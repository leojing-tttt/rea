const fs = require('fs');
const path = require('path');

const DATA_ROOT = path.join(__dirname, '..', '..', '.data', 'pipeline');

/**
 * In-memory + optional disk persistence for pipeline artifacts.
 * Disk layout: .data/pipeline/{taskId}/task.json|raw/*.json|parsed.json|aggregate.json
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
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
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
  }

  saveTask(task) {
    this.tasks.set(task.task_id, task);
    writeJson(path.join(taskDir(task.task_id), 'task.json'), task);
    return task;
  }

  getTask(taskId) {
    return this.tasks.get(taskId) || readJson(path.join(taskDir(taskId), 'task.json'));
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

  /** All parsed dialogs across tasks (for monitor merge). */
  allParsedDialogs() {
    const out = [];
    for (const [taskId, list] of this.parsedByTask.entries()) {
      for (const d of list) out.push({ ...d, task_id: taskId });
    }
    return out;
  }

  listTasks() {
    return [...this.tasks.values()].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  }
}

const store = new PipelineStore();

module.exports = { store, PipelineStore, DATA_ROOT };
