import sys, csv, math; sys.path.insert(0,'.')
from lfo import *
ORD={t:i for i,t in enumerate(TYPES)}
FN=(math.log(0.1)-math.log(0.05))/(math.log(30)-math.log(0.05))
PLAN=[('SINE',0.5),('TRIANGLE',0.5),('TRIANGLE',0.242),
      ('SAW DOWN',0.5),('SAW DOWN',0.242),('SAW UP',0.242),
      ('EXP',0.5),('EXP',0.242),('LOG',0.5),('LOG',0.242),
      ('TRAPEZOID',0.5),('TRAPEZOID',0.242)]
for typ,beta in PLAN:
    setp(2,LFO1['TYPE'],ORD[typ],continuous=False)
    for pid,v in ((LFO1['FREQ'],FN),(LFO1['DEPTH'],1.0),(LFO1['PHASE'],0.0),
                  (LFO1['BETA'],beta),(LFO1['HICUT'],1.0),(LFO1['DUTY'],0.5)):
        setp(2,pid,v)
    time.sleep(0.6)
    rows=sample(110,[12],21.0)
    tag=f"{typ.replace(' ','_')}_b{int(beta*1000)}"
    with open(f'hw_{tag}.csv','w',newline='') as fh:
        w=csv.writer(fh); w.writerow(['t','v'])
        for t,d in rows: w.writerow([f'{t:.5f}', d.get('12','')])
    vs=[r[1].get('12',0) for r in rows]
    print(f'{typ:10} beta={beta:<6} n={len(vs):5} p-p={max(vs)-min(vs):.5f} -> hw_{tag}.csv', flush=True)
print('SWEEP DONE')
