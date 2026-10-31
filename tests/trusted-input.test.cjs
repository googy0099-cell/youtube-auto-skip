const {test} = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../youtube-auto-skip/background.js'), 'utf8');

function setup({failAttach = false, failInput = false} = {}) {
  let handler;
  const calls = [];
  const chrome = {
    runtime: {onMessage: {addListener(fn) {handler = fn;}}},
    tabs: {onRemoved: {addListener() {}}},
    debugger: {
      async attach(target) {calls.push(['attach', target]); if (failAttach) throw new Error('Already attached');},
      async sendCommand(target, method, params) {calls.push([method, target, params]); if (failInput) throw new Error('Input failed');},
      async detach(target) {calls.push(['detach', target]);},
    },
  };
  vm.runInNewContext(source, {chrome, URL, Date});
  return {calls, send(message, sender) {return new Promise(resolve => handler(message, sender, resolve));}};
}
const sender = {frameId: 0, url: 'https://www.youtube.com/watch?v=test', tab: {id: 12, url: 'https://www.youtube.com/watch?v=test'}};
const message = {type: 'youtube-skip-click', x: 450, y: 300, tabId: 999};

test('sends trusted input only to the Chrome-supplied sender tab and detaches', async () => {
  const app = setup();
  const result = await app.send(message, sender);
  assert.equal(result.ok, true);
  assert.deepEqual(app.calls.map(c => c[0]), ['attach', 'Input.dispatchMouseEvent', 'Input.dispatchMouseEvent', 'Input.dispatchMouseEvent', 'detach']);
  assert.ok(app.calls.every(c => c[1].tabId === 12));
  assert.deepEqual(app.calls.slice(1, 4).map(c=>c[2].type), ['mouseMoved', 'mousePressed', 'mouseReleased']);
  assert.equal((await app.send(message, sender)).error, 'throttled');
});

test('rejects other websites, subframes and invalid coordinates before attaching', async () => {
  const app = setup();
  for (const invalid of [
    {...sender, url: 'https://example.com/'},
    {...sender, tab: {id: 12, url: 'https://www.youtube.com.evil.test/'}},
    {...sender, frameId: 1},
  ]) assert.equal((await app.send(message, invalid)).error, 'invalid-sender');
  assert.equal((await app.send({...message, x: NaN}, sender)).error, 'invalid-position');
  assert.equal(app.calls.length, 0);
});

test('leaves another debugger untouched when attach fails', async () => {
  const app = setup({failAttach:true});
  assert.equal((await app.send(message, sender)).ok, false);
  assert.equal(app.calls.length, 1);
});

test('detaches even when input delivery fails', async () => {
  const app = setup({failInput:true});
  assert.equal((await app.send(message, sender)).ok, false);
  assert.equal(app.calls.at(-1)[0], 'detach');
});
