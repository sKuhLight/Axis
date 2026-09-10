import sys,json
sys.path.insert(0,'/private/tmp/claude-501/-Users-pablo-code-Axis-Axis/7f881490-d6da-46fa-ac32-42c87e64c987/scratchpad')
from png import read_png,pix
CURVE=(53,206,252)
def digitize(f):
    w,h,ch,px=read_png(f)
    def grey(x,y):
        r,g,b=pix(px,ch,w,x,y); return r if (r==g==b) else None
    cm={}; rm={}
    for x in range(w):
        v=[grey(x,y) for y in range(h)]; v=[t for t in v if t is not None and t>=20]
        cm[x]=(len(v), sum(v)/len(v) if v else 0)
    for y in range(h):
        v=[grey(x,y) for x in range(w)]; v=[t for t in v if t is not None and t>=20]
        rm[y]=(len(v), sum(v)/len(v) if v else 0)
    cols=[x for x in cm if cm[x][0]>h*0.4 and cm[x][1]>30]
    rows=[y for y in rm if rm[y][0]>w*0.4 and rm[y][1]>30]
    x0,x1,y0,y1=min(cols),max(cols),min(rows),max(rows)
    pts=[]
    for x in range(x0,x1+1):
        ys=[y for y in range(y0,y1+1) if pix(px,ch,w,x,y)==CURVE]
        if ys: pts.append(((x-x0)/(x1-x0), 1-((sum(ys)/len(ys))-y0)/(y1-y0)))
    orange=[(x,y) for y in range(y0,y1+1) for x in range(x0,x1+1)
            if (lambda p: p[0]>180 and 110<p[1]<210 and p[2]<90)(pix(px,ch,w,x,y))]
    mk=None
    if orange:
        mx=sum(o[0] for o in orange)/len(orange); my=sum(o[1] for o in orange)/len(orange)
        mk=((mx-x0)/(x1-x0), 1-(my-y0)/(y1-y0))
    return dict(box=(x0,y0,x1,y1),w=x1-x0,h=y1-y0,pts=pts,marker=mk)
if __name__=='__main__':
    out={}
    for c in ['00','02','04','06','08','10']:
        r=digitize(f'measurements/comp-{c}.png'); out[c]=r
        p=r['pts']
        print(f"comp-{c}: box {r['w']}x{r['h']}  pts={len(p)}  y@x=0:{p[0][1]:.3f}  y@x=.25:{[q for q in p if q[0]>=.25][0][1]:.3f}  y@x=.5:{[q for q in p if q[0]>=.5][0][1]:.3f}  y@x=.75:{[q for q in p if q[0]>=.75][0][1]:.3f}  y@x=1:{p[-1][1]:.3f}  marker={None if not r['marker'] else (round(r['marker'][0],3),round(r['marker'][1],3))}")
    json.dump(out,open('curves.json','w'))
