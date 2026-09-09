import sys, csv, math; sys.path.insert(0,'.')
from lfo import *
ORD={t:i for i,t in enumerate(TYPES)}
FREQ_N=0.36
PID='12'
PLAN=[('SINE',0.5),('TRIANGLE',0.5),('TRIANGLE',0.242),('SAW DOWN',0.5),
      ('SAW DOWN',0.242),('EXP',0.242),('LOG',0.242),('TRAPEZOID',0.242)]
def configure(typ,beta_n):
    setp(2,LFO1['TYPE'],ORD[typ],continuous=False)
    for pid,v in ((LFO1['FREQ'],FREQ_N),(LFO1['DEPTH'],1.0),(LFO1['PHASE'],0.0),
                  (LFO1['BETA'],beta_n),(LFO1['HICUT'],1.0),(LFO1['DUTY'],0.5)):
        setp(2,pid,v)
    time.sleep(0.5)
for typ,beta in PLAN:
    configure(typ,beta)
    rows=sample(110,[11,12],6.0)
    ts=[r[0] for r in rows]; vs=[r[1].get(PID,0) for r in rows]
    f,_=dominant(ts,vs,0.2,3.0)
    tag=f"{typ.replace(' ','_')}_b{int(beta*1000)}"
    with open(f'cap_{tag}.csv','w',newline='') as fh:
        w=csv.writer(fh); w.writerow(['t','v'])
        for t,d in rows: w.writerow([f'{t:.5f}', d.get(PID,'')])
    print(f'{typ:10} beta={beta:<6} n={len(vs):5} f={f:.3f}Hz  p-p={max(vs)-min(vs):.5f}  -> cap_{tag}.csv')
print('DONE')
