const {test} = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../youtube-auto-skip/content.js'), 'utf8');

function setup({ad = true, visible = true, covered = false, disabled = false} = {}) {
  let queued;
  let timer;
  let metadata;
  const messages = [];
  const button = {
    isConnected: true, disabled,
    getAttribute() {return null;}, closest() {return null;},
    getBoundingClientRect() {return {left:100, top:200, width:80, height:40};},
    contains(hit) {return hit === button;},
  };
  const player = {
    classList: {contains() {return ad;}},
    querySelector() {return {currentTime:5, duration:15};},
    querySelectorAll() {return [button];},
  };
  const document = {
    documentElement:{setAttribute(name, value) {metadata = JSON.parse(value);}},
    visibilityState: visible ? 'visible' : 'hidden',
    querySelector() {return player;},
    elementFromPoint() {return covered ? {} : button;},
    addEventListener() {},
  };
  vm.runInNewContext(source, {
    document, innerWidth:1280, innerHeight:720, Date,
    getComputedStyle() {return {display:'block', visibility:'visible', opacity:'1'};},
    MutationObserver:class {observe() {}},
    setTimeout(fn) {queued = fn; return 1;},
    setInterval(fn) {timer = fn;},
    chrome:{runtime:{async sendMessage(message) {messages.push(message); return {ok:true};}}},
  });
  return {messages, document, metadata:()=>metadata,
    async scan() {const fn=queued; queued=null; await fn?.();},
    async tick() {timer(); await this.scan();},
  };
}

test('requests browser input at the visible Skip button center', async () => {
  const app=setup(); await app.scan();
  assert.equal(app.messages.length,1);
  assert.equal(app.messages[0].x,140);
  assert.equal(app.messages[0].y,220);
  assert.equal(app.metadata().delivered,1);
});

test('never requests input without an ad, in hidden tabs, or on a covered/disabled button', async () => {
  for (const options of [{ad:false},{visible:false},{covered:true},{disabled:true}]) {
    const app=setup(options); await app.scan();
    assert.equal(app.messages.length,0);
  }
});

test('resumes when a hidden tab becomes visible and throttles repeated clicks', async () => {
  const app=setup({visible:false}); await app.scan();
  app.document.visibilityState='visible'; await app.tick();
  assert.equal(app.messages.length,1);
  await app.tick(); assert.equal(app.messages.length,1);
});
