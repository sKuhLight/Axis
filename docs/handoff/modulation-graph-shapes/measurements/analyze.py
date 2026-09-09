import csv, glob, math
CH='.:-=+*#%@'
def load(p):
    r=list(csv.DictReader(open(p)))
    return [float(x['t']) for x in r],[float(x['v']) for x in r]
def best_period(ts,vs,plo=9.5,phi=10.5,nb=200):
    best=(1e18,None); P=plo
    while P<=phi:
        bins=[[] for _ in range(nb)]
        for t,v in zip(ts,vs): bins[int((t/P)%1*nb)].append(v)
        e=sum(sum((v-sum(b)/len(b))**2 for v in b) for b in bins if b)
        if e<best[0]: best=(e,P)
        P+=0.002
    return best[1]
def fold(ts,vs,P,nb):
    bins=[[] for _ in range(nb)]
    for t,v in zip(ts,vs): bins[int((t/P)%1*nb)].append(v)
    return [sum(b)/len(b) if b else None for b in bins]
def norm(ys):
    ok=[y for y in ys if y is not None]; lo,hi=min(ok),max(ok)
    return [None if y is None else 2*(y-lo)/(hi-lo)-1 for y in ys]
def rot_to_trough(ys):
    i=min(range(len(ys)),key=lambda i: ys[i]); return ys[i:]+ys[:i]
def row(ys,w=62): return ''.join(CH[min(8,max(0,int((ys[int(i*len(ys)/w)]+1)/2*8.99)))] for i in range(w))
def stats(ys):
    n=len(ys); pk=max(range(n),key=lambda i:ys[i])
    top=sum(1 for y in ys if y>0.9)/n; bot=sum(1 for y in ys if y<-0.9)/n
    return pk/n, top, bot
if __name__=='__main__':
    print('  (each row rotated so the trough sits at phase 0)\n')
    for f in sorted(glob.glob('hw_*.csv')):
        ts,vs=load(f); P=best_period(ts,vs)
        ys=rot_to_trough(norm(fold(ts,vs,P,200)))
        pk,top,bot=stats(ys)
        name=f[3:-4]
        print(f'{name:18} P={P:5.2f}s {row(ys)} crest@{pk:.2f} top={top*100:2.0f}% bot={bot*100:2.0f}%')
