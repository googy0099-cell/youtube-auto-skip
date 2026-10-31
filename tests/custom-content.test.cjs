const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const source=fs.readFileSync(require('node:path').join(__dirname,'../youtube-auto-skip/custom-content.js'),'utf8');
const SkipDetector=require('../youtube-auto-skip/skip-detector.js');
function setup(options={}){
  let time=10000,metadata,storageListener,messageListener,interval,config=options.disabledSite?null:{selector:options.selector||null};
  const queued=[],events={},messages=[];
  const button={id:'skip-ad',tagName:'BUTTON',classList:[],isConnected:true,disabled:!!options.disabled,clicks:0,
    getAttribute(name){return name==='aria-label'?(options.label||'Skip Ad'):null;},
    closest(selector){if(selector==='a[href]')return options.link?{getAttribute(){return 'https://advertiser.example';}}:null;if(selector===SkipDetector.adState)return options.ad===false?null:{matches(){return true;}};return null;},
    matches(selector){return selector==='.jw-skip'?options.jw!==false:selector==='.jw-skippable'?options.ready!==false:false;},
    getBoundingClientRect(){return {left:100,top:100,width:80,height:30};},contains(hit){return hit===button;},
    click(){this.clicks++;if(options.dismiss)this.isConnected=false;},textContent:options.label||'Skip Ad'};
  const document={visibilityState:options.hidden?'hidden':'visible',documentElement:{setAttribute(name,value){metadata=JSON.parse(value);},append(){}},
    querySelectorAll(selector){
      if(selector==='*')return [];
      if(selector.includes("input[type='button']"))return options.noButton?[]:[button];
      if(selector==='#skip-ad')return [button];
      if(selector==='#broken[')throw new Error('invalid selector');
      if(selector.includes('.jwplayer'))return options.ad===false||options.jw===false||options.ready===false?[]:[button];
      if(selector.includes('.ad-showing'))return options.generic&&options.ad!==false?[{querySelectorAll(){return [button];}}]:[];
      return [];
    },elementFromPoint(){return options.covered?{}:button;},
    addEventListener(name,fn){events[name]=fn;},removeEventListener(name){delete events[name];},
    createElement(){return {style:{},setAttribute(){},append(){},addEventListener(){},contains(){return false;},remove(){}};}};
  const chrome={runtime:{onMessage:{addListener(fn){messageListener=fn;}},async sendMessage(message){messages.push(message);if(message.type==='custom-save-selector'){config={selector:message.selector};return {ok:true};}return {ok:true,config};}},
    storage:{onChanged:{addListener(fn){storageListener=fn;}}}};
  const context={window:{},document,chrome,SkipDetector,innerWidth:1000,innerHeight:700,CSS:{escape:value=>value},Date:{now:()=>time},
    getComputedStyle(){return {display:'block',visibility:options.invisible?'hidden':'visible',opacity:'1'};},
    MutationObserver:class{observe(){}disconnect(){}},setTimeout(fn,delay){queued.push({fn,delay});return queued.length;},clearTimeout(){},setInterval(fn){interval=fn;return 1;},clearInterval(){}};
  vm.runInNewContext(source,context);
  return {button,document,messages,metadata:()=>metadata,async flush(){await new Promise(setImmediate);for(const entry of queued.splice(0))if(entry.delay<=150)entry.fn();},
    async settle(){await this.flush();for(const entry of queued.splice(0))if(entry.delay===650)entry.fn();},
    async tick(){time+=2500;interval?.();await this.flush();},async disable(){config=null;storageListener({customSites:{}},'local');await this.flush();},
    async message(type){return new Promise(resolve=>messageListener({type},{},resolve));},
    async select(){await events.click({target:{closest:()=>button},preventDefault(){},stopImmediatePropagation(){}});},
  };
}
test('custom adapter clicks a known ready Skip control only on an enabled website',async()=>{
  const app=setup();await app.flush();assert.equal(app.button.clicks,1);await app.flush();assert.equal(app.button.clicks,1);
  await app.tick();assert.equal(app.button.clicks,2);await app.disable();await app.tick();assert.equal(app.button.clicks,2);assert.equal(app.metadata().state,'disabled');
});
test('reports a click with no observed effect as unconfirmed, not as a successful skip',async()=>{
  const app=setup();await app.settle();
  assert.equal(app.metadata().state,'click-not-confirmed');assert.equal(app.metadata().confirmed,0);
  const dismissed=setup({dismiss:true});await dismissed.settle();
  assert.equal(dismissed.metadata().state,'control-responded');assert.equal(dismissed.metadata().confirmed,1);
});
test('custom adapter avoids ads without Skip, invisible and covered controls, links and disabled websites',async()=>{
  for(const options of [{noButton:true},{ready:false},{hidden:true},{invisible:true},{covered:true},{disabled:true},{disabledSite:true},{link:true}]){
    const app=setup(options);await app.flush();assert.equal(app.button.clicks,0,JSON.stringify(options));
  }
});
test('generic detection recognizes labels without player-specific markup and never selects Skip intro',async()=>{
  for(const label of ['Skip Ad','ข้ามโฆษณา']){const app=setup({jw:false,generic:true,label});await app.flush();assert.equal(app.button.clicks,1);}
  for(const options of [{label:'Skip intro',generic:true},{label:'Close',generic:true}]){
    const app=setup({jw:false,...options});await app.flush();assert.equal(app.button.clicks,0);
  }
});
test('a selected control works outside recognized player markup and a broken selector fails closed',async()=>{
  const app=setup({jw:false,ad:false,selector:'#skip-ad'});await app.flush();assert.equal(app.button.clicks,1);
  const broken=setup({selector:'#broken['});await broken.flush();assert.equal(broken.button.clicks,0);assert.equal(broken.metadata().state,'rule-needs-update');
});
test('button picker saves a selector through the worker and resumes automatic clicking',async()=>{
  const app=setup({jw:false,ad:false,label:'Continue to video'});await app.flush();
  assert.equal((await app.message('custom-start-picker')).ok,true);
  assert.equal(app.metadata().state,'selecting-button');await app.select();await app.flush();
  assert.equal(app.messages.find(message=>message.type==='custom-save-selector').selector,'#skip-ad');
  assert.equal(app.button.clicks,1);
});
