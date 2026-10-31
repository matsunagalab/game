// GLSL for the gold world. Everything shares one gold-leaf tile and one large batik sheet.

export const FULL_VERT = /* glsl */`#version 300 es
in vec3 position; out vec2 vUv;
void main(){ vUv = position.xy*.5+.5; gl_Position = vec4(position.xy,0.,1.); }`;

// A tiling tile: R height of hammered leaf, G hairline cracks, B sheet of leaf, A cloth fibre.
export const LEAF_FRAG = /* glsl */`#version 300 es
precision highp float;
in vec2 vUv; out vec4 o;
vec2 h2(vec2 p,float per){ p=mod(p,per); return fract(sin(vec2(dot(p,vec2(127.1,311.7)),dot(p,vec2(269.5,183.3))))*43758.5453); }
float h1(vec2 p,float per){ return h2(p,per).x; }
float vn(vec2 p,float per){ vec2 i=floor(p),f=fract(p); f=f*f*(3.-2.*f);
  return mix(mix(h1(i,per),h1(i+vec2(1,0),per),f.x),mix(h1(i+vec2(0,1),per),h1(i+vec2(1,1),per),f.x),f.y); }
float fbm(vec2 p,float per){ float a=.5,s=0.; for(int i=0;i<6;i++){ s+=a*vn(p,per); p*=2.; per*=2.; a*=.5; } return s; }
float ridged(vec2 p,float per){ float a=.5,s=0.; for(int i=0;i<5;i++){ s+=a*(1.-abs(2.*vn(p,per)-1.)); p*=2.; per*=2.; a*=.5; } return s; }
float crack(vec2 p,float per){ // distance to Voronoi edges
  vec2 i=floor(p),f=fract(p); float d1=9.,d2=9.;
  for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){ vec2 g=vec2(x,y); vec2 r=g+h2(i+g,per)-f; float d=dot(r,r); if(d<d1){d2=d1;d1=d;}else if(d<d2)d2=d; }
  return sqrt(d2)-sqrt(d1); }
void main(){
  vec2 p=vUv;
  float warp=fbm(p*5.,5.);
  float wr=ridged(p*7.+warp*.8,7.);
  float h=.55*fbm(p*24.,24.)+.45*wr*wr;
  float c=crack(p*9.+vec2(warp,fbm(p*5.+3.1,5.))*1.1,9.);
  float c2=crack(p*23.+warp*2.,23.);
  float cr=smoothstep(.035,.0,c)*(.5+.5*smoothstep(.35,.7,fbm(p*6.+7.,6.)))+.55*smoothstep(.03,.0,c2)*smoothstep(.55,.72,fbm(p*4.+1.3,4.));
  // Squares of leaf laid by hand, overlapping a little.
  vec2 sq=p*6.+.14*vec2(sin(p.y*6.283*2.),sin(p.x*6.283*3.));
  float sheet=h1(floor(sq),6.);
  float edge=min(min(fract(sq.x),1.-fract(sq.x)),min(fract(sq.y),1.-fract(sq.y)));
  sheet=mix(sheet,.5,smoothstep(.0,.03,edge)*.0);
  float lap=smoothstep(.05,.0,edge);
  h+=lap*.12;
  // Warp and weft of the cloth.
  vec2 w=p*220.;
  float warpT=sin(w.x*6.283)*.5+.5, weftT=sin(w.y*6.283)*.5+.5;
  float cell=step(.5,fract(floor(w.x)*.5+floor(w.y)*.5));
  float fib=mix(warpT,weftT,cell)*.6+.4*fbm(p*vec2(60.,12.),60.);
  o=vec4(h,clamp(cr,0.,1.),sheet,fib);
}`;

// One sheet of batik, cut later into nine panels (three across, three down).
// R: the large figure, which only reads when the panels come together. G: each panel's own motif. B: fine dots.
export const BATIK_FRAG = /* glsl */`#version 300 es
precision highp float;
in vec2 vUv; out vec4 o;
#define PI 3.14159265
#define TAU 6.2831853
float aa(float d){ float w=fwidth(d)*.8; return smoothstep(w,-w,d); }
mat2 rot(float a){ float c=cos(a),s=sin(a); return mat2(c,-s,s,c); }
float line(float d,float w){ return abs(d)-w; }
float seg(vec2 p,vec2 a,vec2 b){ vec2 pa=p-a,ba=b-a; return length(pa-ba*clamp(dot(pa,ba)/dot(ba,ba),0.,1.)); }
float petal(vec2 p,float r,float th){ // vesica pointing along +y
  p=abs(p); float c=(r*r-th*th)/(2.*th); return length(p+vec2(c,0.))-(c+th); }

// Water: scales of cloud, in rows.
float mScales(vec2 p){ p*=vec2(6.,5.); float row=floor(p.y); p.x+=mod(row,2.)*.5; vec2 f=vec2(fract(p.x)-.5,fract(p.y));
  float d=9.; for(float k=0.;k<3.;k++) d=min(d,line(length(f-vec2(0.,-.1))-(.28+k*.22),.022));
  return d/6.; }
// Parang: a diagonal chain of blades, the cutters.
float mParang(vec2 p){ p=rot(.785)*p; p*=vec2(3.4,3.4); float b=floor(p.x); vec2 f=vec2(fract(p.x)-.5,p.y+mod(b,2.)*.5);
  float y=fract(f.y)-.5; float x=f.x+.18*sin(f.y*TAU);
  float d=line(abs(x)-.32,.022); d=min(d,line(length(vec2(x,y)*vec2(2.1,1.))-.26,.018));
  d=min(d,length(vec2(x,y))-.06); return d/3.4; }
// Kawung: four petals around a dot.
float mKawung(vec2 p){ p=rot(.785)*p*4.2; vec2 f=fract(p+.5)-.5; float d=9.;
  for(int i=0;i<4;i++){ vec2 q=rot(float(i)*PI*.5)*f; float e=petal(q-vec2(0.,.27),.27,.135); d=min(d,line(e,.012)); d=min(d,length(q-vec2(0.,.27))-.035);} 
  d=min(d,length(f)-.03); return d/4.2; }
// Ceplok: an eight-point flower in a square.
float mCeplok(vec2 p){ p*=3.2; vec2 f=fract(p)-.5; float a=atan(f.y,f.x),r=length(f);
  float d=line(r-(.30+.11*cos(a*8.)),.014); d=min(d,line(r-.11,.01)); d=min(d,line(max(abs(f.x),abs(f.y))-.47,.012));
  vec2 g=abs(f); d=min(d,line(g.x+g.y-.62,.012)); return d/3.2; }
// Truntum: small stars strewn on a dark field.
float mTruntum(vec2 p){ p*=5.2; float r0=floor(p.y); p.x+=mod(r0,2.)*.5; vec2 f=fract(p)-.5; float a=atan(f.y,f.x),r=length(f);
  float s=r-(.2+.1*pow(abs(cos(a*4.)),3.)); float d=line(s,.012); d=min(d,r-.05);
  for(int i=0;i<8;i++){ vec2 q=rot(float(i)*PI*.25)*f; d=min(d,length(q-vec2(0.,.36))-.018);} return d/5.2; }
// Nitik: woven dots that read as a lattice.
float mNitik(vec2 p){ p=rot(.785)*p*3.; vec2 f=fract(p)-.5; float d=9.; for(int i=0;i<4;i++){ vec2 q=rot(float(i)*PI*.5)*f;
  for(float k=0.;k<5.;k++){ d=min(d,length(q-vec2(-.4+k*.2,.46))-.03);} d=min(d,line(length(q-vec2(0.,.16))-.08,.012)); } return d/3.; }
// Lereng: bands of chevrons.
float mLereng(vec2 p){ p=rot(-.6)*p*2.6; float b=fract(p.y)-.5; float x=fract(p.x*2.)-.5; float d=line(abs(b)-.42,.016);
  d=min(d,line(abs(b)+abs(x)*.55-.3,.016)); d=min(d,line(abs(b)+abs(x)*.55-.14,.014)); return d/2.6; }
// Anyaman: a basket weave.
float mAnyaman(vec2 p){ p*=4.; vec2 i=floor(p),f=fract(p)-.5; bool h=mod(i.x+i.y,2.)<1.; if(!h) f=f.yx; float d=line(abs(f.y)-.32,.014);
  d=min(d,line(abs(f.y)-.1,.012)); d=min(d,line(abs(f.x)-.49,.012)); return d/4.; }
// Sekar jagad: islands, each filled with its own lines. The map of the world.
float mSekar(vec2 p){ p*=3.2; vec2 i=floor(p),f=fract(p); float best=9.,second=9.; vec2 id=vec2(0.);
  for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){ vec2 g=vec2(x,y); vec2 h=fract(sin(vec2(dot(i+g,vec2(127.1,311.7)),dot(i+g,vec2(269.5,183.3))))*43758.5); vec2 r=g+h-f; float dd=length(r); if(dd<best){second=best;best=dd;id=i+g;}else if(dd<second)second=dd; }
  float edge=second-best; float d=line(edge-.05,.012); float k=mod(id.x+id.y*2.,3.); vec2 q=rot(id.x*1.3+id.y)*p;
  float fill=k<1.?line(fract(q.y*3.)-.5,.06):k<2.?length(fract(q*4.)-.5)-.13:line(length(fract(q*2.)-.5)-.3,.05);
  d=min(d,max(fill,.04-edge)); return d/3.2; }

float motif(int k,vec2 p){
  if(k==0)return mScales(p); if(k==1)return mParang(p); if(k==2)return mCeplok(p); if(k==3)return mKawung(p); if(k==4)return mLereng(p);
  if(k==5)return mTruntum(p); if(k==6)return mNitik(p); if(k==7)return mAnyaman(p); return mSekar(p); }

// The large figure: an almond of lines around a wheel of nine curved arrows.
float vesica(vec2 p,float w,float h){ p=abs(p); float c=(h*h-w*w)/(2.*w); return length(p+vec2(c,0.))-(c+w); }
float arrows(vec2 p,float R,float n,float tw){
  float a=atan(p.y,p.x)+tw; float r=length(p); float s=TAU/n; float t=fract(a/s); float gap=.075;
  float u=clamp((t-gap)/(1.-2.*gap),0.,1.);
  float spiral=R+.16*(u-.5);
  float w=mix(.006,.062,smoothstep(.0,.8,u));
  float d=abs(r-spiral)-w;
  d=max(d,(gap-t)*r*s); d=max(d,(t-(1.-gap-.09))*r*s);
  // barbed head
  float ht=(t-(1.-gap-.09))/.09; float hw=mix(.13,.0,clamp(ht,0.,1.));
  float head=max(abs(r-spiral-.0)-hw,max(-ht*.09,(ht-1.)*.09)*r*s*2.);
  return min(d,head); }
float figure(vec2 p){
  // p is centred, x in [-1.5,1.5], y in [-3,3]
  float d=9.;
  for(float k=0.;k<4.;k++) d=min(d,line(vesica(p,1.38-k*.075,2.86-k*.075*2.),k==0.?.02:.0075));
  float r=length(p);
  d=min(d,arrows(p,.93,9.,.35));
  d=min(d,line(r-1.17,.012)); d=min(d,line(r-1.205,.005));
  d=min(d,line(r-.66,.008)); d=min(d,line(r-.62,.004));
  // Crown and root: smaller wheels on the axis.
  for(int i=0;i<2;i++){ vec2 q=p-vec2(0.,(i==0?1.:-1.)*1.92); float e=length(q); d=min(d,line(e-.44,.012)); d=min(d,line(e-.48,.004)); d=min(d,arrows(q,.28,3.,1.2+float(i)*3.14)); d=min(d,e-.05); }
  // Petals climbing the axis, left and right.
  for(int s=-1;s<=1;s+=2)for(int i=0;i<5;i++){ float y=(float(i)-2.)*.5; if(abs(y)<.3)continue; vec2 q=rot(float(s)*(.6+abs(y)*.25))*(vec2(p.x*float(s>0?1:-1),p.y)-vec2(.0,y*2.1)-vec2(.82-abs(y)*.1,0.)); }
  // The corners of the sheet: fans of arcs.
  vec2 c=abs(p)-vec2(1.5,3.); float e=length(c);
  for(float k=0.;k<4.;k++) d=min(d,line(e-(.32+k*.19),k==0.?.012:.0065));
  return d; }

void main(){
  vec2 uv=vUv*vec2(3.,6.);            // cells are one unit wide, two tall
  vec2 cell=floor(uv/vec2(1.,2.)); cell=clamp(cell,vec2(0.),vec2(2.));
  int k=int(cell.x)+3*(2-int(cell.y));
  vec2 lp=uv-(cell*vec2(1.,2.)+vec2(.5,1.));     // local panel coordinates
  vec2 p=uv-vec2(1.5,3.);
  float fig=figure(p);
  float mFig=aa(fig);
  float m=motif(k,lp+vec2(.3,.17));
  float keep=smoothstep(.0,.025,fig-.012);
  float mMot=aa(m)*keep;
  // The hem of each panel: a thin rule and a row of tumpal teeth.
  vec2 b=vec2(.5,1.)-abs(lp);
  float rule=min(line(b.x-.022,.0035),line(b.y-.022,.0035));
  float teeth=max(abs(fract(lp.x*10.)-.5)*.1-(.05-(b.y-.03)*.5),-(b.y-.03));
  teeth=max(teeth,b.y-.085);
  float hem=min(rule,teeth);
  mMot=max(mMot,aa(hem));
  // Fine dots, the last gilding: on the wheel, and strewn between the motifs.
  float dots=0.;
  { vec2 q=uv*26.; vec2 f=fract(q+.5*mod(floor(q.y),2.)*vec2(1.,0.))-.5; float keep2=smoothstep(.03,.05,m)*smoothstep(.03,.06,fig); dots=aa((length(f)-.16)/26.)*keep2; }
  float a=atan(p.y,p.x),r=length(p);
  float ringDots=aa(length(vec2(fract(a/TAU*72.)-.5,(r-1.1)*12.))/12.-.012)+aa(length(vec2(fract(a/TAU*54.)-.5,(r-.56)*12.))/12.-.012);
  dots=max(dots,ringDots);
  o=vec4(mFig,mMot,dots,1.);
}`;

// The shared gold lighting. N is in tangent space, flow is the direction the leaf was burnished.
export const GOLD_LIB = /* glsl */`
uniform sampler2D tLeaf;
const vec3 GOLD_F0=vec3(1.0,.70,.27);
vec3 sky(vec3 r,vec3 L){ // a dark room with one warm window
  float w=pow(max(dot(r,L),0.),10.);
  float s=pow(max(dot(r,normalize(L+vec3(-.8,.3,.2))),0.),3.);
  return vec3(.03,.024,.036)+vec3(1.4,1.05,.6)*w*1.5+vec3(.34,.2,.14)*s+vec3(.05,.07,.12)*max(r.y,0.)*.5; }
vec3 goldLeaf(vec2 p,vec3 N,vec3 V,vec3 L,vec2 flow,float scale,inout float crackOut){
  vec4 t=texture(tLeaf,p*scale), tx=texture(tLeaf,p*scale+vec2(.0022,0.)), ty=texture(tLeaf,p*scale+vec2(0.,.0022));
  float hx=tx.r-t.r, hy=ty.r-t.r;
  vec3 n=normalize(N+vec3(-hx,-hy,0.)*3.6);
  // each square of leaf lies at its own slight tilt
  float s=t.b-.5; n=normalize(n+vec3(s*.12,-s*.09,0.));
  vec3 H=normalize(L+V);
  vec2 f=normalize(flow+1e-4);
  vec3 T=normalize(vec3(f,-dot(f,n.xy)/max(n.z,.2))), B=cross(n,T);
  float nh=max(dot(n,H),1e-3), th=dot(T,H), bh=dot(B,H);
  float ax=.42,ay=.13;
  float e=(th*th/(ax*ax)+bh*bh/(ay*ay))/(nh*nh);
  float spec=exp(-e)/(6.28*ax*ay*nh*nh*nh+1e-3);
  float nv=max(dot(n,V),0.), nl=max(dot(n,L),0.);
  vec3 F=GOLD_F0+(1.-GOLD_F0)*pow(1.-nv,5.);
  vec3 env=sky(reflect(-V,n),L);
  vec3 body=GOLD_F0*GOLD_F0*(.13+.5*nl);
  vec3 c=F*env*.72+body+F*spec*nl*1.05;
  c*=.84+.32*t.b;                    // sheet to sheet tone
  crackOut=t.g;
  return c; }
`;

// Cloth with gold on it. Used for the title sheet, the album panels and the walls of the play scene.
export const CLOTH_VERT = /* glsl */`
out vec2 vUv; out vec3 vN; out vec3 vV; out vec3 vW;
void main(){ vUv=uv; vec4 mv=modelViewMatrix*vec4(position,1.); vN=normalize(normalMatrix*normal); vV=normalize(-mv.xyz); vW=mv.xyz; gl_Position=projectionMatrix*mv; }`;

export const CLOTH_FRAG = /* glsl */`
precision highp float;
in vec2 vUv; in vec3 vN; in vec3 vV; in vec3 vW;
uniform sampler2D tPat; uniform vec4 uRect; uniform vec3 uGild; uniform vec3 uLight; uniform float uWax; uniform float uTime; uniform vec3 uBase; uniform float uFlowT; uniform float uDim; uniform float uMirror;
${GOLD_LIB}
out vec4 o;
void main(){
  vec2 uv=uRect.xy+vUv*uRect.zw;
  if(uMirror>.5){ uv=abs(mod(uv+1.,2.)-1.); }
  vec4 m=texture(tPat,uv);
  vec2 cloth=uv*vec2(3.,6.)*.38;
  float e=.0016; vec4 mx=texture(tPat,uv+vec2(e*.5,0.)), my=texture(tPat,uv+vec2(0.,e*.25));
  vec3 g=uGild; float mask=clamp(m.r*g.x+m.g*g.y+m.b*g.z,0.,1.);
  float mx1=clamp(mx.r*g.x+mx.g*g.y+mx.b*g.z,0.,1.), my1=clamp(my.r*g.x+my.g*g.y+my.b*g.z,0.,1.);
  vec3 N=normalize(vN); vec3 V=normalize(vV); vec3 L=normalize(uLight);
  vec3 tan=vec3(1.,0.,0.);
  // indigo and aubergine, dyed unevenly
  vec4 lt=texture(tLeaf,cloth*.7+.31);
  float dye=smoothstep(.25,.75,texture(tLeaf,cloth*.18).r);
  vec3 c=mix(uBase,uBase*vec3(1.55,.72,1.28),dye);
  // cracked wax lets dye run into hairlines
  c+=vec3(.012,.018,.04)*smoothstep(.3,.9,texture(tLeaf,cloth*1.3+.17).g);
  c*=.72+.42*lt.a;
  float diff=.3+.5*max(dot(N,L),0.);
  c*=diff;
  c+=vec3(.05,.03,.012)*pow(1.-max(dot(N,V),0.),3.);
  // the wax line of a panel not yet gilded
  float wax=clamp(m.r+m.g*.55+m.b*.25,0.,1.);
  c+=vec3(.15,.095,.05)*wax*uWax*(1.-mask);
  if(mask>.004){
    float cr; vec2 flow=normalize(vec2(mx1-mask,my1-mask)+vec2(.17,.1)*.08+1e-4);
    flow=vec2(-flow.y,flow.x);
    vec3 NG=normalize(N+vec3(-(mx1-mask),-(my1-mask),0.)*2.4);
    vec3 gc=goldLeaf(cloth,NG,V,L,flow,1.,cr);
    float k=mask*(1.-cr*.92*smoothstep(.35,.95,mask));
    c=mix(c,gc,k);
  }
  c*=uDim;
  o=vec4(c,1.);
}`;

// The enzyme: black lacquer, lit only at its edges.
export const BODY_VERT = /* glsl */`
in vec2 oct; out vec3 vN; out vec3 vV; out vec3 vW; out vec3 vP;
vec3 dec(vec2 e){ e=e*2.-1.; vec3 v=vec3(e,1.-abs(e.x)-abs(e.y)); float t=max(-v.z,0.); v.x+=v.x>=0.?-t:t; v.y+=v.y>=0.?-t:t; return normalize(v); }
void main(){ vec4 mv=modelViewMatrix*vec4(position,1.); vN=normalize(normalMatrix*dec(oct)); vV=normalize(-mv.xyz); vW=mv.xyz; vP=position; gl_Position=projectionMatrix*mv; }`;

export const BODY_FRAG = /* glsl */`
precision highp float;
in vec3 vN; in vec3 vV; in vec3 vW; in vec3 vP;
uniform vec3 uLight; uniform float uClip; uniform float uRim; uniform float uFade; uniform vec3 uFocus; uniform float uTime;
${GOLD_LIB}
out vec4 o;
void main(){
  float cut=vP.z-uClip;
  if(uClip<900.){ float n=texture(tLeaf,vP.xy*.02).r; if(cut+ (n-.45)*2.2>0.) discard; }
  vec3 N=normalize(vN); vec3 V=normalize(vV); vec3 L=normalize(uLight);
  if(!gl_FrontFacing) N=-N;
  float nv=max(dot(N,V),0.);
  float rim=pow(1.-nv,4.2);
  vec3 c=vec3(.004,.0035,.008);
  c+=vec3(.012,.009,.016)*max(dot(N,L),0.);
  vec4 t=texture(tLeaf,vP.xy*.021+vP.z*.013);
  vec3 H=normalize(L+V);
  float s=pow(max(dot(normalize(N+(t.r-.5)*.3),H),0.),38.);
  c+=vec3(.5,.34,.16)*s*.16;
  c+=vec3(1.0,.62,.2)*rim*uRim*(.45+.7*t.r);
  c+=vec3(.16,.2,.42)*pow(1.-nv,1.6)*.075*max(-N.y+.3,0.);
  // a little of the site's gold leaks onto the walls near it
  float dd=length(vP-uFocus); c+=vec3(.5,.3,.08)*exp(-dd*dd*.02)*.012;
  if(!gl_FrontFacing) c*=.35;
  o=vec4(c*uFade,1.);
}`;
