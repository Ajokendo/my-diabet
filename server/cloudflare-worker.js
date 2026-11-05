// Cloudflare Worker: распознавание еды по фото для «Мой диабет».
// Секреты (Settings → Variables and Secrets): ANTHROPIC_API_KEY (обязательно), PHOTO_ACCESS_CODE (желательно).
// Необязательная переменная ANTHROPIC_MODEL (по умолчанию claude-sonnet-5-5).
const REFS={card:'банковская карта 85,6 × 54 мм',plate:'тарелка/пиала, внешний диаметр {d} мм',none:null};
const CORS={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Content-Type, X-Access-Code','Access-Control-Allow-Methods':'POST, OPTIONS'};
const J=(s,o)=>new Response(JSON.stringify(o),{status:s,headers:{...CORS,'Content-Type':'application/json; charset=utf-8'}});
function buildPrompt(b){
  const names=(Array.isArray(b.catalog)?b.catalog:[]).slice(0,800).map(String);
  let ref=REFS[b.reference?.type]||null;
  if(ref&&b.reference.type==='plate')ref=ref.replace('{d}',String(Math.round(+b.reference.diameterMm||0)));
  return `Ты помогаешь человеку с сахарным диабетом оценить еду на фото. Фото 1 — вид сверху${b.images?.length>1?', фото 2 — вид сбоку (по нему оценивай высоту и толщину слоя)':''}.
${ref?`На фото есть ориентир известного размера: ${ref}. Найди его и используй как масштаб для оценки размеров и объёма еды.`:'Ориентира размера нет — оценивай по типичным размерам посуды и приборов и ставь уверенность не выше "medium".'}
Важно для глубокой посуды (миски, пиалы, кастрюльки, стеклянная посуда): по фото сверху глубина не видна — оценивай уровень жидкости/еды по фото сбоку, учитывай толщину стенок и что посуда сужается ко дну; если фото сбоку нет — ставь уверенность "low" и не завышай объём. Для супов указывай массу без посуды.
Задача: перечисли отдельные блюда/продукты, для каждого оцени массу в граммах (объём × типичная плотность этого блюда).
Сопоставь каждое с ОДНИМ названием из каталога ниже (точная строка). Если подходящего нет — catalogName: null и предложи своё название в name.
Не считай калории и углеводы — это сделает приложение по своей базе. Не давай советов по инсулину.
Ответь ТОЛЬКО JSON без пояснений:
{"referenceFound":true|false,"items":[{"name":"что видно","catalogName":"строка из каталога или null","grams":число,"confidence":"low|medium|high","note":"коротко: на что опиралась оценка"}],"warnings":["например: часть еды не видна, соус может содержать сахар"]}
Каталог: ${names.join('; ')}`;
}


export default{async fetch(req,env){
  const url=new URL(req.url);
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers:CORS});
  if(req.method==='GET')return J(200,{ok:true,service:'my-diabet food-photo'});
  if(req.method!=='POST'||url.pathname!=='/v1/food-photo')return J(404,{error:'Не найдено'});
  if(env.PHOTO_ACCESS_CODE&&req.headers.get('X-Access-Code')!==env.PHOTO_ACCESS_CODE)return J(401,{error:'Неверный код доступа.'});
  if(!env.ANTHROPIC_API_KEY)return J(503,{error:'Не задан ANTHROPIC_API_KEY.'});
  let b;try{b=await req.json()}catch{return J(400,{error:'Неверный запрос.'})}
  const imgs=(Array.isArray(b.images)?b.images:[]).slice(0,2).filter(x=>x&&x.data);if(!imgs.length)return J(400,{error:'Нет фото.'});
  const model=env.ANTHROPIC_MODEL||'claude-sonnet-5-5';
  const content=imgs.map(x=>({type:'image',source:{type:'base64',media_type:x.mediaType||'image/jpeg',data:String(x.data).replace(/^data:[^,]+,/,'')}}));content.push({type:'text',text:buildPrompt(b)});
  const r=await fetch('https://api.anthropic.com/v1/messages',{method:'POST',headers:{'content-type':'application/json','x-api-key':env.ANTHROPIC_API_KEY,'anthropic-version':'2023-06-01'},body:JSON.stringify({model,max_tokens:1500,messages:[{role:'user',content}]})});
  const j=await r.json().catch(()=>({}));if(!r.ok)return J(502,{error:j?.error?.message||('Ошибка API '+r.status)});
  const text=(j.content||[]).filter(c=>c.type==='text').map(c=>c.text).join('');const m=text.match(/\{[\s\S]*\}/);if(!m)return J(502,{error:'Ответ модели не в формате JSON.'});
  let out;try{out=JSON.parse(m[0])}catch{return J(502,{error:'Ответ модели не разобран.'})}
  out.items=(Array.isArray(out.items)?out.items:[]).map(x=>({name:String(x.name||''),catalogName:x.catalogName?String(x.catalogName):null,grams:Math.max(0,Math.round(+x.grams||0)),confidence:['low','medium','high'].includes(x.confidence)?x.confidence:'low',note:String(x.note||'')}));
  out.warnings=Array.isArray(out.warnings)?out.warnings.map(String):[];out.model=model;return J(200,out);
}};
