import json,os
HERE=os.path.dirname(os.path.abspath(__file__));ROOT=os.path.dirname(os.path.dirname(HERE))
D={}
for f in ['d1','d2','d3','d4','d5']:
  ns={};exec(open(f'{HERE}/{f}.py').read(),ns);D.update({k.strip():v for k,v in ns['D'].items()})
D.update({"срок вышел":"мөөнөтү бүттү","заменить сегодня":"бүгүн алмаштыруу","заменить завтра":"эртең алмаштыруу"})
for f in sorted(os.listdir(HERE)):
  if f.startswith('h') and f.endswith('.py'):
    ns={};exec(open(HERE+'/'+f).read(),ns);D.update({k.strip():v for k,v in ns['D'].items()})
s="/* v64.58: кыргызча котормо — кошумча сөздүк (машиналык котормо, носитель текшериши керек). */\nwindow.DM_KY_EXTRA="+json.dumps(D,ensure_ascii=False,indent=0)+";\n"
open(ROOT+'/js/i18n-ky.js','w').write(s); print(len(D))
