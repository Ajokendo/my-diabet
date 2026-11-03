'use strict';
// Распознавание еды по фото через Anthropic Messages API.
// Ключ хранится только на сервере: ANTHROPIC_API_KEY. Модель: ANTHROPIC_MODEL.
// Необязательный код доступа для семьи: PHOTO_ACCESS_CODE (заголовок X-Access-Code).
const MODEL=process.env.ANTHROPIC_MODEL||'claude-sonnet-5-5';
const REFS={card:'банковская карта 85,6 × 54 мм',plate:'тарелка/пиала, внешний диаметр {d} мм',none:null};

function buildPrompt(b){
  const names=(Array.isArray(b.catalog)?b.catalog:[]).slice(0,800).map(String);
  let ref=REFS[b.reference?.type]||null;
  if(ref&&b.reference.type==='plate')ref=ref.replace('{d}',String(Math.round(+b.reference.diameterMm||0)));
  return `Ты помогаешь человеку с сахарным диабетом оценить еду на фото. Фото 1 — вид сверху${b.images?.length>1?', фото 2 — вид сбоку (по нему оценивай высоту и толщину слоя)':''}.
${ref?`На фото есть ориентир известного размера: ${ref}. Найди его и используй как масштаб для оценки размеров и объёма еды.`:'Ориентира размера нет — оценивай по типичным размерам посуды и приборов и ставь уверенность не выше "medium".'}
Задача: перечисли отдельные блюда/продукты, для каждого оцени массу в граммах (объём × типичная плотность этого блюда).
Сопоставь каждое с ОДНИМ названием из каталога ниже (точная строка). Если подходящего нет — catalogName: null и предложи своё название в name.
Не считай калории и углеводы — это сделает приложение по своей базе. Не давай советов по инсулину.
Ответь ТОЛЬКО JSON без пояснений:
{"referenceFound":true|false,"items":[{"name":"что видно","catalogName":"строка из каталога или null","grams":число,"confidence":"low|medium|high","note":"коротко: на что опиралась оценка"}],"warnings":["например: часть еды не видна, соус может содержать сахар"]}
Каталог: ${names.join('; ')}`;
}

async function recognize(b){
  const key=process.env.ANTHROPIC_API_KEY;
  if(!key){const e=new Error('На сервере не задан ANTHROPIC_API_KEY.');e.status=503;throw e}
  const imgs=(Array.isArray(b.images)?b.images:[]).slice(0,2).filter(x=>x&&x.data);
  if(!imgs.length){const e=new Error('Нет фото.');e.status=400;throw e}
  const content=imgs.map(x=>({type:'image',source:{type:'base64',media_type:x.mediaType||'image/jpeg',data:String(x.data).replace(/^data:[^,]+,/,'')}}));
  content.push({type:'text',text:buildPrompt(b)});
  const r=await fetch('https://api.anthropic.com/v1/messages',{method:'POST',headers:{'content-type':'application/json','x-api-key':key,'anthropic-version':'2023-06-01'},body:JSON.stringify({model:MODEL,max_tokens:1500,messages:[{role:'user',content}]})});
  const j=await r.json().catch(()=>({}));
  if(!r.ok){const e=new Error(j?.error?.message||('Ошибка API '+r.status));e.status=502;throw e}
  const text=(j.content||[]).filter(c=>c.type==='text').map(c=>c.text).join('');
  const m=text.match(/\{[\s\S]*\}/);if(!m){const e=new Error('Модель вернула ответ не в формате JSON.');e.status=502;throw e}
  const out=JSON.parse(m[0]);
  out.items=(Array.isArray(out.items)?out.items:[]).map(x=>({name:String(x.name||''),catalogName:x.catalogName?String(x.catalogName):null,grams:Math.max(0,Math.round(+x.grams||0)),confidence:['low','medium','high'].includes(x.confidence)?x.confidence:'low',note:String(x.note||'')}));
  out.warnings=Array.isArray(out.warnings)?out.warnings.map(String):[];
  out.model=MODEL;return out;
}

function checkAccess(req){const code=process.env.PHOTO_ACCESS_CODE;return !code||req.headers['x-access-code']===code}
module.exports={recognize,checkAccess,buildPrompt};
