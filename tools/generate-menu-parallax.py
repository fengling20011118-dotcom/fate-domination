from pathlib import Path
import cv2
import numpy as np

ROOT = Path(r'E:\Codex\FD\Fate_Domination-重构版')
src_path = ROOT / 'assets' / 'map' / 'map-original.png'
out_dir = ROOT / 'assets' / 'menu' / 'parallax'
out_dir.mkdir(parents=True, exist_ok=True)

img = cv2.imdecode(np.fromfile(str(src_path), dtype=np.uint8), cv2.IMREAD_COLOR)
if img is None: raise SystemExit('cannot read source image')
h,w = img.shape[:2]

def grab(probable_polys, hard_polys=(), hard_rects=(), iterations=8):
    mask=np.full((h,w),cv2.GC_BGD,np.uint8)
    for p in probable_polys:
        cv2.fillPoly(mask,[np.array(p,np.int32)],cv2.GC_PR_FGD)
    for p in hard_polys:
        cv2.fillPoly(mask,[np.array(p,np.int32)],cv2.GC_FGD)
    for x,y,rw,rh in hard_rects:
        cv2.rectangle(mask,(x,y),(x+rw,y+rh),cv2.GC_FGD,-1)
    bgd=np.zeros((1,65),np.float64); fgd=np.zeros((1,65),np.float64)
    cv2.grabCut(img,mask,None,bgd,fgd,iterations,cv2.GC_INIT_WITH_MASK)
    out=np.where((mask==cv2.GC_FGD)|(mask==cv2.GC_PR_FGD),255,0).astype(np.uint8)
    # keep medium/large connected pieces; figure accessories may be detached.
    n,labels,stats,_=cv2.connectedComponentsWithStats((out>0).astype(np.uint8),8)
    clean=np.zeros_like(out)
    for i in range(1,n):
        if stats[i,cv2.CC_STAT_AREA]>=220:
            clean[labels==i]=255
    clean=cv2.morphologyEx(clean,cv2.MORPH_CLOSE,np.ones((5,5),np.uint8),iterations=1)
    clean=cv2.GaussianBlur(clean,(0,0),1.1)
    return clean

main=grab(
    probable_polys=[[
        (770,55),(965,70),(1085,165),(1175,285),(1235,410),(1325,615),
        (1265,805),(1180,970),(1080,1115),(900,1190),(720,1125),(650,1000),
        (600,855),(635,720),(585,585),(630,445),(665,330),(710,205)
    ]],
    hard_polys=[
        [(800,170),(950,130),(1080,230),(1150,450),(1110,760),(1010,1050),(825,1060),(720,850),(700,520)],
        [(625,520),(730,360),(1000,330),(1190,520),(1220,720),(1080,900),(800,820),(690,690)]
    ],
    hard_rects=[(800,230,135,470),(790,720,190,310)]
)

right=grab(
    probable_polys=[[
        (1375,90),(1560,105),(1675,210),(1775,330),(1760,475),(1680,565),
        (1660,760),(1575,930),(1450,995),(1355,865),(1330,700),(1280,575),
        (1225,445),(1270,290)
    ]],
    hard_polys=[
        [(1410,175),(1540,155),(1645,270),(1650,520),(1585,790),(1470,900),(1380,760),(1360,420)],
        [(1260,300),(1450,190),(1690,290),(1695,430),(1500,455),(1320,500)]
    ],
    hard_rects=[(1430,250,110,430)]
)

left=grab(
    probable_polys=[[
        (250,555),(390,500),(520,510),(615,625),(605,790),(545,865),(535,1005),
        (420,1060),(325,995),(300,880),(190,830),(185,660)
    ]],
    hard_polys=[
        [(285,610),(410,545),(525,600),(565,730),(500,830),(350,830),(235,760)],
        [(410,575),(480,590),(525,720),(500,930),(420,990),(375,840),(380,680)]
    ],
    hard_rects=[(400,620,70,260)]
)

# Remove cross-layer overlap after feather threshold.
main_h=cv2.threshold(main,185,255,cv2.THRESH_BINARY)[1]
right=cv2.bitwise_and(right,cv2.bitwise_not(main_h))
left=cv2.bitwise_and(left,cv2.bitwise_not(main_h))
combined=cv2.max(main,cv2.max(right,left))

inpaint_mask=cv2.dilate(cv2.threshold(combined,42,255,cv2.THRESH_BINARY)[1],np.ones((13,13),np.uint8),iterations=2)
sky=cv2.inpaint(img,inpaint_mask,8,cv2.INPAINT_TELEA)
sky=cv2.GaussianBlur(sky,(0,0),0.8)

def png_to(path,arr,compression=6):
    ok,buf=cv2.imencode('.png',arr,[cv2.IMWRITE_PNG_COMPRESSION,compression])
    if not ok: raise RuntimeError(path)
    buf.tofile(str(path))
def jpg_to(path,arr):
    ok,buf=cv2.imencode('.jpg',arr,[cv2.IMWRITE_JPEG_QUALITY,88])
    if not ok: raise RuntimeError(path)
    buf.tofile(str(path))
def save_layer(name,alpha):
    rgba=cv2.cvtColor(img,cv2.COLOR_BGR2BGRA); rgba[:,:,3]=alpha
    png_to(out_dir/name,rgba)

png_to(out_dir/'sky-plate.png',sky,5)
save_layer('hero-main.png',main); save_layer('hero-right.png',right); save_layer('hero-left.png',left)

diag=img.astype(np.float32)
for alpha,color in zip((main,right,left),((60,80,255),(80,230,100),(255,150,50))):
    a=(alpha.astype(np.float32)/255.0*.45)[:,:,None]; c=np.full_like(diag,color,dtype=np.float32); diag=diag*(1-a)+c*a
jpg_to(out_dir/'mask-preview.jpg',np.clip(diag,0,255).astype(np.uint8))
for name,alpha in [('main',main),('right',right),('left',left)]:
    ys,xs=np.where(alpha>32); area=len(xs); bbox=(int(xs.min()),int(ys.min()),int(xs.max()),int(ys.max())) if area else None
    print(f'{name}: pixels={area} ({area/(w*h):.1%}) bbox={bbox}')
print('combined:',np.count_nonzero(combined>32)/(w*h))
