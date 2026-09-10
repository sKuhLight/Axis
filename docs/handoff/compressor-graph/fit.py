import json,math
S='./'
d=json.load(open('curves.json'))
ks=('00','02','04','06','08','10'); comp={'00':0,'02':2,'04':4,'06':6,'08':8,'10':10}
def softplus(z,k):
    kz=k*z
    if kz>40: return z
    if kz<-40: return math.exp(kz)/k
    return math.log1p(math.exp(kz))/k
def y_of(x,G,T,k): u=x+G; return u-softplus(u-T,k)
def fit(pts,k):
    p=[0.15,0.62]; step=[0.05,0.05]
    def e(q): return sum((y_of(x,q[0],q[1],k)-y)**2 for x,y in pts)
    while max(step)>1e-7:
        imp=False
        for i in (0,1):
            for s in (1,-1):
                q=p[:]; q[i]+=s*step[i]
                if e(q)<e(p): p=q; imp=True
        if not imp: step=[t/2 for t in step]
    return e(p),p
best=None
for k in [8+0.5*i for i in range(20)]:
    tot=0;n=0
    for kk in ks:
        v,_=fit(d[kk]['pts'],k); tot+=v; n+=len(d[kk]['pts'])
    r=(tot/n)**0.5
    if best is None or r<best[0]: best=(r,k)
r,K=best
print(f'shared knee k={K}, pure limiter (ratio inf), per-curve G and ceiling T')
print(f'overall rms {r:.5f} = {r*344:.2f} px\n')
print('   c        G          T       rms      px')
tab={}
for kk in ks:
    v,p=fit(d[kk]['pts'],K); rr=(v/len(d[kk]['pts']))**0.5
    tab[comp[kk]]=p
    print(f"  {comp[kk]:2d}    {p[0]:.4f}    {p[1]:.4f}   {rr:.5f}   {rr*344:.2f}")
# check the log law for G
print('\nG(c) = a*ln(1+b*c) check:')
bestg=None
for a in [0.06+0.0005*i for i in range(120)]:
    for b in [1.0+0.02*i for i in range(150)]:
        e=sum((a*math.log(1+b*c)-G)**2 for c,(G,T) in tab.items())
        if bestg is None or e<bestg[0]: bestg=(e,a,b)
e,a,b=bestg
print(f'  a={a:.4f} b={b:.3f}  max err {max(abs(a*math.log(1+b*c)-G) for c,(G,T) in tab.items()):.5f} ({max(abs(a*math.log(1+b*c)-G) for c,(G,T) in tab.items())*344:.2f} px)')
for c,(G,T) in sorted(tab.items()): print(f'   c={c:2d}  G_meas={G:.4f}  G_law={a*math.log(1+b*c):.4f}')
json.dump({'k':K,'table':{str(c):v for c,v in tab.items()},'G_law':{'a':a,'b':b}},open('final_fit.json','w'))
