const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const SiteConfig=require('../youtube-auto-skip/site-config.js');
const source=fs.readFileSync(path.join(__dirname,'../youtube-auto-skip/sites-worker.js'),'utf8');
const ui={url:'chrome-extension://unit-test/manage.html?tab=12'};
function setup(){
  let handler, clicked, removedListener, addedListener, registration=[], state={customSites:[]},session={},now=10000;
  const grants=new Set(),calls=[];
  const chrome={
    action:{onClicked:{addListener(fn){clicked=fn;}}},
    runtime:{getURL:p=>'chrome-extension://unit-test/'+p,onMessage:{addListener(fn){handler=fn;}},onInstalled:{addListener(){}},onStartup:{addListener(){}}},
    storage:{local:{async get(){return structuredClone(state);},async set(value){state={...state,...structuredClone(value)};}},session:{async get(){return structuredClone(session);},async set(value){session={...session,...structuredClone(value)};},async remove(key){delete session[key];}},onChanged:{addListener(){}}},
    permissions:{async contains({origins}){return origins.every(value=>grants.has(value)||(!value.includes('*://') && !value.includes('://*') && grants.has(new URL(value).protocol+'//*/*')));},async remove({origins}){for(const value of origins)grants.delete(value);calls.push(['remove',...origins]);return true;},onRemoved:{addListener(fn){removedListener=fn;}},onAdded:{addListener(fn){addedListener=fn;}}},
    scripting:{async getRegisteredContentScripts(){return structuredClone(registration);},
      async registerContentScripts(entries){registration=structuredClone(entries);},
      async updateContentScripts(entries){registration=structuredClone(entries);},
      async unregisterContentScripts(){registration=[];},async executeScript(){calls.push(['inject']);}},
    tabs:{async get(id){return {id,url:'https://movies.example/watch'};},async query(){return [{id:12,url:'https://movies.example/watch'}];},async sendMessage(id,message){calls.push(['message',message.type]);},async create(options){calls.push(['create',options.url]);}},
  };
  function restart(){vm.runInNewContext(source,{SiteConfig,chrome,URL,structuredClone,console,Date:{now:()=>now}});}
  restart();
  return {grants,calls,settings:()=>state,registrations:()=>registration,openManager:clicked,revoke:removedListener,restart,advance(ms){now+=ms;},async permissionAdded(){addedListener();await new Promise(setImmediate);},
    send(message,sender=ui){return new Promise(resolve=>{const keep=handler(message,sender,resolve);if(!keep && !message.type)resolve(undefined);});},
  };
}
test('normalizes specific origins and rejects credentials, unsupported schemes and wildcard access',()=>{
  assert.equal(SiteConfig.origin('Example.com/watch?q=1'),'https://example.com');
  for(const value of ['file:///tmp/test','javascript://run','https://user:password@example.com','https://*.example.com'])assert.throws(()=>SiteConfig.origin(value));
});
test('starts with no predefined websites; adding requires a granted exact origin',async()=>{
  const app=setup();assert.equal((await app.send({type:'sites-list'})).sites.length,0);
  const refused=await app.send({type:'sites-add',origin:'movies.example'});
  assert.equal(refused.ok,false);assert.equal(app.settings().customSites.length,0);
  app.grants.add('https://movies.example/*');
  assert.equal((await app.send({type:'sites-add',origin:'movies.example'})).ok,true);
  assert.deepEqual(app.registrations()[0].matches,['https://movies.example/*']);
  assert.equal(app.registrations()[0].allFrames,true);
});
test('webpages and other extension pages cannot change website settings',async()=>{
  const app=setup();app.grants.add('https://movies.example/*');
  for(const sender of [{url:'https://movies.example'},{url:'chrome-extension://different-extension/manage.html'},{url:'chrome-extension://unit-test/other.html'}]){
    assert.equal((await app.send({type:'sites-add',origin:'movies.example'},sender)).ok,false);
  }
  assert.equal(app.settings().customSites.length,0);
});
test('embedded frames must be explicitly associated with an enabled main site',async()=>{
  const app=setup();for(const value of ['https://movies.example/*','https://video.example/*'])app.grants.add(value);
  await app.send({type:'sites-add',origin:'movies.example'});
  const frame={url:'https://video.example/embed/1',frameId:5,tab:{id:12,url:'https://movies.example/watch'}};
  assert.equal((await app.send({type:'custom-site-config'},frame)).config,null);
  await app.send({type:'sites-player-add',origin:'movies.example',player:'video.example'});
  assert.equal((await app.send({type:'custom-site-config'},frame)).config.origin,'https://video.example');
  const other={...frame,tab:{id:12,url:'https://unrelated.example/'}};
  assert.equal((await app.send({type:'custom-site-config'},other)).config,null);
  await app.send({type:'sites-toggle',origin:'movies.example',enabled:false});
  assert.equal((await app.send({type:'custom-site-config'},frame)).config,null);
  assert.equal(app.registrations().length,0);
});
test('removing a website stops it and revokes unused grants while preserving shared players',async()=>{
  const app=setup();for(const value of ['https://movies.example/*','https://second.example/*','https://video.example/*'])app.grants.add(value);
  for(const origin of ['movies.example','second.example']){
    await app.send({type:'sites-add',origin});
    await app.send({type:'sites-player-add',origin,player:'video.example'});
  }
  await app.send({type:'sites-remove',origin:'movies.example'});
  assert.equal(app.grants.has('https://movies.example/*'),false);
  assert.equal(app.grants.has('https://video.example/*'),true);
  await app.send({type:'sites-remove',origin:'second.example'});
  assert.equal(app.grants.has('https://video.example/*'),false);
  assert.equal(app.registrations().length,0);
});
test('selected buttons are saved only for an authorized frame and cleared on reset',async()=>{
  const app=setup();app.grants.add('https://movies.example/*');await app.send({type:'sites-add',origin:'movies.example'});
  const page={url:'https://movies.example/watch',frameId:0,tab:{id:12,url:'https://movies.example/watch'}};
  assert.equal((await app.send({type:'custom-save-selector',selector:'#skip-ad'},page)).ok,true);
  assert.equal((await app.send({type:'custom-site-config'},page)).config.selector,'#skip-ad');
  assert.equal((await app.send({type:'custom-save-selector',selector:'#wrong'},{...page,url:'https://unrelated.example'})).ok,false);
  await app.send({type:'sites-reset-rule',origin:'movies.example'});
  assert.equal((await app.send({type:'custom-site-config'},page)).config.selector,null);
});
test('manifest defaults to YouTube only and declares custom origins as optional',()=>{
  const manifest=JSON.parse(fs.readFileSync(path.join(__dirname,'../youtube-auto-skip/manifest.json'),'utf8'));
  assert.equal(manifest.content_scripts.length,1);
  assert.deepEqual(manifest.content_scripts[0].matches,['https://www.youtube.com/*','https://m.youtube.com/*']);
  assert.deepEqual(manifest.optional_host_permissions,['https://*/*','http://*/*']);
  assert.equal(manifest.host_permissions,undefined);
  assert.equal(manifest.action.default_popup,'manage.html');
});
test('toolbar uses a popup without a background handler opening a settings tab',()=>{
  const app=setup();assert.equal(app.openManager,undefined);assert.equal(app.calls.length,0);
});
test('permission approval saves the site after popup destruction and worker restart without opening a tab',async()=>{
  const app=setup(),token='popup-request-123';
  const prepared=await app.send({type:'sites-prepare-add',origin:'movies.example',token,tabId:12});
  assert.equal(prepared.pending,true);assert.equal(app.settings().customSites.length,0);
  app.restart();for(const origin of SiteConfig.wideAccess)app.grants.add(origin);
  await app.permissionAdded();assert.equal(app.settings().customSites.length,1);
  assert.equal((await app.send({type:'sites-complete-add',token})).ok,true);
  assert.equal(app.settings().customSites.length,1);
  assert.equal(app.calls.some(call=>call[0]==='create'),false);
  assert.equal(app.calls.filter(call=>call[0]==='inject').length,1);
});
test('permission event arriving before prepare still completes the same Add operation',async()=>{
  const app=setup();for(const origin of SiteConfig.wideAccess)app.grants.add(origin);
  await app.permissionAdded();
  const result=await app.send({type:'sites-prepare-add',origin:'movies.example',token:'already-granted-123'});
  assert.equal(result.pending,false);assert.equal(app.settings().customSites.length,1);
});
test('cancelled or expired popup requests are never applied by a later grant',async()=>{
  for(const expired of [false,true]){
    const app=setup(),token='cancel-request-123';
    await app.send({type:'sites-prepare-add',origin:'movies.example',token});
    if(expired)app.advance(61000);else await app.send({type:'sites-cancel-add',token});
    for(const origin of SiteConfig.wideAccess)app.grants.add(origin);
    await app.permissionAdded();assert.equal(app.settings().customSites.length,0);
  }
});
test('port-specific rules share Chrome domain access without revoking each other',async()=>{
  const app=setup();app.grants.add('http://localhost/*');
  assert.equal(SiteConfig.pattern('http://localhost:8888/test'),'http://localhost/*');
  await app.send({type:'sites-add',origin:'http://localhost:8888'});
  await app.send({type:'sites-add',origin:'http://localhost:9999'});
  assert.deepEqual(app.registrations()[0].matches,['http://localhost/*']);
  await app.send({type:'sites-remove',origin:'http://localhost:8888'});
  assert.equal(app.grants.has('http://localhost/*'),true);
  await app.send({type:'sites-remove',origin:'http://localhost:9999'});
  assert.equal(app.grants.has('http://localhost/*'),false);
});
test('permission revocation unregisters scripts and asks existing controllers to disable themselves',async()=>{
  const app=setup();app.grants.add('https://movies.example/*');
  await app.send({type:'sites-add',origin:'movies.example'});
  app.grants.delete('https://movies.example/*');app.revoke();
  await new Promise(setImmediate);
  assert.equal(app.registrations().length,0);
  assert.equal(app.calls.some(call=>call[0]==='message' && call[1]==='custom-refresh-config'),true);
});
test('one grant automatically includes new player domains but only underneath configured websites',async()=>{
  const app=setup();for(const origin of SiteConfig.wideAccess)app.grants.add(origin);
  await app.send({type:'sites-add',origin:'movies.example'});
  assert.equal(app.settings().customSites[0].autoFrames,true);
  assert.deepEqual(app.registrations()[0].matches,SiteConfig.wideAccess);
  const frame={url:'https://never-seen-player.example/embed',frameId:8,tab:{id:12,url:'https://www.movies.example/watch'}};
  assert.equal((await app.send({type:'custom-site-config'},frame)).config.origin,'https://never-seen-player.example');
  assert.equal((await app.send({type:'custom-site-config'},{...frame,tab:{id:12,url:'https://other.example'}})).config,null);
  assert.equal((await app.send({type:'custom-save-selector',selector:'#skip'},frame)).ok,true);
  assert.equal((await app.send({type:'custom-site-config'},frame)).config.selector,'#skip');
  await app.send({type:'sites-remove',origin:'movies.example'});
  for(const origin of SiteConfig.wideAccess)assert.equal(app.grants.has(origin),false);
  assert.equal(app.registrations().length,0);
});
test('common www and HTTP/HTTPS redirects preserve the website rule without including another domain',()=>{
  assert.equal(SiteConfig.sameWebsite('https://example.com','http://www.example.com/watch'),true);
  assert.equal(SiteConfig.sameWebsite('https://example.com','https://example.com.attacker.test'),false);
  assert.equal(SiteConfig.sameWebsite('http://localhost:8888','http://localhost:9999'),false);
});
