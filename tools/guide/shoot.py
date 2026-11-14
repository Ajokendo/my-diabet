import threading,functools,http.server,socketserver,json,time,math,random,sys
from playwright.sync_api import sync_playwright
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*a):pass
srv=socketserver.TCPServer(("127.0.0.1",0),functools.partial(Q,directory='/home/claude/my-diabet'));port=srv.server_address[1]
threading.Thread(target=srv.serve_forever,daemon=True).start()
random.seed(7);now=int(time.time()*1000)
def g(i):
    t=now-i*5*60000;h=(time.localtime(t/1000).tm_hour+time.localtime(t/1000).tm_min/60)
    base=7+1.2*math.sin((h-6)/24*2*math.pi)
    for c,a in ((8.2,3.2),(13.6,3.6),(18.8,2.8)):
        dt=h-c
        if 0<dt<3:base+=a*math.sin(dt/3*math.pi)
    return round(max(3.2,base+0.6*math.sin(i/9)+random.uniform(-.25,.25)),1)
R=[{'t':now-60000-i*5*60000,'g':g(i),'d':'Flat'} for i in range(12*24*15)][::-1]
R[-1]['d']='FortyFiveDown'
DEMO=open('/home/claude/guide/demo.js').read()
OUT='/home/claude/guide/shots/'
def route(rt):
    u=rt.request.url
    J=lambda o:rt.fulfill(status=200,content_type='application/json',body=json.dumps(o,ensure_ascii=False))
    if '/cgm?' in u:
        since=int(u.split('since=')[1].split('&')[0]);return J({'connected':True,'device':'LinX','readings':[x for x in R if x['t']>since][:5000]})
    if u.endswith('/members'):return J({'members':[{'id':'m1','userId':'u1','role':'patient','displayName':'Тимур','email':'timur@example.com','me':False},{'id':'m2','role':'guardian','displayName':'Мама','email':'mama@example.com','me':True},{'id':'m3','role':'guardian','displayName':'Папа','email':'papa@example.com','me':False}]})
    if 'photo-quota' in u:return J({'unlimited':False,'left':7,'freeLeft':7,'paidLeft':0,'used':3,'contact':'WhatsApp автора','owner':False})
    if '/v2/sync/pull' in u:return J({'changes':[],'cursor':1,'hasMore':False})
    if '/v2/sync/push' in u:return J({'accepted':[],'cursor':1})
    return J({})
def page(b,vp,dark=False):
    pg=b.new_page(viewport=vp,device_scale_factor=2);pg.on('dialog',lambda d:d.accept());pg.on('pageerror',lambda e:print('ERR',str(e)[:150]))
    pg.route('**/my-diabet.ajokendo.workers.dev/**',route)
    pg.goto(f"http://127.0.0.1:{port}/index.html");pg.wait_for_timeout(900)
    pg.evaluate("""(r)=>{localStorage.setItem('dm-cgm:p1',JSON.stringify({r:r.filter(x=>x.t>Date.now()-36*3600e3),c:true}));localStorage.setItem('dm-disclaimer-v1','1');localStorage.setItem('dm-alerts',JSON.stringify({on:true}));
      db.cloud2={patientId:'p1',token:'t',initialized:true,role:'guardian',patientName:'Тимур',user:{displayName:'Мама',email:'mama@example.com'},lastSyncAt:new Date().toISOString()};save();location.reload()}""",R)
    pg.wait_for_timeout(1500);pg.evaluate(DEMO);pg.evaluate("location.reload()");pg.wait_for_timeout(2200)
    return pg
def shot(pg,name,js=None,wait=700,sel=None,full=False):
    if js:pg.evaluate(js)
    pg.wait_for_timeout(wait)
    if sel:
        el=pg.query_selector(sel)
        if el:el.screenshot(path=OUT+name+'.png');return
    pg.screenshot(path=OUT+name+'.png',full_page=full)
