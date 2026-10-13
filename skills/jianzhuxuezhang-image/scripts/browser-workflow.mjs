'use strict';
// Uses the documented Codex managed-tab Playwright interface; no private API or credentials.
const DEFAULTS = Object.freeze({model:'GPT-image-2.5',resolution:'2k',ratio:'自动',count:'1'});
const aliases = {gpt:'GPT-image-2.5','gpt2.5':'GPT-image-2.5','豆包':'Seedream 5.0 Pro',doubao:'Seedream 5.0 Pro',seedream:'Seedream 5.0 Pro','seedream5.0':'Seedream 5.0 Pro','千问':'qwen-image-3.0',qwen:'qwen-image-3.0',banana:'Banana Pro'};
const clean = s => String(s).trim().replace(/\s*new\s*$/i,'').trim();
const normal = s => clean(s).toLowerCase().replace(/[\s_-]+/g,'');
function request(input={}) {
  const r={...DEFAULTS,...input};
  r.model=aliases[String(r.model).toLowerCase()]||r.model;
  r.resolution=String(r.resolution).toLowerCase();
  r.count=String(r.count).replace(/张$/,'');
  if(!/^[123]$/.test(r.count)) throw Error('count must be 1, 2 or 3');
  if(r.mode) throw Error('Current website has no legacy quick/precise mode control');
  return r;
}
const composer = tab => tab.playwright.getByRole('button').filter({has:tab.playwright.getByRole('textbox',{name:'输入描述，可使用 @ 提及参考图',exact:true}),visible:true});
const modelMenu = tab => tab.playwright.getByRole('tooltip').filter({hasText:'站内模型',visible:true});
const specMenu = tab => tab.playwright.getByRole('tooltip').filter({hasText:'生成设置',visible:true});
const trigger = (tab,label) => composer(tab).locator('[class*="option_title_text_"]').filter({hasText:new RegExp('^'+label.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'$')});
async function expandComposer(tab) {
  if(await tab.playwright.getByRole('textbox',{name:'输入描述，可使用 @ 提及参考图',exact:true}).filter({visible:true}).count()) return;
  const collapsed=tab.playwright.locator('[data-input-resize-surface][class*="collapse_"]').filter({visible:true});
  if(await collapsed.count()) await collapsed.click();
  await tab.playwright.getByRole('textbox',{name:'输入描述，可使用 @ 提及参考图',exact:true}).filter({visible:true}).waitFor({state:'visible',timeoutMs:10000});
}
async function clearInterruptions(tab) {
  const handled=[];
  // This modal can cover 重新登录, even while that button is present in the DOM.
  const domain=tab.playwright.getByRole('dialog').filter({hasText:'网站域名升级',visible:true});
  if(await domain.count()) {
    await domain.getByRole('button',{name:'暂不使用新域名',exact:true}).click();
    await domain.waitFor({state:'hidden',timeoutMs:8000});
    handled.push('domain_notice_dismissed');
  }
  const mode=tab.playwright.getByRole('alertdialog').filter({hasText:'模式切换',visible:true});
  if(await mode.count()) {
    await mode.getByRole('button',{name:'确定',exact:true}).click();
    await mode.waitFor({state:'hidden',timeoutMs:8000});
    handled.push('mode_notice_dismissed');
  }
  const overseas=tab.playwright.getByRole('dialog').filter({hasText:'为您推荐Archmaster.ai',visible:true});
  if(await overseas.count()) {
    const noRepeat=overseas.getByRole('checkbox',{name:'不再提醒'});
    if(await noRepeat.count()) {
      await noRepeat.check();
      if(await noRepeat.getAttribute('aria-checked')!=='true') throw Error('Promotion no-repeat choice was not confirmed');
    }
    await overseas.getByRole('button',{name:'Close'}).click();
    await overseas.waitFor({state:'hidden',timeoutMs:8000});
    handled.push('overseas_promotion_dismissed');
  }
  const relogin=tab.playwright.getByRole('dialog').filter({hasText:'本设备已退出登录',visible:true});
  if(await relogin.count()) {
    await relogin.getByRole('button',{name:'重新登录',exact:true}).click();
    await tab.playwright.domSnapshot();
    try { await relogin.waitFor({state:'hidden',timeoutMs:4000}); }
    catch { throw Error('Clicked 重新登录, but the logout dialog did not close; login requires manual inspection.'); }
    handled.push('relogin_selected');
  }
  const promotion=tab.playwright.getByRole('dialog').filter({has:tab.playwright.getByRole('img',{name:'close-circle',exact:true}),visible:true});
  if(await promotion.count()) {
    await promotion.getByRole('img',{name:'close-circle',exact:true}).click();
    await promotion.waitFor({state:'hidden',timeoutMs:4000});
    handled.push('promotion_closed');
  }
  const reminder=tab.playwright.getByRole('dialog').filter({hasText:'升级提醒',visible:true});
  if(await reminder.count()) {
    const noRepeat=reminder.locator('[class*="agree_wrap_"]');
    const selected=()=>noRepeat.evaluate(e=>e.querySelector('use')?.getAttribute('xlink:href')==='#micro-icon-selected');
    if(!await selected()) {
      await noRepeat.click();
      await tab.playwright.domSnapshot();
      if(!await selected()) throw Error('Clicked 不再提示, but the check mark did not appear; stop before dismissing the reminder.');
    }
    await reminder.getByRole('button',{name:'知道了',exact:true}).click();
    await reminder.waitFor({state:'hidden',timeoutMs:8000});
    handled.push('reminder_dismissed_no_repeat');
  }
  return handled;
}
async function settleMenu(tab,menu) {
  await menu.innerText();
  // Popover enter animation moves hit targets after they become visible.
  await tab.playwright.waitForTimeout(350);
}
async function state(tab) {
  return composer(tab).evaluate(el=>{
    const visible=e=>!!(e.getClientRects().length) && !e.closest('[hidden]');
    const labels=[...el.querySelectorAll('[class*="option_title_text_"]')].filter(e=>visible(e)&&!e.closest('[role="tooltip"]')).map(e=>e.textContent.trim());
    return {model:labels.find(t=>/^(Banana|GPT-image|Seedream|qwen-image)/i.test(t)),resolution:labels.find(t=>/^\dk$/i.test(t)),ratio:labels.find(t=>/^\d+:\d+$/.test(t)||t==='自动'),count:(labels.find(t=>/^\d+张$/.test(t))||'').replace('张','')};
  });
}
async function closeMenus(tab) {
  const s=await state(tab);
  if(await specMenu(tab).count()) await trigger(tab,s.resolution).click();
  if(await modelMenu(tab).count()) await trigger(tab,s.model).click();
  await tab.playwright.domSnapshot();
}
async function models(tab) {
  await clearInterruptions(tab);
  if(!await modelMenu(tab).count()) {
    const s=await state(tab);
    await trigger(tab,s.model).click();
  }
  await modelMenu(tab).locator('[class*="operate_item_"]').filter({hasText:/^Banana Pro$/}).waitFor({state:'visible',timeoutMs:5000});
  await settleMenu(tab,modelMenu(tab));
  return (await modelMenu(tab).locator('[class*="operate_item_"]').allTextContents({})).map(clean);
}
async function selectModel(tab, model) {
  await clearInterruptions(tab);
  const target=request({model}).model;
  if(normal((await state(tab)).model)===normal(target)) return state(tab);
  const labels=await models(tab);
  const matches=labels.filter(v=>normal(v)===normal(target));
  if(matches.length!==1) throw Error('Model unavailable or ambiguous: '+target+'; '+labels.join(', '));
  const escaped=matches[0].replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  await modelMenu(tab).locator('[class*="operate_item_"]').filter({hasText:new RegExp('^'+escaped+'(?:\\s*new)?$')}).click();
  await composer(tab).locator('[class*="option_title_text_"]').filter({hasText:new RegExp('^'+escaped+'$')}).waitFor({state:'visible',timeoutMs:5000});
  await tab.playwright.domSnapshot();
  const result=await state(tab);
  if(normal(result.model)!==normal(target)) throw Error('Model selection not confirmed: '+JSON.stringify(result));
  return result;
}
async function capabilities(tab) {
  await clearInterruptions(tab);
  if(!await specMenu(tab).count()) {
    const s=await state(tab);
    await trigger(tab,s.resolution).click();
  }
  await settleMenu(tab,specMenu(tab));
  const text=await specMenu(tab).innerText();
  const lines=text.split('\n').map(t=>t.trim());
  return {model:(await state(tab)).model,ratios:lines.filter(t=>/^\d+:\d+$/.test(t)||t==='自动'),resolutions:lines.filter(t=>/^\dk$/i.test(t)),counts:lines.filter(t=>/^\d+张$/.test(t)).map(t=>t.replace('张','')),text};
}
async function configure(tab,input={}) {
  await expandComposer(tab);
  const r=request(input);
  await selectModel(tab,r.model);
  const cap=await capabilities(tab);
  for(const [key,values] of [['resolution',cap.resolutions],['ratio',cap.ratios],['count',cap.counts]]) {
    if(!values.some(v=>normal(v)===normal(r[key]))) throw Error('Unsupported '+key+'='+r[key]+' for '+cap.model+'; visible: '+values.join(', '));
    const label=key==='count'?r.count+'张':r[key];
    if(normal((await state(tab))[key])===normal(r[key])) continue;
    await specMenu(tab).getByText(label,{exact:true}).click();
    await specMenu(tab).locator('[class*="active_"]').filter({has:tab.playwright.getByText(label,{exact:true})}).waitFor({state:'visible',timeoutMs:5000});
    await tab.playwright.domSnapshot();
  }
  await closeMenus(tab);
  const actual=await state(tab);
  for(const key of ['model','resolution','ratio','count']) if(normal(actual[key])!==normal(r[key])) throw Error('Setting not applied: '+key+'; '+JSON.stringify(actual));
  return {requested:r,actual,capabilities:cap};
}
async function prepare(tab,input) {
  if(!/^https:\/\/www\.jianzhuxuezhang\.com\/ai\/banana_modifier\/operate(?:[?#]|$)/.test(await tab.url())) throw Error('Open the observed /ai/banana_modifier/operate page before configuring: homepage submission resets settings.');
  if(!input.prompt?.trim()) throw Error('A prompt is required');
  await expandComposer(tab);
  const record=await configure(tab,input);
  await composer(tab).getByRole('textbox').fill(input.prompt);
  record.prompt=await composer(tab).getByRole('textbox').innerText();
  if(record.prompt!==input.prompt) throw Error('Prompt readback differs');
  record.sourceImages=await composer(tab).evaluate(el=>[...new Set([...el.querySelectorAll('img')].map(e=>e.currentSrc||e.src).filter(s=>/\/upload\//.test(s)&&!/x-tos-process=/.test(s)))]);
  record.beforeImages=await tab.playwright.locator('img').evaluateAll(es=>es.map(e=>e.currentSrc||e.src));
  record.status='prepared';
  return record;
}
async function submitOnce(tab,record) {
  if(record.status!=='prepared') throw Error('Only a prepared request may submit, never retry automatically');
  const current=await state(tab);
  for(const key of ['model','resolution','ratio','count']) if(normal(current[key])!==normal(record.actual[key])) throw Error('Settings changed after preparation: '+key);
  if(await composer(tab).getByRole('textbox').innerText()!==record.prompt) throw Error('Prompt changed after preparation');
  record.status='submission_started';
  record.submittedAt=new Date().toISOString();
  await composer(tab).locator('button[class*="start_btn_"]').click();
  record.pageAfterSubmit=await tab.playwright.domSnapshot();
  record.status=record.pageAfterSubmit.includes('正在生成中')?'accepted':'submitted_unverified';
  return record;
}
async function resultStatus(tab,record) {
  // The site may silently remove individual prompt terms before storing a card.
  // Uploaded source URLs are unique for this run and survive that sanitization.
  const cards=tab.playwright.locator('[class*="list_item_"]');
  const snapshots=await cards.evaluateAll(es=>es.map(e=>({text:e.innerText,sourceImages:[...e.querySelectorAll('img')].map(i=>i.currentSrc||i.src),images:[...e.querySelectorAll('[class*="response_container_"] img')].map(i=>({src:i.currentSrc||i.src,width:i.naturalWidth,height:i.naturalHeight}))})));
  const prefix=record.prompt.slice(0,45).replace(/\s+/g,' ');
  const relevant=snapshots.filter(c=>(record.sourceImages||[]).some(src=>c.sourceImages.includes(src))||c.text.replace(/\s+/g,' ').includes(prefix));
  const old=new Set(record.beforeImages||[]);
  const matches=relevant.map(c=>({...c,images:c.images.filter(i=>i.src&&!old.has(i.src)&&i.width>0)})).filter(c=>c.images.length);
  if(matches.length>1) throw Error('Multiple new result cards match; inspect before downloading');
  if(matches.length===1) return {status:'succeeded',...matches[0]};
  if(relevant.some(c=>/生成失败|任务失败/.test(c.text))) return {status:'failed',text:relevant.map(c=>c.text).join('\n')};
  if(relevant.some(c=>/正在生成|排队/.test(c.text))) return {status:'running'};
  return {status:'unknown'};
}
async function acceptReference(tab,name) {
  const editor=tab.playwright.getByRole('dialog').filter({hasText:'图片编辑',visible:true});
  const use=tab.playwright.getByText('立即使用',{exact:true}).filter({visible:true});
  // The browser bridge can return a shorter selector deadline than requested.
  // Retry only readiness reads; click the editor acceptance control once.
  for(let attempt=0;attempt<4;attempt++) {
    await tab.playwright.domSnapshot();
    if(await use.isVisible()) break;
    try { await use.waitFor({state:'visible',timeoutMs:10000}); break; }
    catch(e) {
      if(await use.isVisible()) break;
      if(attempt===3||!/deadline|timeout|timed out/i.test(String(e))) throw e;
    }
  }
  await use.click();
  await editor.waitFor({state:'hidden',timeoutMs:15000});
  await tab.playwright.locator('[title="'+name.replace(/"/g,'\\"')+'"]').waitFor({state:'visible',timeoutMs:10000});
}
async function uploadReference(tab,path,name) {
  await clearInterruptions(tab);
  await expandComposer(tab);
  const attached=tab.playwright.locator('[title="'+name.replace(/"/g,'\\"')+'"]');
  if(await attached.count()) {
    if(await tab.playwright.getByRole('dialog').filter({hasText:'图片编辑',visible:true}).count()) await acceptReference(tab,name);
    return {name,path,attached:true,resumed:true};
  }
  await tab.playwright.locator('[class*="upload_btn_"]').filter({visible:true}).click();
  const upload=tab.playwright.getByRole('dialog').getByRole('button',{name:'上传图片',exact:true});
  let chooser;
  for(let attempt=0;attempt<2;attempt++) {
    const event=tab.playwright.waitForEvent('filechooser',{timeoutMs:3000});
    await upload.click();
    try { chooser=await event; break; }
    catch(e) {
      if(attempt===1) throw e;
      if(!await upload.isVisible()) throw Error('Upload dialog changed before a file chooser opened');
    }
  }
  await chooser.setFiles(path);
  await acceptReference(tab,name);
  return {name,path,attached:true};
}
async function downloadResults(tab,record) {
  const result=await resultStatus(tab,record);
  if(result.status!=='succeeded') throw Error('No verified new result: '+result.status);
  if(result.images.length!==Number(record.actual.count)) throw Error('Result count differs from request');
  const outputs=[];
  for(const item of result.images) {
    const locator=tab.playwright.getByRole('img',{name:item.src,exact:true});
    if(await locator.count()!==1) throw Error('Result image locator ambiguous');
    outputs.push({...item,path:await locator.downloadMedia({timeoutMs:60000})});
  }
  record.status='downloaded_pending_pixel_check'; record.outputs=outputs;
  return outputs;
}
// A single entry point for authorized runs. Supply checkpoint to persist state;
// submission failures are checkpointed and never automatically resubmitted.
async function finishImageEdit(tab,record,{checkpoint=async()=>{},onProgress=async()=>{},timeoutMs=300000}={}) {
  const deadline=Date.now()+timeoutMs;
  let previousStatus;
  while(Date.now()<deadline) {
    const result=await resultStatus(tab,record);
    if(result.status!==previousStatus) await onProgress({status:result.status,submittedAt:record.submittedAt});
    previousStatus=result.status;
    if(result.status==='failed') {
      record.status='failed'; await checkpoint(record);
      throw Error('Generation failed; no automatic resubmission');
    }
    if(result.status==='succeeded') {
      if(!record.outputs?.length) await downloadResults(tab,record);
      await checkpoint(record);
      return record;
    }
    const card=tab.playwright.locator('[class*="list_item_"]').filter({has:tab.playwright.getByRole('img',{name:record.sourceImages[0],exact:true})});
    const image=card.locator('[class*="response_container_"] img').first();
    try { await image.waitFor({state:'visible',timeoutMs:Math.min(30000,deadline-Date.now())}); }
    catch(e) {
      if(!/deadline|timeout|timed out/i.test(String(e))) throw e;
    }
  }
  record.status='pending_result'; await checkpoint(record);
  throw Error('Result still pending; resume finishImageEdit with this record, never resubmit');
}
async function runImageEdit(tab,input,{checkpoint=async()=>{},onProgress=async()=>{},timeoutMs=300000}={}) {
  if(!input.referencePath) throw Error('referencePath is required');
  const name=input.referenceName||input.referencePath.split(/[\\/]/).pop();
  await clearInterruptions(tab);
  await expandComposer(tab);
  await selectModel(tab,input.model||DEFAULTS.model);
  await uploadReference(tab,input.referencePath,name);
  const {referencePath,referenceName,...settings}=input;
  const record=await prepare(tab,settings);
  if(record.sourceImages.length!==1) throw Error('Exactly one reference must be attached');
  await checkpoint(record);
  try { await submitOnce(tab,record); }
  finally { await checkpoint(record); }
  await onProgress(record);
  return finishImageEdit(tab,record,{checkpoint,onProgress,timeoutMs});
}
export {DEFAULTS,request,clean,normal,expandComposer,clearInterruptions,acceptReference,uploadReference,state,models,selectModel,capabilities,configure,prepare,submitOnce,resultStatus,downloadResults,runImageEdit,finishImageEdit};
