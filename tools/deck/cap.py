import threading,functools,http.server,socketserver
from playwright.sync_api import sync_playwright
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*a):pass
srv=socketserver.TCPServer(("127.0.0.1",0),functools.partial(Q,directory='/home/claude/my-diabet'));port=srv.server_address[1]
threading.Thread(target=srv.serve_forever,daemon=True).start()
SETUP=r"""(()=>{const now=Date.now(),r=[];let g=6.8;for(let i=0;i<24*60/5*14;i++){const t=now-(24*60/5*14-i)*5*60000,h=new Date(t).getHours();const meal=[8,13,19].some(m=>h===m||h===m+1)?0.25:-0.05;g=Math.max(3.6,Math.min(13.5,g+meal*(Math.random()+0.3)+(Math.random()-0.5)*0.35+(7-g)*0.03));r.push({t,g:+g.toFixed(1),d:'Flat'})}
r[r.length-1].d='FortyFiveDown';
db.cloud2={token:'x',patientId:'p1',patientName:'Тимур',role:'guardian',user:{email:'demo@example.com',displayName:'Папа'},lastSyncAt:new Date().toISOString(),server:'http://127.0.0.1:1',initialized:true};
localStorage.setItem('dm-cgm:p1',JSON.stringify({r,c:true}));
db.profile=Object.assign(db.profile||{},{surname:'Демо',firstName:'Тимур',name:'Демо Тимур',icr:12,isf:3,target:5.5,height:150,weight:42,dob:'2014-03-15'});
const f=db.foods.filter(isFoodVisible),F=n=>f.find(x=>x.name===n)||f.find(x=>x.name.includes(n));const m=getMenu();
m['Завтрак']=[{id:'a',foodId:F('Каша овсяная на воде').id,g:200},{id:'b',foodId:F('Хлеб бородинский').id,g:30},{id:'c',foodId:F('Сыр «Гауда»').id,g:20}];
m['Обед']=[{id:'d',foodId:F('Плов с мясом баранины').id,g:220},{id:'e',foodId:F('Огурец').id,g:100}];
m['Перекус 2']=[{id:'f',foodId:F('Яблоко').id,g:150}];
db.medical=db.medical||{};db.medical.cgm={product:'LinX',manufacturer:'MicroTech Medical (WeiTai)',installed:new Date(now-6*864e5).toISOString().slice(0,10)};
db.medical.actualInsulinLog=[{id:'i1',date:today(),time:'08:05',type:'Базальный',units:5},{id:'i2',date:today(),time:'08:10',type:'Болюс',units:4,meal:'Завтрак'},{id:'i3',date:today(),time:'13:05',type:'Болюс',units:6,meal:'Обед'}];
db.labs=[{id:'l1',type:'hba1c',name:'HbA1c',date:'2026-08-20',value:6.4,unit:'%'},{id:'l2',type:'cpep',name:'С-пептид',date:'2026-01-20',value:0.48,unit:'нг/мл'},{id:'l3',type:'vitd',name:'Витамин D',date:'2026-09-01',value:28,unit:'нг/мл'}];
db.dayNotes={};db.dayNotes[today()]={text:'Футбол после школы',tags:['Спорт'],at:new Date().toISOString()};
save()})()"""
import json,time,random,math
now=int(time.time()*1000);RD=[];g=7.0
for i in range(14*288):
    t=now-(14*288-i)*300000;h=time.localtime(t/1000).tm_hour
    up=0.25 if h in (8,9,13,14,19,20) else -0.05
    g=max(3.7,min(13.2,g+up*(random.random()+0.3)+(random.random()-0.5)*0.35+(7.2-g)*0.03));RD.append({'t':t,'g':round(g,1),'d':'Flat'})
def stub(pg):
    pg.route('http://127.0.0.1:1/**',lambda route: route.fulfill(status=200,content_type='application/json',body='{"members":[{"id":"1","displayName":"Тимур","role":"patient","roleLabel":"Пациент","email":"timur@example.com"},{"id":"2","displayName":"Мама","role":"guardian","roleLabel":"Родитель","email":"mama@example.com"},{"id":"3","displayName":"Папа","role":"guardian","roleLabel":"Родитель","email":"demo@example.com","me":true},{"id":"4","displayName":"Бабушка","role":"viewer","roleLabel":"Только просмотр","email":"babushka@example.com"}],"readings":[],"changes":[],"cursor":0}'))
    pg.route(lambda u:'/cgm' in u and '127.0.0.1:1' in u,lambda route: route.fulfill(status=200,content_type='application/json',body=json.dumps({'readings':RD,'connected':True,'device':'LinX'})))
with sync_playwright() as p:
    b=p.chromium.launch();pg=b.new_page(viewport={'width':390,'height':844},device_scale_factor=2);stub(pg)
    pg.goto(f'http://127.0.0.1:{port}/index.html');pg.wait_for_timeout(1000);pg.evaluate(SETUP);pg.evaluate("localStorage.setItem('dm-disclaimer-v1','1')");pg.reload();pg.wait_for_timeout(2500)
    def shot(name,js=None,sel=None,dy=0):
        if js:pg.evaluate(js)
        pg.wait_for_timeout(700)
        if sel:
            pg.evaluate(f"document.querySelector('{sel}').scrollIntoView({{block:'start'}})");pg.evaluate(f"window.scrollBy(0,{dy})")
        else:pg.evaluate("window.scrollTo(0,0)")
        pg.wait_for_timeout(300);pg.screenshot(path=f'/home/claude/deck/shots/{name}.png')
    shot('01_home',"show('dashboard');DMCgm.paint&&DMCgm.paint()")
    shot('02_home2',None,'.dashMini',-150)
    shot('03_note',None,'#dayNoteCard',-170)
    pg.evaluate("DMCgm.paint()");pg.wait_for_timeout(3000);shot('04_kpi',None,'#dashKpi',-200)
    shot('05_menu',"show('menu');pickMeal('Обед')")
    shot('06_calc',"openInsulinForMeal('Обед');modalG.value='9.2';calculateModalInsulin();document.querySelector('#insModal .insBox, #insModal>div')?.scrollTo?.(0,0)")
    pg.evaluate("closeInsulinModal()")
    shot('07_foods',"show('foods')")
    shot('08_insight',"show('dayinsight')",'#dayChart',-250)
    shot('09_report',"show('reports');generateDoctorReport()",'#doctorReport',-150)
    shot('10_family',"show('account')",'#s2Members',-120)
    shot('11_photo',"show('photo')")
    shot('12_labs',"show('labs')")
    shot('13_medical',"show('medical')")
    b.close()
srv.shutdown()
