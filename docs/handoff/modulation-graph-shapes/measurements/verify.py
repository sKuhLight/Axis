import math, json
D=json.load(open('hwcurves.json')); NB=200
def ramp(u,k): return u if abs(k)<1e-6 else math.expm1(k*u)/math.expm1(k)
def tri(p,s): return -1+2*p/s if p<s else 1-2*(p-s)/(1-s)
EXP_K, LOG_K = 1.45, -1.35
def old(n,p,s):
    if n=='sine': return math.sin(p*2*math.pi)
    t=tri(p,s)
    if n=='triangle': return t
    if n=='saw up': return 2*ramp(p,3.09)-1
    if n=='saw down': return -(2*ramp(p,3.09)-1)
    if n=='log': return 2*math.log10(1+9*((t+1)/2))-1
    if n=='exp':
        m=tri(p,1-s); return (2*(math.pow(10,(m+1)/2)-1))/9-1
    if n=='trapezoid': return max(-1,min(1,t*2))
def new(n,p,s):
    k=(1-s)/s
    if n=='sine': return math.sin(p*2*math.pi)
    t=tri(p,s)
    if n=='triangle': return t
    if n=='saw down': return 1-2*ramp(p,k)
    if n=='saw up':   return 2*ramp(p,-k)-1
    if n=='log': return 2*ramp((t+1)/2,LOG_K)-1
    if n=='exp': return 2*ramp((tri(p,1-s)+1)/2,EXP_K)-1
    if n=='trapezoid': return max(-1,min(1,t*2))
def rms(name,f):
    hw=D[name]['hw']; s=D[name]['shape']; t=D[name]['type'].lower()
    best=1e9
    for sh in range(NB):
        e=sum((hw[(i+sh)%NB]-f(t,i/NB,s))**2 for i in range(NB))
        best=min(best,e)
    return math.sqrt(best/NB)
print(f"{'capture':18} {'OLD':>7} {'NEW':>7}   change")
tot_o=tot_n=0
for name in sorted(D):
    o,n2=rms(name,old),rms(name,new)
    tot_o+=o; tot_n+=n2
    mark='  ->' + ('  better' if n2<o-0.005 else ('  worse' if n2>o+0.005 else '  same'))
    print(f'{name:18} {o:7.3f} {n2:7.3f}{mark}')
print(f"{'MEAN':18} {tot_o/len(D):7.3f} {tot_n/len(D):7.3f}")
