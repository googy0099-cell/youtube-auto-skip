const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const SiteConfig=require('../youtube-auto-skip/site-config.js');
const source=fs.readFileSync(path.join(__dirname,'../youtube-auto-skip/manage.js'),'utf8');
function setup(options={}){
  const nodes=new Map(),calls=[];let sites=[],pending;
  function node(){return {dataset:{},listeners:{},children:[],value:'',addEventListener(name,fn){this.listeners[name]=fn;},append(...items){this.children.push(...items);},prepend(...items){this.children.unshift(...items);},replaceChildren(){this.children=[];}};}
  const document={getElementById(id){if(!nodes.has(id))nodes.set(id,node());return nodes.get(id);},createElement:node,querySelectorAll(){return [...nodes.values()];}};
  const chrome={runtime:{id:'test',getURL:p=>'chrome-extension://test/'+p,async sendMessage(message){
    calls.push(message);
    if(message.type==='sites-prepare-add'){pending=message;return {ok:true,pending:true};}
    if(message.type==='sites-complete-add')sites=[{origin:pending.origin,enabled:true,autoFrames:true,players:[],selector:null}];
    return {ok:true,sites};
  }},permissions:{async request(request){calls.push({type:'permission',...request});return options.granted!==false;}},
    storage:{onChanged:{addListener(){}}},tabs:{
      async get(){return {id:12,url:options.startUrl||'https://www.youtube.com/watch?v=test'};},
      async query(){return [];},
      async create(value){calls.push({type:'create',...value});return {id:34,url:value.url};},
      async update(id,value){calls.push({type:'update',id,...value});}
    }};
  const protocol=options.file?'file:':'chrome-extension:';
  vm.runInNewContext(source,{SiteConfig,chrome,document,URL,crypto:require('node:crypto'),location:{protocol,href:protocol+'//test/manage.html?tab=12'},console});
  return {nodes,calls,sites:()=>sites,async ready(){await new Promise(setImmediate);},async add(value){document.getElementById('website').value=value;await nodes.get('add-form').listeners.submit({preventDefault(){}});}};
}
test('popup saves any entered website without creating or navigating a browser tab',async()=>{
  const app=setup();await app.ready();await app.add('https://arbitrary.example/watch/movie');
  const permission=app.calls.find(call=>call.type==='permission');
  assert.deepEqual(Array.from(permission.origins),SiteConfig.wideAccess);
  assert.equal(app.sites()[0].origin,'https://arbitrary.example');
  assert.equal(app.calls.some(call=>call.type==='create'||call.type==='update'),false);
});
test('popup passes the existing website tab to background activation',async()=>{
  const app=setup({startUrl:'https://arbitrary.example/watch'});await app.ready();await app.add('https://arbitrary.example/watch');
  assert.equal(app.calls.some(call=>call.type==='create'),false);
  assert.equal(app.calls.find(call=>call.type==='sites-prepare-add').tabId,12);
});
test('declining access leaves the website list unchanged and displays the result',async()=>{
  const app=setup({granted:false});await app.ready();await app.add('https://arbitrary.example');
  assert.equal(app.sites().length,0);assert.match(app.nodes.get('notice').textContent,/declined/);
});
test('opening manage.html as a normal file shows installation guidance instead of invoking extension APIs',async()=>{
  const app=setup({file:true});await app.ready();
  assert.match(app.nodes.get('notice').textContent,/icon in Chrome/);
  assert.equal(app.calls.length,0);
});
