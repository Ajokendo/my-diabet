import threading,functools,http.server,socketserver,json,sys
from playwright.sync_api import sync_playwright
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*a):pass
srv=socketserver.TCPServer(("127.0.0.1",0),functools.partial(Q,directory='/home/claude/my-diabet'));port=srv.server_address[1]
threading.Thread(target=srv.serve_forever,daemon=True).start()
SECS="care dashboard photo menu templates recipes favorites family account about help glossary insulin myprofile dayinsight glucose digestion nutrients activity vitamins foods calendar profile labs reports medical settings".split()
inj=open('/tmp/inj.js').read()
CHECK="""(()=>{const W=innerWidth,out=[];const sec=document.querySelector('.section.active');
if(document.documentElement.scrollWidth>W+2)out.push('page-scroll-x '+document.documentElement.scrollWidth);
sec.querySelectorAll('*').forEach(e=>{const r=e.getBoundingClientRect();if(!r.width||!r.height)return;const st=getComputedStyle(e);if(st.visibility==='hidden')return;
 if(r.right>W+1&&!e.closest('.tablewrap,.tbl,.insTable,.foodlist,[style*="overflow"]')){const p=e.parentElement&&e.parentElement.getBoundingClientRect();if(!p||p.right<=W+1)out.push('overflow:'+e.tagName+'.'+(e.className||'').toString().slice(0,30)+' «'+(e.innerText||'').slice(0,30).replace(/\\n/g,' ')+'» right='+Math.round(r.right))}
 if(e.tagName==='IMG'&&e.complete&&e.naturalWidth===0&&!/^https?:\\/\\/(?!127)/.test(e.src))out.push('broken-img '+e.src.slice(-50));
 if(e.tagName==='SELECT'&&e.options.length===0&&e.offsetParent)out.push('empty-select #'+e.id);
});return [...new Set(out)].slice(0,12)})()"""
res={}
with sync_playwright() as p:
    b=p.chromium.launch()
    for mode in ('guest','logged'):
        for n,vp in (('m',{'width':360,'height':800}),('d',{'width':1366,'height':850})):
            pg=b.new_page(viewport=vp);errs=[];cons=[]
            pg.on('pageerror',lambda e:errs.append(str(e)[:200]))
            pg.on('console',lambda m:cons.append(m.text[:160]) if m.type=='error' and 'Failed to load resource' not in m.text and 'ERR_CONNECTION' not in m.text else None)
            pg.goto(f'http://127.0.0.1:{port}/index.html');pg.wait_for_timeout(800)
            if mode=='logged':
                pg.evaluate(inj);pg.evaluate("db.cloud2=Object.assign(db.cloud2||{},{token:'x',patientId:'p1',patientName:'Айдар',role:'guardian',user:{email:'a@b',displayName:'Ата'},server:'http://127.0.0.1:1'});save()");pg.reload();pg.wait_for_timeout(1200)
            for s in SECS:
                e0=len(errs)
                try:pg.evaluate(f"show('{s}')")
                except Exception as ex:errs.append(f'show({s}) '+str(ex)[:150])
                pg.wait_for_timeout(250)
                try:o=pg.evaluate(CHECK)
                except Exception as ex:o=['check-fail '+str(ex)[:80]]
                newe=errs[e0:]
                if o or newe:res[f'{mode}/{n}/{s}']={'issues':o,'errors':newe}
            res[f'{mode}/{n}/console']=list(dict.fromkeys(cons))[:10]
            pg.close()
    b.close()
srv.shutdown()
json.dump(res,open('/tmp/audit.json','w'),ensure_ascii=False,indent=1)
for k,v in res.items():
    if v: print(k,json.dumps(v,ensure_ascii=False)[:600])
