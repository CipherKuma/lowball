// Scoped Studio compatibility shim: this host rejects even one fs.watch with EMFILE.
// Poll only the explicitly watched path; no system settings or dependencies are changed.
const fs = require('node:fs');
const path = require('node:path');
const {EventEmitter} = require('node:events');
fs.watch = function watchByPolling(target, options, listener) {
  if (typeof options === 'function') { listener = options; options = {}; }
  const emitter = new EventEmitter();
  if (listener) emitter.on('change', listener);
  const scan = () => {
    const found = new Map();
    const visit = (location) => {
      let stat;
      try { stat = fs.statSync(location); } catch { return; }
      if (!stat.isDirectory()) { found.set(location, `${stat.mtimeMs}:${stat.size}`); return; }
      for (const entry of fs.readdirSync(location, {withFileTypes: true})) {
        if (['node_modules', '.git', '.cache', '.b', 'review'].includes(entry.name)) continue;
        const next = path.join(location, entry.name);
        if (!entry.isDirectory() || options?.recursive) visit(next);
      }
    };
    visit(String(target));
    return found;
  };
  let previous = scan();
  const timer = setInterval(() => {
    const current = scan();
    for (const [file, value] of current) {
      if (previous.get(file) !== value) emitter.emit('change', previous.has(file) ? 'change' : 'rename', path.relative(String(target), file));
    }
    for (const file of previous.keys()) {
      if (!current.has(file)) emitter.emit('change', 'rename', path.relative(String(target), file));
    }
    previous = current;
  }, 1000);
  emitter.close = () => { clearInterval(timer); emitter.emit('close'); };
  emitter.ref = () => { timer.ref(); return emitter; };
  emitter.unref = () => { timer.unref(); return emitter; };
  if (options?.persistent === false) timer.unref();
  return emitter;
};
require('node:module').syncBuiltinESMExports();
