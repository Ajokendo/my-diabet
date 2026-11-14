import json,subprocess,base64,os
from playwright.sync_api import sync_playwright
root='/home/claude/my-diabet'
G=json.loads(subprocess.check_output(['node','-e',"global.window={};require('"+root+"/js/guide.js');console.log(JSON.stringify(window.DMGuide.G))"]))
def img(n):
    from PIL import Image;import io
    im=Image.open(f'/home/claude/guide/shots/{n}.png').convert('RGB');im=im.resize((470,int(im.height*470/im.width)),Image.LANCZOS)
    b=io.BytesIO();im.save(b,'JPEG',quality=82);return 'data:image/jpeg;base64,'+base64.b64encode(b.getvalue()).decode()
logo=open(root+'/assets/icons/icon-192.png','rb').read()
COPY='© 2026 Азамат Орозобеков (Azamat Orozobekov). Все права защищены.'
toc=''.join(f'<li><b>{g}</b><ol>'+''.join(f'<li>{t[1]}</li>' for t in items)+'</ol></li>' for g,items in G)
body=''
n=0
for g,items in G:
    body+=f'<h2>{g}</h2>'
    for id_,title,imgs,steps in items:
        n+=1
        body+=f'<section class="t"><h3>{n}. {title}</h3><ol>'+''.join(f'<li>{s}</li>' for s in steps)+'</ol>'
        if imgs:body+='<div class="imgs">'+''.join(f'<img src="{img(i)}">' for i in imgs)+'</div>'
        body+='</section>'
html=f'''<!doctype html><html lang="ru"><head><meta charset="utf-8"><style>
@page{{size:A4;margin:16mm 14mm 18mm}}
body{{font-family:Inter,"Segoe UI",Arial,sans-serif;color:#17232d;font-size:11.5pt;line-height:1.5}}
.cover{{height:250mm;display:flex;flex-direction:column;justify-content:center;align-items:flex-start;gap:14px;page-break-after:always}}
.cover img{{width:90px;border-radius:22px}}.cover h1{{font-size:34pt;margin:0;color:#103b3a}}.cover p{{font-size:14pt;color:#4e626c;margin:0}}
.toc{{page-break-after:always}}.toc ol{{margin:4px 0 10px}}.toc>ol>li{{margin-top:8px}}
h2{{color:#0f766e;font-size:18pt;border-bottom:2px solid #99f6e4;padding-bottom:4px;margin:18px 0 8px;page-break-after:avoid}}
.t{{margin:0 0 14px}}.t h3{{page-break-after:avoid}}.imgs{{page-break-inside:avoid}}h3{{font-size:13pt;margin:10px 0 4px;color:#103b3a}}
.t ol{{margin:0;padding-left:20px}}.t li{{margin:2px 0}}
.imgs{{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px}}.imgs img{{width:41mm;border:1px solid #dfe9e7;border-radius:8px}}
.foot{{margin-top:24px;font-size:9pt;color:#667782;border-top:1px solid #dfe9e7;padding-top:8px}}
</style></head><body>
<div class="cover"><img src="data:image/png;base64,{base64.b64encode(logo).decode()}"><h1>Мой диабет</h1><p>Инструкция пользователя</p><p>Приложение для семьи ребёнка с диабетом 1 типа · my-diabet.pages.dev</p><p style="font-size:11pt;margin-top:30px">Скриншоты сделаны на демонстрационных данных.</p><p style="font-size:10pt">{COPY}</p></div>
<div class="toc"><h2>Содержание</h2><ol>{toc}</ol></div>
{body}
<div class="foot">Приложение — помощник для самоконтроля, а не медицинское изделие. Дозы инсулина и коэффициенты назначает лечащий врач.<br>{COPY}</div>
</body></html>'''
open('/home/claude/guide/guide.html','w').write(html)
with sync_playwright() as p:
    b=p.chromium.launch();pg=b.new_page();pg.set_content(html,wait_until='load');pg.wait_for_timeout(500)
    pg.pdf(path=root+'/assets/guide/my-diabet-guide.pdf',format='A4',print_background=True,display_header_footer=True,header_template='<span></span>',
      footer_template='<div style="width:100%;font-size:8px;color:#94a3b8;padding:0 14mm;display:flex;justify-content:space-between"><span>Мой диабет — инструкция · © 2026 Азамат Орозобеков</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>',margin={'top':'16mm','bottom':'18mm','left':'14mm','right':'14mm'})
    b.close()
print(os.path.getsize(root+'/assets/guide/my-diabet-guide.pdf')//1024,'KB')
