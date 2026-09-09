import json, time, urllib.request, math
BASE='http://127.0.0.1:5056'
def req(path, body=None, method='GET'):
    data=json.dumps(body).encode() if body is not None else None
    r=urllib.request.Request(BASE+path, data=data,
        headers={'content-type':'application/json'} if data else {}, method=method)
    return json.load(urllib.request.urlopen(r, timeout=15))
def setp(eid,pid,value,continuous=True):
    return req(f'/preset/blocks/{eid}/params/{pid}', {'value':value,'continuous':continuous}, 'PUT')
def readrange(eid,pids):
    return req(f'/preset/blocks/{eid}/readrange', {'pids':pids}, 'POST')
def sample(eid,pids,seconds,max_hz=400):
    out=[]; t0=time.time(); gap=1.0/max_hz
    nxt=t0
    while time.time()-t0 < seconds:
        now=time.time()
        if now<nxt: continue
        nxt=now+gap
        try: d=readrange(eid,pids)
        except Exception: continue
        out.append((time.time()-t0, d))
    return out
def dominant(ts,vs,flo=0.1,fhi=8.0,step=0.005):
    n=len(vs); mean=sum(vs)/n; vc=[v-mean for v in vs]
    best=(0,0)
    f=flo
    while f<=fhi:
        re=sum(v*math.cos(2*math.pi*f*t) for v,t in zip(vc,ts))
        im=sum(v*math.sin(2*math.pi*f*t) for v,t in zip(vc,ts))
        m=math.hypot(re,im)/n
        if m>best[0]: best=(m,f)
        f+=step
    return best[1],best[0]
LFO1={'TYPE':0,'FREQ':1,'DEPTH':2,'DUTY':3,'PHASE':4,'BETA':119,'HICUT':121,'TEMPO':5,'RUN':70,'QUANTIZE':104}
TYPES=['SINE','TRIANGLE','SQUARE','SAW UP','SAW DOWN','RANDOM','LOG','EXP','TRAPEZOID','ASTABLE']
