const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const read = (name) => fs.readFileSync(path.join(__dirname, name), "utf8");
const storageKey = "eryuan-relay-desktop-draft-v1";

function harness(storage = new Map(), denied = false) {
  const elements = new Map();
  const timers = new Map();
  const windowEvents = {};
  let sequence = 0;
  let calls = 0;
  const element = (selector) => {
    if (!elements.has(selector)) elements.set(selector, {
      id: selector.slice(1), value: "", innerHTML: "", textContent: "", style: {}, dataset: {}, listeners: {}, open: false,
      classList: { toggle() {} }, addEventListener(name, handler) { this.listeners[name] = handler; },
      setAttribute(name, value) { this[name] = value; }, focus() {}, click() { this.onclick?.(); },
      showModal() { this.open = true; }, close() { this.open = false; },
      getBoundingClientRect() { return { left: 0, top: 0, width: 0, height: 0 }; },
    });
    return elements.get(selector);
  };
  const forbidden = () => { calls += 1; throw new Error("External calls forbidden"); };
  const context = vm.createContext({
    structuredClone, TextEncoder,
    document: { querySelector: element, querySelectorAll: () => [], addEventListener() {}, elementFromPoint() { return null; } },
    window: { addEventListener(name, handler) { windowEvents[name] = handler; }, removeEventListener(name) { delete windowEvents[name]; } },
    localStorage: {
      getItem(key) { if (denied) throw new Error("storage_denied"); return storage.get(key) ?? null; },
      setItem(key, value) { if (denied) throw new Error("storage_denied"); storage.set(key, value); },
    },
    FormData: class {
      constructor(form) { this.values = new Map(Object.entries(form.fields)); }
      get(key) { return this.values.get(key) ?? null; }
      has(key) { return this.values.has(key); }
      getAll(key) { const value = this.values.get(key); return Array.isArray(value) ? value : value === undefined ? [] : [value]; }
      [Symbol.iterator]() { return this.values[Symbol.iterator](); }
    },
    requestAnimationFrame() {},
    setTimeout(callback) { const key = ++sequence; timers.set(key, callback); return key; },
    clearTimeout(key) { timers.delete(key); },
    fetch: forbidden, XMLHttpRequest: forbidden, WebSocket: forbidden,
  });
  vm.runInContext(["workbench.js", "relay-model.js", "relay-editor.js", "relay-ui.js", "app.js"].map(read).join("\n"), context);
  const click = (selector) => element(selector).onclick();
  const delegated = (dataset = {}, id) => element("#app").listeners.click({ target: { closest: () => ({ dataset, id }) } });
  const submit = (id, fields) => element("#app").listeners.submit({ preventDefault() {}, target: { id, fields } });
  const input = (id, fields) => element("#app").listeners.input({ target: { closest: (selector) => selector === "#" + id ? { fields } : null } });
  const send = (text) => { element("#relay-chat-input").value = text; submit("relay-composer"); };
  const flush = (limit = 200) => {
    let count = 0;
    while (timers.size && count++ < limit) {
      const [key, callback] = timers.entries().next().value;
      timers.delete(key); callback();
    }
    if (timers.size) throw new Error("Timer limit");
  };
  const save = () => { click("#relay-save"); return JSON.parse(storage.get(storageKey)); };
  return { element, storage, context, windowEvents, timers, click, delegated, submit, input, send, flush, save, graph: () => save().graph, calls: () => calls };
}

function generated(storage = new Map()) {
  const result = harness(storage);
  result.send("我提供商品资料、图片和主播排期，希望生成六镜视频，由真人审核后交付。");
  result.flush();
  return result;
}
module.exports = { harness, generated, storageKey, read };
