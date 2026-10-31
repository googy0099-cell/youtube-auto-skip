const {test}=require('node:test');
const assert=require('node:assert/strict');
const detector=require('../youtube-auto-skip/skip-detector.js');
function control(label,options={}){
  return {id:options.id||'',textContent:label,innerText:label,
    getAttribute(name){return options[name]||null;},closest(){return options.ad?{}:null;}};
}
test('detects explicit Skip Ad labels without a named website or recognized ad container',()=>{
  for(const label of ['Skip Ad','Skip ads','Skip advertisement','Skip this ad','ข้ามโฆษณา','Saltar anuncio','Pular anúncio','Lewati iklan','広告をスキップ','광고 건너뛰기','跳过广告'])assert.ok(detector.score(control(label))>0,label);
});
test('avoids countdowns, intro skipping, download buttons and unrelated Skip controls',()=>{
  for(const label of ['Skip ad in 5 seconds','Skip in 3','ข้ามโฆษณา อีก 5 วินาที','Skip intro','Skip recap','Download','Subscribe','Close','Skip'])assert.equal(detector.score(control(label)),0,label);
  assert.ok(detector.score(control('Skip',{ad:true}))>0);
  assert.equal(detector.score(control('Skip intro',{id:'skip-ad'})),0);
});
test('recognizes icon-only controls by their accessibility label or ad-skip attributes',()=>{
  assert.ok(detector.score(control('',{'aria-label':'Skip Ad'}))>0);
  assert.ok(detector.score(control('',{id:'btn_skip_ad'}))>0);
  assert.ok(detector.score(control('',{'data-testid':'ad-skip-button'}))>0);
});
test('walks open shadow trees and custom text controls without player-specific selectors',()=>{
  const button=control('Skip advertisement');
  const shadow={querySelectorAll(selector){return selector==='*'?[]:[button];}};
  const root={querySelectorAll(selector){return selector==='*'?[{shadowRoot:shadow}]:[];}};
  assert.deepEqual(detector.find(root),[button]);
  const leaf=control('ข้ามโฆษณา');
  const textRoot={querySelectorAll(){return [];},createTreeWalker(){let done=false;return {nextNode(){if(done)return null;done=true;return {textContent:'ข้ามโฆษณา',parentElement:leaf};}};}};
  assert.deepEqual(detector.find(textRoot),[leaf]);
});
