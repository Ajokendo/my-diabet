import json,sys
exec(open('/home/claude/guide/shoot.py').read().split('def shot(')[0])
COLLECT=r"""(()=>{const out=new Set();const cyr=/[А-Яа-яЁё]/;
const foods=new Set((db.foods||[]).map(f=>f.name));
const w=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT,{acceptNode:n=>n.parentNode&&/^(SCRIPT|STYLE)$/.test(n.parentNode.nodeName)?2:1});
let n;while((n=w.nextNode())){const t=n.nodeValue.trim();if(t&&cyr.test(t)&&!foods.has(t)&&t.length<600)out.add(t)}
document.querySelectorAll('[placeholder],[title],[aria-label]').forEach(e=>['placeholder','title','aria-label'].forEach(a=>{const v=e.getAttribute(a);if(v&&cyr.test(v)&&!foods.has(v))out.add(v.trim())}));
document.querySelectorAll('option').forEach(o=>{const t=o.textContent.trim();if(cyr.test(t)&&!foods.has(t))out.add(t)});
return [...out]})()"""
ALL={}
def grab(pg,tag):
    for t in pg.evaluate(COLLECT): ALL.setdefault(t,tag)
SECS="dashboard photo menu templates recipes favorites calendar foods insulin care dayinsight myprofile nutrients activity vitamins digestion profile medical labs reports account settings help glossary about".split()
with sync_playwright() as p:
    b=p.chromium.launch();pg=page(b,{'width':390,'height':844})
    pg.on('dialog',lambda d:d.dismiss())
    for s in SECS:
        try:pg.evaluate(f"show('{s}')");pg.wait_for_timeout(600);grab(pg,s)
        except Exception as e:print('ERR',s,e)
    for js,tag in [("helpTab('guide')",'guide'),("helpTab('faq')",'faq'),("DMAddFood.open('Обед')",'addfood'),("DMAddFood.choose(db.foods[5].id)",'addfood2'),("DMAddFood.close();show('menu');openInsulinForMeal('Завтрак')",'insmodal'),
      ("closeInsulinModal();DMCgmBig.open(24)",'big'),("DMCgmBig.mode('trends')",'trends'),("DMCgmBig.close();DMCare.sos()",'sos'),("DMCare.closeSos();show('report');generateDoctorReport()",'report'),
      ("toggleNavSheet(true)",'nav'),("toggleNavSheet(false);show('menu');(()=>{const b=document.querySelector('#meals .mBtn');b&&b.click()})()",'measure'),("DMMeasure.close();show('insulin');iG.value='9.4';iCarb.value='45';calcInsulin()",'calc'),
      ("show('foods');openFoodDetails(db.foods[3].id)",'fooddet')]:
        try:pg.evaluate(js);pg.wait_for_timeout(1200);grab(pg,tag)
        except Exception as e:print('ERR',tag,str(e)[:100])
    pg.evaluate("db.cloud2={};save();location.reload()");pg.wait_for_timeout(2500)
    pg.evaluate("show('account')");pg.wait_for_timeout(800);grab(pg,'account-guest')
    pg.evaluate("show('dashboard')");pg.wait_for_timeout(600);grab(pg,'dash-guest')
    pg.evaluate("show('photo')");pg.wait_for_timeout(600);grab(pg,'photo-guest')
    b.close()
srv.shutdown()
json.dump(ALL,open('/home/claude/ky_strings.json','w'),ensure_ascii=False,indent=0)
import collections
print(len(ALL), collections.Counter(ALL.values()).most_common(40))
print(sum(len(k) for k in ALL))
