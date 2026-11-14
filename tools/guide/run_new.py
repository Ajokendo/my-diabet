exec(open('/home/claude/guide/shoot.py').read())
M={'width':390,'height':844}
sv=lambda sel,off=-70:f"(()=>{{const e=document.querySelector('{sel}');if(e){{e.scrollIntoView();window.scrollBy(0,{off})}}}})()"
CARE="""(()=>{const now=Date.now();db.care={name:'Тимур',birth:'10 лет',contacts:[{name:'Мама',phone:'+996 555 000 001'},{name:'Папа',phone:'+996 555 000 002'}],glucagon:'в рюкзаке, передний карман',allergy:'нет',doctor:'',school:{cls:'4 «Б»',teacher:'Айгуль Маратовна',notes:'перекус на 2-й перемене'},
sites:[{t:now-80*36e5,z:'bellyL',k:'короткий'},{t:now-50*36e5,z:'thighL',k:'длинный'},{t:now-26*36e5,z:'bellyR',k:'короткий'},{t:now-4*36e5,z:'armR',k:'короткий'}]};save();try{localStorage.setItem('dm-backup-at',String(now-3*864e5))}catch(e){}})()"""
MOCK="window.SpeechRecognition=window.webkitSpeechRecognition=function(){const r=this;this.start=()=>setTimeout(()=>r.onresult({results:[[{transcript:'четверть лепёшки, сто граммов плова и пиала чая'}]]}),60);this.abort=()=>{}};"
with sync_playwright() as p:
    b=p.chromium.launch()
    # подставляем голос до загрузки страниц
    _np=b.new_page
    def np2(**k):
        pg=_np(**k);pg.add_init_script(MOCK);return pg
    b.new_page=np2
    pg=page(b,M)
    S=lambda *a,**k:shot(pg,*a,**k)
    pg.evaluate(CARE)
    S('36-sos-chip',"show('dashboard');scrollTo(0,0)",900,sel=None)
    S('37-sos',"DMCare.sos()",500)
    pg.evaluate("DMCare.closeSos()")
    S('38-care',"show('care');scrollTo(0,0)",700)
    S('39-care-data',sv('#careBody .card.s6'),400)
    S('40-school',"DMCare.previewSchool();"+sv('#schoolPreview',-90),600)
    S('41-sites',sv('#careSites',-70),500)
    S('42-backup',sv('#careBackup',-70),400)
    S('43-voice',"show('menu');DMAddFood.open('Обед');DMVoice.start()",900)
    pg.evaluate("DMAddFood.close()")
    S('44-ky',"localStorage.setItem('dm-lang','ky');DMI18N.set('ky');show('dashboard');scrollTo(0,0);toggleNavSheet(true)",900)
    pg.evaluate("toggleNavSheet(false);localStorage.setItem('dm-lang','ru');location.reload()");pg.wait_for_timeout(2000)
    S('45-ownserver',"db.cloud2={};show('account');setTimeout(()=>{const d=document.getElementById('s2OwnSrv');d.open=true;d.scrollIntoView();scrollBy(0,-80)},400)",1200)
    b.close()
srv.shutdown()
