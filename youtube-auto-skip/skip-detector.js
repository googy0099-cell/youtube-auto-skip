/* Generic, local DOM detection. No site list, remote model or network request. */
var SkipDetector = (() => {
  const controls="button,[role='button'],input[type='button'],a[href],[aria-label],[title],[class*='skip' i],[id*='skip' i]";
  const adState=".jw-flag-ads,.ad-showing,.ad-playing,.vjs-ad-playing,[data-ad-state='playing'],[class*='ad-container' i],[class*='ads-container' i],[class*='advertisement' i]";
  const explicit=/^(?:skip\s+(?:(?:this|the)\s+)?(?:ads?|advert(?:isement)?s?)|ข้าม\s*(?:โฆษณา|โฆษนา)|(?:saltar|omitir)\s+(?:el\s+)?anuncios?|pular\s+an[uú]ncios?|ignorer\s+(?:l['’]\s*)?(?:annonce|publicit[eé])|werbung\s+[uü]berspringen|пропустить\s+рекламу|lewati\s+iklan|bỏ\s+qua\s+quảng\s+cáo|広告をスキップ|광고\s*건너뛰기|跳[过過]广告|略過廣告|تخطي\s+الإعلان)$/iu;
  const plain=/^(?:skip|ข้าม|пропустить|saltar|omitir)$/iu;
  function labels(node) {
    return [node.getAttribute?.("aria-label"),node.getAttribute?.("title"),node.getAttribute?.("data-tooltip"),node.innerText,node.textContent,node.value]
      .filter(v=>typeof v==="string" && v.length<180).map(v=>v.replace(/[\u200b-\u200f]/g,"").replace(/\s+/g," ").trim().replace(/[»›→]+$/u,"").trim());
  }
  function waiting(text) {
    const match=text.match(/(?:\b(?:in|after)\s*(\d+)|(?:อีก|รอ)\s*(\d+)|(\d+)\s*(?:seconds?\b|secs?\b|วินาที))/i);
    return !!match && Number(match[1]||match[2]||match[3])>0;
  }
  function score(node) {
    const text=labels(node);
    if(text.some(waiting))return 0;
    if(text.some(v=>/\b(?:intro|recap|credits|download|subscribe|purchase|login|sign in)\b|ข้าม(?:อินโทร|ตอนต้น)|ดาวน์โหลด|สมัครสมาชิก/i.test(v)))return 0;
    if(text.some(v=>explicit.test(v)))return 10;
    if(text.some(v=>/^(?:close|cancel|buy|install|ปิด|ยกเลิก|ซื้อ)$/i.test(v)))return 0;
    const identity=[node.id,node.getAttribute?.("class"),node.getAttribute?.("data-testid")].filter(Boolean).join(" ");
    if(/(?:skip[-_\s]*(?:ads?|advertisement)|(?:ads?|advertisement)[-_\s]*skip)/i.test(identity))return 8;
    if(text.some(v=>plain.test(v)) && node.closest?.(adState))return 6;
    return 0;
  }
  function roots(document) {
    const found=[document];
    // Bound the traversal; closed shadow trees are intentionally inaccessible.
    for(let i=0;i<found.length && i<40;i++)for(const node of [...found[i].querySelectorAll("*")].slice(0,6000)) {
      if(node.shadowRoot && !found.includes(node.shadowRoot))found.push(node.shadowRoot);
    }
    return found;
  }
  function query(document,selector) {return roots(document).flatMap(root=>[...root.querySelectorAll(selector)]);}
  function find(document,selector) {
    if(selector)return query(document,selector);
    const scored=new Map();
    for(const root of roots(document)) {
      const nodes=[...root.querySelectorAll(controls)].slice(0,1200);
      // Also recognize custom div/span controls with no framework-specific class.
      if(document.createTreeWalker) {
        const walker=document.createTreeWalker(root,4);let node,walked=0;
        while((node=walker.nextNode()) && ++walked<6000) {
          if(typeof node.textContent==="string" && explicit.test(node.textContent.trim())) {
            const parent=node.parentElement;
            if(parent)nodes.push(parent.closest("button,[role='button'],a[href]")||parent);
          }
        }
      }
      for(const node of nodes) {
        const value=score(node);if(value)scored.set(node,Math.max(value,scored.get(node)||0));
      }
    }
    return [...scored].sort((a,b)=>b[1]-a[1]).map(([node])=>node);
  }
  return {find,query,score,adState};
})();
if(typeof module!=="undefined")module.exports=SkipDetector;
