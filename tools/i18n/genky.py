import json
D={}
for f in ['d1','d2','d3','d4','d5']:
  ns={};exec(open(f'/home/claude/ky/{f}.py').read(),ns);D.update({k.strip():v for k,v in ns['D'].items()})
D.update({"срок вышел":"мөөнөтү бүттү","заменить сегодня":"бүгүн алмаштыруу","заменить завтра":"эртең алмаштыруу"})
import os
for f in sorted(os.listdir('/home/claude/ky')):
  if f.startswith('h') and f.endswith('.py'):
    ns={};exec(open('/home/claude/ky/'+f).read(),ns);D.update({k.strip():v for k,v in ns['D'].items()})
s="/* v64.58: кыргызча котормо — кошумча сөздүк (машиналык котормо, носитель текшериши керек). */\nwindow.DM_KY_EXTRA="+json.dumps(D,ensure_ascii=False,indent=0)+";\n"
open('/home/claude/my-diabet/js/i18n-ky.js','w').write(s); print(len(D))
