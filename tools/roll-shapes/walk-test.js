/* Throwaway test of the walk method, 2026-11-05. Phase 1 replaces this file with
   a clean engine and proper tests, then deletes it. Run: node walk-test.js */
// Second test: every shape is a polygon. Rolling is an exact walk: flat run, then pivot.
// The pose is continuous and is never re-derived, so a contact jump cannot teleport the shape.
const TAU=Math.PI*2,wrap=a=>{while(a>Math.PI)a-=TAU;while(a<=-Math.PI)a+=TAU;return a;};
function poly(p){const n=p.length/2,len=new Float64Array(n),ang=new Float64Array(n),cum=new Float64Array(n+1);for(let i=0;i<n;i++){const j=(i+1)%n,dx=p[2*j]-p[2*i],dy=p[2*j+1]-p[2*i+1];len[i]=Math.hypot(dx,dy);ang[i]=Math.atan2(dy,dx);cum[i+1]=cum[i]+len[i];}return{p,n,len,ang,cum,P:cum[n]};}
function polarOf(O){const B=32768,R=new Float64Array(B),E=new Int32Array(B),p=O.p;for(let i=0;i<O.n;i++){const j=(i+1)%O.n;let a=Math.atan2(p[2*i+1],p[2*i]),b=Math.atan2(p[2*j+1],p[2*j]);if(a<0)a+=TAU;if(b<a)b+=TAU;for(let q=Math.floor(a/TAU*B);q<=Math.ceil(b/TAU*B);q++){const t=q/B*TAU;if(t<a-1e-9||t>b+1e-9)continue;const c=Math.cos(t),d=Math.sin(t),ax=p[2*i],ay=p[2*i+1],ex=p[2*j]-ax,ey=p[2*j+1]-ay,den=c*ey-d*ex;R[q%B]=Math.abs(den)>1e-15?(ax*ey-ay*ex)/den:Math.hypot(ax,ay);E[q%B]=i;}}return{R,E,B};}
function run({O,I,laps,limit=20000,track,startX=0}){const Pol=polarOf(O),eps=O.P*8e-6,t0=Date.now();
 let A=0,c=1,s=0,tx=0,ty=0;
 let oe=0,ie=0,uo=0,ui=0,travel=0,itravel=0,jumps=0,pivots=0,stuck=0,worst=0,xs=[];
 const ix=I.p,set=()=>{c=Math.cos(A);s=Math.sin(A);};
 // deepest inner vertex outside the outer shape, for a trial pose
 const skip=I.n<16?0:3;function deep(Ax,Tx,Ty,all){const C=Math.cos(Ax),Sn=Math.sin(Ax);let best=0,bi=-1;for(let i=0;i<I.n;i++){if(!all){const off=(i-ie+I.n)%I.n;if(off<=skip||off>=I.n/2)continue;}const x=C*ix[2*i]-Sn*ix[2*i+1]+Tx,y=Sn*ix[2*i]+C*ix[2*i+1]+Ty;let t=Math.atan2(y,x);if(t<0)t+=TAU;const d=Math.hypot(x,y)-Pol.R[Math.floor(t/TAU*Pol.B)%Pol.B];if(d>best){best=d;bi=i;}}return[best,bi];}
 if(deep(0,startX,0,true)[0]>0)return{nofit:true};
 {let lo=startX,hi=O.P;for(let q=0;q<50;q++){const m=(lo+hi)/2;if(deep(0,m,0,true)[0]>eps)hi=m;else lo=m;}tx=lo;ty=0;}
 let worstD=0;function contactWorld(){return[O.p[2*oe]+uo*Math.cos(O.ang[oe]),O.p[2*oe+1]+uo*Math.sin(O.ang[oe])];}
 function poseAfter(phi,P){const dx=tx-P[0],dy=ty-P[1],C=Math.cos(phi),Sn=Math.sin(phi);return[A+phi,P[0]+C*dx-Sn*dy,P[1]+Sn*dx+C*dy];}
 // pivot about the contact, stopping at the first touch. Returns the touching vertex or -1.
 function pivot(phi){if(Math.abs(phi)<1e-13)return-1;pivots++;const P=contactWorld(),stepMax=0.05,n=Math.max(1,Math.ceil(Math.abs(phi)/stepMax));let done=0;
  for(let k=1;k<=n;k++){const f=phi*k/n,[a,b,e]=poseAfter(f,P),[d]=deep(a,b,e);
   if(d>eps){let lo=done,hi=f;for(let q=0;q<26;q++){const m=(lo+hi)/2,[a1,b1,e1]=poseAfter(m,P);if(deep(a1,b1,e1)[0]>eps)hi=m;else lo=m;}
    const[a2,b2,e2]=poseAfter(lo,P);A=a2;tx=b2;ty=e2;const[a3,b3,e3]=poseAfter(hi,P),[,v]=deep(a3,b3,e3);return v;}
   done=f;}
  const[a,b,e]=poseAfter(phi,P);A=a;tx=b;ty=e;return-1;}
 function transfer(v){jumps++;const C=Math.cos(A),Sn=Math.sin(A),x=C*ix[2*v]-Sn*ix[2*v+1]+tx,y=Sn*ix[2*v]+C*ix[2*v+1]+ty;let t=Math.atan2(y,x);if(t<0)t+=TAU;const e=Pol.E[Math.floor(t/TAU*Pol.B)%Pol.B];
  const ux=Math.cos(O.ang[e]),uy=Math.sin(O.ang[e]),u=Math.max(0,Math.min(O.len[e],(x-O.p[2*e])*ux+(y-O.p[2*e+1])*uy));
  const before=O.cum[oe]+uo,after=O.cum[e]+u;let d=(after-before)%O.P;if(d<0)d+=O.P;travel+=d;
  const ib=I.cum[ie]+ui,ia=I.cum[v];let di=(ia-ib)%I.P;if(di<0)di+=I.P;itravel+=di;
  oe=e;uo=u;ie=v;ui=0;
  // lay the next inner edge down on the new wall
  return wrap(O.ang[oe]-(A+I.ang[ie]));}

 let v0=deep(0,tx+eps*50,0,true)[1],pending=transfer(v0);travel=0;itravel=0;jumps=0;pending=pending>0?0:pending;const A0=A;let total=laps*O.P,cnt=0;
 while(travel<total){
  if(Date.now()-t0>limit)return{timeout:true,laps:travel/O.P,jumps,pivots};
  if(pending!==0){const startA=A,v=pivot(pending);if(v>=0){const moved=Math.abs(A-startA);const next=transfer(v);if(moved<1e-7){if(++stuck>12)return{stuck:true,laps:travel/O.P,jumps,ms:Date.now()-t0};}else stuck=0;pending=next>0?0:next;continue;}pending=0;}
  {const dd=deep(A,tx,ty,true)[0];if(++cnt%200==0&&dd>worstD)worstD=dd;}
  const rO=O.len[oe]-uo,rI=I.len[ie]-ui,d=Math.min(rO,rI);travel+=d;itravel+=d;uo+=d;ui+=d;
  let phi=0;if(rI<=rO+1e-14){const nx=(ie+1)%I.n;phi-=wrap(I.ang[nx]-I.ang[ie]);ie=nx;ui=0;}
  if(rO<=rI+1e-14){const nx=(oe+1)%O.n;phi+=wrap(O.ang[nx]-O.ang[oe]);oe=nx;uo=0;}
  // keep contact point valid when the outer edge has not changed
  pending=phi;
  if(track&&cnt%40==0){xs.push(tx);}
 }
 set();return{laps:travel/O.P,trips:itravel/I.P,worst:worstD/O.P,spins:-(A-A0)/TAU,jumps,pivots,ms:Date.now()-t0,xs,finalDepth:deep(A,tx,ty)[0]};}
const circle=(P,n=1024)=>{const R=P/TAU,a=[];for(let i=0;i<n;i++)a.push(R*Math.cos(i/n*TAU),R*Math.sin(i/n*TAU));return poly(a);};
const ellipse=(a0,b0,P,n=1024)=>{let l=0,q=null;for(let i=0;i<=20000;i++){const t=i/20000*TAU,x=a0*Math.cos(t),y=b0*Math.sin(t);if(q)l+=Math.hypot(x-q[0],y-q[1]);q=[x,y];}const k=P/l,a=[];for(let i=0;i<n;i++){const t=i/n*TAU;a.push(k*a0*Math.cos(t),k*b0*Math.sin(t));}return poly(a);};
const ngon=(n,side,phase=0)=>{const rho=side/(2*Math.sin(Math.PI/n)),a=[];for(let i=0;i<n;i++)a.push(rho*Math.cos(phase+i*TAU/n),rho*Math.sin(phase+i*TAU/n));return poly(a);};
function rngon(n,side,rad,cn=24,phase=0){const rho=side/(2*Math.sin(Math.PI/n)),inr=rho-rad/Math.cos(Math.PI/n),a=[];for(let k=0;k<n;k++){const c=phase+k*TAU/n,cx=inr*Math.cos(c),cy=inr*Math.sin(c);for(let j=0;j<cn;j++){const t=c-Math.PI/n+TAU/n*j/(cn-1);a.push(cx+rad*Math.cos(t),cy+rad*Math.sin(t));}}return poly(a);}
const peanut=(d,P,n=1500)=>{let a=[],l=0;for(let i=0;i<n;i++){const t=i/n*TAU,r=1+d*Math.cos(2*t);a.push(r*Math.cos(t),r*Math.sin(t));if(i)l+=Math.hypot(a[2*i]-a[2*i-2],a[2*i+1]-a[2*i-1]);}l+=Math.hypot(a[0]-a[2*n-2],a[1]-a[2*n-1]);return poly(a.map(v=>v*P/l));};
function rep(name,r,exp){const nm=name.padEnd(36);if(r.nofit)return console.log(nm,'DOES NOT FIT at the start');if(r.stuck)return console.log(nm,'STUCK after',r.laps.toFixed(2),'laps');if(r.timeout)return console.log(nm,'TIMEOUT at',r.laps.toFixed(2),'laps, jumps',r.jumps,'pivots',r.pivots);
 const v=r.spins/r.laps,law=r.spins-(r.trips-r.laps);console.log(nm,'laps',r.laps.toFixed(1),'spins/lap',v.toFixed(4),exp!==undefined?('want '+exp.toFixed(4)+' err '+((v/exp-1)*100).toFixed(3)+'%'):''.padEnd(25),'law err',law.toFixed(3),'jumps',r.jumps,'worst overlap '+(r.worst*100).toFixed(3)+'% of perimeter',r.ms+'ms');}
const Pc=TAU;
for(const f of [.42,.3]){rep('ellipse in circle, ratio '+f,run({O:circle(Pc),I:ellipse(1,.6,Pc*f),laps:20}),1/f-1);}
rep('circle in circle, ratio .25',run({O:circle(Pc),I:circle(Pc*.25),laps:20}),3);
for(const[n,a]of[[4,.6],[4,1.0],[3,.8],[5,.7],[6,.5]]){const al=Math.asin(a/2),exp=(1/n-al/Math.PI)/(al/Math.PI);rep(n+'-gon side '+a+' in circle',run({O:circle(Pc),I:ngon(n,a),laps:20}),exp);}
for(const r of [.15,.3,.6]){const L=2;rep('circle r='+r+' in square L=2',run({O:ngon(4,L,Math.PI/4),I:circle(TAU*r),laps:20}),2*(L-2*r)/(Math.PI*r));}
rep('rounded triangle in rounded square',run({O:rngon(4,2,.3,32,Math.PI/4),I:rngon(3,.7,.1),laps:20}));
rep('square in ellipse',run({O:ellipse(1.4,1,8),I:ngon(4,.5),laps:20}));
rep('triangle in square',run({O:ngon(4,2,Math.PI/4),I:ngon(3,.6),laps:20}));
rep('pentagon in triangle',run({O:ngon(3,3,0),I:ngon(5,.25),laps:20}));
rep('thin ellipse that jams in a diamond',run({O:ngon(4,1,0),I:ellipse(1,.0833,2.42,400),laps:5}));
rep('square too big',run({O:circle(Pc),I:ngon(4,1.5),laps:5}));
rep('long thin ellipse in small square',run({O:ngon(4,1,Math.PI/4),I:ellipse(1,.08,2.2,400),laps:5}));
rep('circle in peanut, fits waist',run({O:peanut(.45,120),I:circle(50,512),laps:5}));
{const r=run({O:peanut(.45,120),I:circle(60,512),laps:5,track:true,startX:12});rep('circle too wide for waist',r);if(r.xs&&r.xs.length)console.log('   circle centre x stays between',Math.min(...r.xs).toFixed(1),'and',Math.max(...r.xs).toFixed(1));}
{const t=Date.now();rep('PERF rounded tri in rounded sq, 200 laps',run({O:rngon(4,2,.3,32,Math.PI/4),I:rngon(3,.7,.1,24),laps:200,limit:60000}));}
{rep('PERF ellipse in circle, 200 laps',run({O:circle(Pc,720),I:ellipse(1,.6,Pc*.42,360),laps:200,limit:60000}),1/.42-1);}
