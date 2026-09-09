"""Where in its cycle does an LFO start? Stop it, restart it, and sample from that instant.

Folding a free-running capture recovers the shape but not the absolute phase. RUN=STOP holds
LFO 1; setting RUN back to RUN restarts it at its start phase, which gives the time reference
folding cannot. Answer, at LFO Phase 0: the output leaves the TROUGH, for sine and triangle
alike. Restores every value it writes; never stores the preset.
"""
import sys, csv, math; sys.path.insert(0,'.')
from lfo import *
ORD={t:i for i,t in enumerate(TYPES)}
FN=(math.log(0.1)-math.log(0.05))/(math.log(30)-math.log(0.05))
PLAN=[('TRIANGLE',0.242),('SINE',0.242),('SINE',0.5)]
WATCH=['TYPE','FREQ','DEPTH','DUTY','PHASE','BETA','HICUT','RUN']
ENUM=('TYPE','RUN')
CH='.:-=+*#%@'

def block():
    d=req('/preset/blocks/2/params')
    return {**{p['id']:p for p in d['named']}, **{p['id']:p for p in d['enums']}}

by=block()
orig={n:{'norm':by[LFO1[n]].get('norm'),'value':by[LFO1[n]].get('value')} for n in WATCH}
print('preset:',req('/preset'),'\noriginals:',orig, flush=True)
try:
    for typ,beta in PLAN:
        setp(2,LFO1['TYPE'],ORD[typ],continuous=False)
        for pid,v in ((LFO1['FREQ'],FN),(LFO1['DEPTH'],1.0),(LFO1['PHASE'],0.0),
                      (LFO1['BETA'],beta),(LFO1['HICUT'],1.0),(LFO1['DUTY'],0.5)):
            setp(2,pid,v)
        setp(2,LFO1['RUN'],1,continuous=False)   # STOP
        time.sleep(1.0)
        a=time.time(); setp(2,LFO1['RUN'],0,continuous=False); b=time.time()   # RUN
        rows=sample(110,[12],11.0)
        ts=[r[0]+b-a for r in rows]; vs=[r[1].get('12',0) for r in rows]
        lo,hi=min(vs),max(vs); ys=[2*(v-lo)/(hi-lo)-1 for v in vs]
        nb=60; bins=[[] for _ in range(nb)]
        for t,y in zip(ts,ys):
            if 0<=t<10.0: bins[int(t/10.0*nb)].append(y)
        r=[sum(x)/len(x) if x else None for x in bins]
        line=''.join(CH[min(8,max(0,int((y+1)/2*8.99)))] if y is not None else ' ' for y in r)
        ok=[(i,y) for i,y in enumerate(r) if y is not None]
        pk=max(ok,key=lambda x:x[1])[0]/nb; tr=min(ok,key=lambda x:x[1])[0]/nb
        print(f'{typ:9} beta={beta:<6} v@t0={r[0]:+.2f} {line} crest@{pk:.2f} trough@{tr:.2f}', flush=True)
finally:
    for n in ENUM: setp(2,LFO1[n],int(orig[n]['value']),continuous=False)
    for n in WATCH:
        if n not in ENUM: setp(2,LFO1[n],orig[n]['norm'])
    time.sleep(0.4); ab=block()
    for n in WATCH:
        want=orig[n]['value'] if n in ENUM else orig[n]['norm']
        got=ab[LFO1[n]].get('value') if n in ENUM else ab[LFO1[n]].get('norm')
        same=want==got or (isinstance(want,float) and isinstance(got,float) and abs(want-got)<2e-3)
        print(f'restore {n:6} want={want} got={got} {"OK" if same else "MISMATCH"}', flush=True)
print('DONE')
