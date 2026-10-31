# Reads named members from one public tar by HTTP Range, using a binary search on the sorted member names.
# It fetches a few megabytes in place of the whole archive, which is lighter on the server than streaming it.
import sys,urllib.request,gzip,os,re,time
url,out,*want=sys.argv[1:]
def get(a,b):
    r=urllib.request.Request(url,headers={'Range':f'bytes={a}-{b}'})
    with urllib.request.urlopen(r,timeout=120) as f: return f.read()
head=urllib.request.urlopen(urllib.request.Request(url,method='HEAD'),timeout=60)
size=int(head.headers['Content-Length'])
def header_at(data,base):
    # first valid ustar header in data; base is the file offset of data[0], 512-aligned
    for k in range(0,len(data)-512,512):
        b=data[k:k+512]
        if b[257:262]==b'ustar':
            name=b[:100].split(b'\0')[0].decode('latin1')
            sz=int(b[124:136].split(b'\0')[0].strip() or b'0',8)
            return base+k,name,sz
    return None
def probe(off):
    off-=off%512
    return header_at(get(off,off+768*1024-1),off)
def header_exact(off):
    b=get(off,off+511)
    if b[257:262]!=b'ustar': return None
    return off,b[:100].split(b'\0')[0].decode('latin1'),int(b[124:136].split(b'\0')[0].strip() or b'0',8)
def key(n): return n
def find(acc):
    target=f'AF-{acc}-F1-model'
    lo,hi=0,size
    while hi-lo>1200*1024:
        mid=(lo+hi)//2
        h=probe(mid)
        if h is None: hi=mid; continue
        if h[1]<target: lo=h[0]
        else: hi=mid
    # scan forward member by member
    first=probe(lo)
    off=first[0] if first else lo
    for _ in range(4000):
        h=header_exact(off)
        if h is None: return None
        o,n,s=h
        if n.startswith(target) and n.endswith('.pdb.gz'):
            data=get(o+512,o+512+s-1)
            return n,gzip.decompress(data)
        if n>target+'~': return None
        off=o+512+((s+511)//512)*512
    return None
print('size',size,flush=True)
for a in want:
    r=find(a)
    if r:
        open(os.path.join(out,a+'.pdb'),'wb').write(r[1]);print('got',r[0],len(r[1]),flush=True)
    else: print('not found',a,flush=True)
