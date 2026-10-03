'use strict';
// HIKYAKU 3D — original WebGL renderer and game, no third-party dependencies.
// World units are fictional metres. Keep town geometry, collision, and routes
// together here so the standalone files stay easy to modify without a build.
const $=id=>document.getElementById(id),canvas=$('world');
const gl=canvas.getContext('webgl',{alpha:false,antialias:true,powerPreference:'high-performance'});
if(!gl){$('fatal').hidden=false;throw new Error('WebGL unavailable');}
const C={ink:[.09,.25,.29],roof:[.12,.29,.32],plaster:[.85,.78,.61],wood:[.38,.26,.17],red:[.69,.23,.16],paper:[.96,.9,.73],road:[.77,.67,.47],grass:[.53,.61,.43],water:[.29,.53,.57],gold:[.98,.66,.2]};
const vs=`attribute vec3 aPosition;attribute vec3 aNormal;attribute vec3 aColor;
uniform mat4 uVP;uniform mat4 uModel;uniform vec3 uTint;uniform vec3 uEye;
varying vec3 vColor;varying float vDistance;
void main(){vec4 p=uModel*vec4(aPosition,1.0);vec3 n=normalize(mat3(uModel)*aNormal);
float light=.49+.51*max(dot(n,normalize(vec3(-.5,.9,-.3))),0.0);
vColor=aColor*uTint*light;vDistance=distance(p.xyz,uEye);gl_Position=uVP*p;}`;
const fs=`precision mediump float;varying vec3 vColor;varying float vDistance;
void main(){float fog=smoothstep(100.0,290.0,vDistance);gl_FragColor=vec4(mix(vColor,vec3(.73,.81,.75),fog),1.0);}`;
function shader(type,source){const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s;}
const program=gl.createProgram();gl.attachShader(program,shader(gl.VERTEX_SHADER,vs));gl.attachShader(program,shader(gl.FRAGMENT_SHADER,fs));gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));gl.useProgram(program);
const attrs=['aPosition','aNormal','aColor'].map(n=>gl.getAttribLocation(program,n));
const uniforms=Object.fromEntries(['uVP','uModel','uTint','uEye'].map(n=>[n,gl.getUniformLocation(program,n)]));
gl.enable(gl.DEPTH_TEST);gl.clearColor(.73,.81,.75,1);
const vsub=(a,b)=>a.map((v,i)=>v-b[i]),dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],norm=a=>{const n=Math.hypot(...a)||1;return a.map(v=>v/n);};
function multiply(a,b){const o=new Float32Array(16);for(let c=0;c<4;c++)for(let r=0;r<4;r++)for(let k=0;k<4;k++)o[c*4+r]+=a[k*4+r]*b[c*4+k];return o;}
function perspective(fov,aspect,near,far){const f=1/Math.tan(fov/2);return new Float32Array([f/aspect,0,0,0,0,f,0,0,0,0,(far+near)/(near-far),-1,0,0,2*far*near/(near-far),0]);}
function lookAt(eye,target){const z=norm(vsub(eye,target)),x=norm(cross([0,1,0],z)),y=cross(z,x);return new Float32Array([x[0],y[0],z[0],0,x[1],y[1],z[1],0,x[2],y[2],z[2],0,-dot(x,eye),-dot(y,eye),-dot(z,eye),1]);}
function model(x=0,y=0,z=0,yaw=0,sx=1,sy=1,sz=1){const c=Math.cos(yaw),s=Math.sin(yaw);return new Float32Array([c*sx,0,-s*sx,0,0,sy,0,0,s*sz,0,c*sz,0,x,y,z,1]);}
function tri(out,a,b,c,color){const n=norm(cross(vsub(b,a),vsub(c,a)));for(const v of[a,b,c])out.push(...v,...n,...color);}
function quad(out,a,b,c,d,color){tri(out,a,b,c,color);tri(out,a,c,d,color);}
function box(out,x,y,z,w,h,d,color){const l=x-w/2,r=x+w/2,b=y,t=y+h,n=z-d/2,f=z+d/2;
 quad(out,[l,b,n],[l,t,n],[r,t,n],[r,b,n],color);quad(out,[r,b,f],[r,t,f],[l,t,f],[l,b,f],color);
 quad(out,[l,b,f],[l,t,f],[l,t,n],[l,b,n],color);quad(out,[r,b,n],[r,t,n],[r,t,f],[r,b,f],color);
 quad(out,[l,t,n],[l,t,f],[r,t,f],[r,t,n],color);quad(out,[l,b,f],[l,b,n],[r,b,n],[r,b,f],color);
}
function roof(out,x,y,z,w,h,d,color){const l=x-w/2,r=x+w/2,n=z-d/2,f=z+d/2;
 quad(out,[l,y,n],[l,y,f],[x,y+h,f],[x,y+h,n],color);quad(out,[x,y+h,n],[x,y+h,f],[r,y,f],[r,y,n],color);
 tri(out,[l,y,n],[x,y+h,n],[r,y,n],color);tri(out,[r,y,f],[x,y+h,f],[l,y,f],color);
}
function cylinder(out,x,y,z,r,h,color,sides=10,top=r){for(let i=0;i<sides;i++){const a=i*2*Math.PI/sides,b=(i+1)*2*Math.PI/sides;
 const p=[x+Math.cos(a)*r,y,z+Math.sin(a)*r],q=[x+Math.cos(b)*r,y,z+Math.sin(b)*r],u=[x+Math.cos(a)*top,y+h,z+Math.sin(a)*top],v=[x+Math.cos(b)*top,y+h,z+Math.sin(b)*top];
 quad(out,p,u,v,q,color);tri(out,[x,y+h,z],v,u,color);}}
function makeMesh(data){const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(data),gl.STATIC_DRAW);return {buffer,count:data.length/9};}
function meshDraw(mesh,m=model(),tint=[1,1,1]){gl.bindBuffer(gl.ARRAY_BUFFER,mesh.buffer);for(let i=0;i<3;i++){gl.enableVertexAttribArray(attrs[i]);gl.vertexAttribPointer(attrs[i],3,gl.FLOAT,false,36,i*12);}gl.uniformMatrix4fv(uniforms.uModel,false,m);gl.uniform3fv(uniforms.uTint,tint);gl.drawArrays(gl.TRIANGLES,0,mesh.count);}
// Streets form an open grid, with two legal river crossings. Buildings are solid
// AABBs; water is not walkable even while jumping. No invisible route corridor.
const solids=[],world=[],bridges=[0,80],pickup={x:0,z:-198},delivery={x:80,z:214};
const teas=[{x:-10,z:-104},{x:10,z:111},{x:90,z:181}];
box(world,0,-.35,-147.5,300,.35,265,C.grass);box(world,0,-.35,147.5,300,.35,265,C.grass);
box(world,0,-.45,0,300,.18,30,C.water);
for(const z of[-185,-105,-40,40,110,180,250])box(world,0,.012,z,280,.025,14,C.road);
for(const x of[-80,0,80])for(const z of[-145,145])box(world,x,.025,z,16,.025,260,C.road);
// Embankments frame the river but leave the bridge approaches clear.
for(const x of[-123,-40,123])for(const z of[-16,16])box(world,x,.05,z,x===-40?60:42,.65,1.2,[.45,.46,.39]);
function bridgeHeight(z){const a=Math.abs(z);return a<15?2.2:a<27?2.2*(27-a)/12:0;}
for(const x of bridges){for(let i=-27;i<27;i++){const y=bridgeHeight(i+.5);box(world,x,y-.35,i+.5,16,.35,1.03,C.wood);}
 for(const side of[-1,1])for(let z=-24;z<=24;z+=4)box(world,x+side*7.5,bridgeHeight(z),z,.35,1.15,.35,C.red);
 for(const side of[-1,1])for(let z=-24;z<24;z+=2)box(world,x+side*7.5,bridgeHeight(z)+.85,z+1,.25,.23,2.1,C.red);
 for(const z of[-10,10])for(const side of[-1,1])box(world,x+side*5,-.4,z,.8,2.5,.8,C.wood);
}
function house(x,z,w=27,d=28,h=7,i=0){
 solids.push({x,z,w:w+2,d:d+2,h:h+4,type:'building'});box(world,x,0,z,w,h,d,C.plaster);roof(world,x,h,z,w+3,3,d+3,C.roof);
 box(world,x,0,z+d/2+.07,w,.55,.2,C.wood);
 for(const side of[-1,1]){box(world,x,1.3,z+side*(d/2+.08),w-3,2.5,.18,C.wood);
   for(let k=-w/2+2;k<w/2;k+=3)box(world,x+k,1.4,z+side*(d/2+.2),.15,2.3,.12,C.paper);}
 for(const dx of[-w/2+.3,w/2-.3])for(const dz of[-d/2+.3,d/2-.3])box(world,x+dx,0,z+dz,.5,h,.5,C.wood);
 box(world,x,0,z+d/2+.25,3,3.5,.2,C.ink);box(world,x,3,z+d/2+.4,4.3,1,.12,i%3===0?C.red:C.ink);
}
let houseIndex=0;
for(const x of[-118,-42,42,118])for(const z of[-237,-145,-73,74,145,218])house(x,z,x===-118||x===118?27:30,30,6+(houseIndex%3),houseIndex++);
// Smaller market stalls make the street scale readable near the starting point.
for(const x of[-12,12])for(const z of[-211,-166]){box(world,x,0,z,4,2,6,C.wood);roof(world,x,2,z,5,1.3,7,C.red);solids.push({x,z,w:5,d:7,h:3.5,type:'stall'});}
for(const t of teas){box(world,t.x,0,t.z,3,1,1,C.red);cylinder(world,t.x+2,0,t.z,0.08,3,C.wood,6);cylinder(world,t.x+2,2.9,t.z,2,.6,C.red,10,0);}
// Stylized trees and lanterns are also original mesh primitives.
for(let i=0;i<34;i++){const x=i%2===0?-144:144,z=-257+Math.floor(i/2)*31;
 cylinder(world,x,0,z,.5,4,C.wood,6);cylinder(world,x,3,z,3,5,[.23,.42,.34],7,0);}
for(const x of[-8,8])for(const z of[-185,-105,-39,40,110,180,250]){cylinder(world,x,0,z,.09,3.7,C.wood,6);box(world,x,3,z,.7,.8,.7,C.paper);box(world,x,3.8,z,.9,.12,.9,C.ink);}
for(const p of[pickup,delivery]){box(world,p.x,0,p.z,4,.07,4,C.gold);}
const worldMesh=makeMesh(world),cubeData=[];box(cubeData,0,0,0,1,1,1,[1,1,1]);const cube=makeMesh(cubeData);
const headData=[];cylinder(headData,0,0,0,.24,.4,[.72,.5,.32],8);const headMesh=makeMesh(headData);
const hatData=[];cylinder(hatData,0,0,0,.48,.24,C.paper,10,0);const hatMesh=makeMesh(hatData);
const ringData=[];cylinder(ringData,0,0,0,.7,.16,C.gold,16,.7);const ringMesh=makeMesh(ringData);
const npcs=[{x:-4,z:-190},{x:4,z:-120},{x:-5,z:62},{x:76,z:190}];
// Save only game state. No names, identifiers, analytics, or network calls.
const SAVE='hikyaku-3d-v1',LIMIT=300;
let bank={wallet:0,deliveries:0},resumeState=null,storageOK=true;
const finite=n=>typeof n==='number'&&Number.isFinite(n);
try{const s=JSON.parse(localStorage.getItem(SAVE)||'null');if(s&&typeof s==='object'){
 bank.wallet=finite(s.wallet)?Math.max(0,Math.min(1000000,Math.floor(s.wallet))):0;
 bank.deliveries=finite(s.deliveries)?Math.max(0,Math.min(1000000,Math.floor(s.deliveries))):0;
 if(s.run&&finite(s.run.x)&&finite(s.run.z)&&finite(s.run.time)&&s.run.time>0&&s.run.time<=LIMIT&&Math.abs(s.run.x)<149&&Math.abs(s.run.z)<274)resumeState=s.run;
}else{const old=JSON.parse(localStorage.getItem('hikyaku-mvp-v1')||'null');if(old){bank.wallet=finite(old.wallet)?Math.max(0,Math.min(1000000,Math.floor(old.wallet))):0;bank.deliveries=finite(old.deliveries)?Math.max(0,Math.min(1000000,Math.floor(old.deliveries))):0;}}}catch{storageOK=false;}
let p={x:0,z:-209,y:0,vy:0,yaw:0,energy:100},mode='intro',carrying=false,remaining=LIMIT,walkCycle=0,resting=0,totalTime=0,autosave=0;
let keys=new Set(),stick={x:0,y:0},dash=false,camYaw=0,camPitch=.43,camDistance=8,drag=null,last=0,toastTime=0;
let audio=null,sound=false,nextNote=0,note=0,frameCount=0,lastEye=[0,5,-218],cameraBlocked=false;
function toast(t,seconds=4){$('toast').textContent=t;toastTime=seconds;}
function saveGame(includeRun=true){try{const run=includeRun&&['play','paused'].includes(mode)?{x:p.x,z:p.z,energy:p.energy,yaw:p.yaw,camYaw,carrying,time:remaining}:null;
 localStorage.setItem(SAVE,JSON.stringify({...bank,run}));storageOK=true;}catch{storageOK=false;}}
function tone(freq,duration=.13,volume=.035){if(!sound||!audio)return;const o=audio.createOscillator(),g=audio.createGain();o.type='triangle';o.frequency.value=freq;g.gain.setValueAtTime(volume,audio.currentTime);g.gain.exponentialRampToValueAtTime(.001,audio.currentTime+duration);o.connect(g);g.connect(audio.destination);o.start();o.stop(audio.currentTime+duration);}
function ground(x,z){return bridges.some(b=>Math.abs(x-b)<8)?bridgeHeight(z):0;}
function canStand(x,z,r=.38){if(Math.abs(x)>148-r||Math.abs(z)>273-r)return false;
 if(Math.abs(z)<15+r&&!bridges.some(b=>Math.abs(x-b)<7-r))return false;
 for(const b of solids)if(Math.abs(x-b.x)<b.w/2+r&&Math.abs(z-b.z)<b.d/2+r)return false;return true;}
function move(dx,dz){ // Axis-separated swept substeps prevent tunnelling at low fps.
 const steps=Math.max(1,Math.ceil(Math.hypot(dx,dz)/.2));let changed=false;
 for(let i=0;i<steps;i++){if(canStand(p.x+dx/steps,p.z)){p.x+=dx/steps;changed=true;}if(canStand(p.x,p.z+dz/steps)){p.z+=dz/steps;changed=true;}}
 return changed;
}
function target(){return carrying?delivery:pickup;}
function dist(a,b){return Math.hypot(a.x-b.x,a.z-b.z);}
// Visibility graph along intersections gives a collision-safe guide even after
// exploring side streets. It is cached until the player moves two metres.
const navNodes=[];for(const x of [-80,0,80])for(const z of [-250,-185,-105,-40,40,110,180,250])navNodes.push({x,z});
function clearLine(a,b){const steps=Math.ceil(dist(a,b)/1.5);for(let i=0;i<=steps;i++){const f=i/(steps||1);if(!canStand(a.x+(b.x-a.x)*f,a.z+(b.z-a.z)*f,.6))return false;}return true;}
const navEdges=navNodes.map((a,i)=>navNodes.map((b,j)=>({j,d:dist(a,b)})).filter(e=>e.j!==i&&clearLine(a,navNodes[e.j])));
let routeCache=null;
function routePoints(){
 const goal=target();if(routeCache&&routeCache.carrying===carrying&&dist(p,routeCache.from)<2)return [{x:p.x,z:p.z},...routeCache.path];
 const nodes=[...navNodes,goal],N=nodes.length,goalId=N-1,cost=Array(N).fill(Infinity),prev=Array(N).fill(-1),used=new Set();
 for(let i=0;i<N;i++)if(clearLine(p,nodes[i]))cost[i]=dist(p,nodes[i]);
 for(let count=0;count<N;count++){let at=-1;for(let i=0;i<N;i++)if(!used.has(i)&&(at<0||cost[i]<cost[at]))at=i;
  if(at<0||!Number.isFinite(cost[at])||at===goalId)break;used.add(at);
  const edges=[...navEdges[at]];if(clearLine(nodes[at],goal))edges.push({j:goalId,d:dist(nodes[at],goal)});
  for(const e of edges)if(cost[at]+e.d<cost[e.j]){cost[e.j]=cost[at]+e.d;prev[e.j]=at;}
 }
 const path=[];let at=goalId;while(at>=0){path.unshift(nodes[at]);at=prev[at];}
 routeCache={from:{x:p.x,z:p.z},carrying,path};return [{x:p.x,z:p.z},...path];
}
function resetInput(){keys.clear();stick={x:0,y:0};dash=false;drag=null;$('knob').style.transform='translate(0,0)';}
function enter(resume=false){resetInput();if(resume&&resumeState&&canStand(resumeState.x,resumeState.z)){
 p={x:resumeState.x,z:resumeState.z,y:0,vy:0,yaw:finite(resumeState.yaw)?resumeState.yaw:0,energy:finite(resumeState.energy)?Math.min(100,Math.max(0,resumeState.energy)):100};
 camYaw=finite(resumeState.camYaw)?resumeState.camYaw:0;remaining=resumeState.time;carrying=resumeState.carrying===true;
 }else{p={x:0,z:-209,y:0,vy:0,yaw:0,energy:100};camYaw=0;remaining=LIMIT;carrying=false;}
 p.y=ground(p.x,p.z);resting=0;mode='play';$('overlay').hidden=true;canvas.focus();$('pause').textContent='一時停止';toast(carrying?'保存した配達を再開しました。':'金色の柱の近くで「手紙を受け取る」を押そう。',6);saveGame();hud();
}
function interact(){if(mode!=='play'||dist(p,target())>4)return;
 if(!carrying){carrying=true;remaining=LIMIT;saveGame();tone(587,.2);toast('手紙を預かった。橋を渡り、南東の配達所へ。5分以内で20両。',7);}
 else finish(true);hud();}
function finish(won){mode='end';resetInput();if(won){bank.wallet+=20;bank.deliveries++;tone(880,.5);}saveGame(false);resumeState=null;
 $('panelTitle').textContent=won?'無事、お届け。':'今日はここまで。';$('panelText').textContent=won?'手紙を届けて20両を受け取りました。\n配達時間 '+Math.floor((LIMIT-remaining)/60)+'分'+Math.floor((LIMIT-remaining)%60)+'秒。\nもう一度、町の景色を楽しもう。':'配達の制限時間を過ぎました。\n道に迷ったら地図と「視点を戻す」を使ってみよう。';
 $('introHelp').hidden=true;$('start').textContent='日本橋からもう一度';$('resume').hidden=true;$('overlay').hidden=false;record();hud();}
function pause(){if(mode==='play'){mode='paused';resetInput();saveGame();$('pause').textContent='再開';toast('一時停止。時計も止まっています。「再開」で戻れます。',999);}
 else if(mode==='paused'){mode='play';$('pause').textContent='一時停止';canvas.focus();toast('配達を再開しました。');}hud();}
function jump(){if(mode==='play'&&p.y<=ground(p.x,p.z)+.015&&p.energy>=5&&!resting){p.vy=5.2;p.energy-=5;tone(660);}}
function rest(){if(mode!=='play')return;const tea=teas.some(t=>dist(t,p)<6);resting=tea?3:2;resetInput();toast(tea?'茶屋で一服。3秒でスタミナ全回復。':'立ち止まってひと休み。配達中の時計は進みます。');}
function record(){$('record').textContent='配達 '+bank.deliveries+'回 / '+bank.wallet+'両'+(storageOK?' ・ 記録はこのブラウザに保存':' ・ このブラウザでは保存できません');}
function hud(){const t=target(),d=dist(p,t),guide=routePoints()[1]||t,angle=Math.atan2(guide.x-p.x,guide.z-p.z)-camYaw;
 const arrow=['↑','↗','→','↘','↓','↙','←','↖'][((Math.round(angle/(Math.PI/4))%8)+8)%8];
 $('objective').textContent=carrying?'南東の配達所へ届ける':'問屋で手紙を受け取る';
 $('location').textContent=p.z<-30?'日本橋・北の町':p.z<30?'日本橋・川沿い':'南の町・品川方面';
 $('direction').textContent=d<4?'到着！ 下の赤いボタンを押そう':arrow+' 道案内 / 届け先まで '+Math.round(d)+' m';
 const s=Math.ceil(remaining);$('time').textContent=carrying?Math.floor(s/60)+':'+String(s%60).padStart(2,'0'):'受取前';
 $('energy').textContent=Math.round(p.energy);$('energyBar').style.width=p.energy+'%';$('money').textContent=bank.wallet+' 両';
 $('interact').disabled=mode!=='play'||d>4;$('interact').textContent=d<=4?(carrying?'手紙を届ける':'手紙を受け取る'):(carrying?'配達所へ近づく':'問屋へ近づく');
 $('rest').textContent=teas.some(t=>dist(t,p)<6)?'茶屋で一服':'ひと休み';$('rest').disabled=mode!=='play'||resting>0;$('pause').disabled=!['play','paused'].includes(mode);
}
function update(dt){if(mode!=='play')return;totalTime+=dt;autosave+=dt;toastTime-=dt;
 if(carrying){remaining=Math.max(0,remaining-dt);if(remaining<=0){finish(false);return;}}
 if(resting>0){resting=Math.max(0,resting-dt);p.energy=Math.min(100,p.energy+dt*(teas.some(t=>dist(t,p)<6)?34:14));}
 else{
 let ix=(keys.has('KeyD')||keys.has('ArrowRight')?1:0)-(keys.has('KeyA')||keys.has('ArrowLeft')?1:0)+stick.x;
 let iz=(keys.has('KeyW')||keys.has('ArrowUp')?1:0)-(keys.has('KeyS')||keys.has('ArrowDown')?1:0)-stick.y;
 const length=Math.hypot(ix,iz);if(length>1){ix/=length;iz/=length;}
 if(keys.has('KeyQ'))camYaw-=dt*1.8;if(keys.has('KeyE'))camYaw+=dt*1.8;
 if(length>.08){const sprint=(dash||keys.has('ShiftLeft')||keys.has('ShiftRight'))&&p.energy>3;
  const speed=sprint?3.2:2.35,dx=(ix*Math.cos(camYaw)+iz*Math.sin(camYaw))*speed*dt,dz=(-ix*Math.sin(camYaw)+iz*Math.cos(camYaw))*speed*dt;
  if(move(dx,dz)){p.yaw=Math.atan2(dx,dz);walkCycle+=dt*(sprint?12:8);}p.energy=Math.max(0,Math.min(100,p.energy+dt*(sprint?-8:1.8)));
 }else p.energy=Math.min(100,p.energy+dt*14);
 }
 const floor=ground(p.x,p.z);p.vy-=14*dt;p.y+=p.vy*dt;if(p.y<floor){p.y=floor;p.vy=0;}
 if(autosave>5){autosave=0;saveGame();}
 if(sound&&audio&&audio.currentTime>nextNote){const scale=[293.66,349.23,392,440,523.25,440,392,349.23];tone(scale[note++%scale.length],.35,.012);nextNote=audio.currentTime+.65;}
 if(toastTime<=0){$('toast').textContent=resting?'休憩中…':carrying?'地図の金色の道を目印に。川は橋を渡ろう。':'自由に歩けます。準備ができたら問屋へ。';}
 hud();
}
// Third-person camera follows position; yaw is user-controlled for stable WASD
// directions. Obstruction sampling pulls it in before a wall clips the view.
function camera(){const look=[p.x,p.y+1.4,p.z],horizontal=Math.cos(camPitch)*camDistance;
 let candidate=[p.x-Math.sin(camYaw)*horizontal,p.y+1.4+Math.sin(camPitch)*camDistance,p.z-Math.cos(camYaw)*horizontal];cameraBlocked=false;
 for(let i=1;i<=30;i++){const f=i/30,point=look.map((v,j)=>v+(candidate[j]-v)*f);if(solids.some(b=>Math.abs(point[0]-b.x)<b.w/2+.3&&Math.abs(point[2]-b.z)<b.d/2+.3&&point[1]<b.h+.6)){
   const safe=Math.max(.08,(i-1)/30);candidate=look.map((v,j)=>v+(candidate[j]-v)*safe);cameraBlocked=true;break;}}
 candidate[1]=Math.max(candidate[1],ground(candidate[0],candidate[2])+1);lastEye=candidate;return {look,eye:candidate};
}
function person(x,y,z,yaw,cycle,main=false){const root=model(x,y,z,yaw);const part=(lx,ly,lz,sx,sy,sz,color)=>meshDraw(cube,multiply(root,model(lx,ly,lz,0,sx,sy,sz)),color);
 part(0,.63,0,.6,.65,.38,main?C.ink:[.39,.4,.33]);meshDraw(headMesh,multiply(root,model(0,1.32,0)));
 meshDraw(hatMesh,multiply(root,model(0,1.69,0)));part(-.34,.7,Math.sin(cycle)*.15,.15,.5,.16,[.72,.5,.32]);part(.34,.7,-Math.sin(cycle)*.15,.15,.5,.16,[.72,.5,.32]);
 part(-.18,.1,Math.sin(cycle)*.17,.19,.55,.22,C.ink);part(.18,.1,-Math.sin(cycle)*.17,.19,.55,.22,C.ink);
 part(-.18,.02,Math.sin(cycle)*.17+.035,.24,.1,.34,C.paper);part(.18,.02,-Math.sin(cycle)*.17+.035,.24,.1,.34,C.paper);
 if(main){part(0,.78,-.33,.58,.65,.26,C.red);part(0,1.03,-.475,.53,.08,.025,C.paper);if(carrying)part(0,.94,-.495,.27,.24,.03,C.paper);}
}
function draw(){const w=canvas.clientWidth,h=canvas.clientHeight,ratio=Math.min(devicePixelRatio||1,1.6),cw=Math.round(w*ratio),ch=Math.round(h*ratio);
 if(canvas.width!==cw||canvas.height!==ch){canvas.width=cw;canvas.height=ch;}gl.viewport(0,0,cw,ch);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
 const c=camera(),vp=multiply(perspective(Math.PI/3,w/h,.12,340),lookAt(c.eye,c.look));gl.uniformMatrix4fv(uniforms.uVP,false,vp);gl.uniform3fv(uniforms.uEye,c.eye);
 meshDraw(worldMesh);for(const n of npcs)person(n.x,ground(n.x,n.z),n.z,Math.PI,0);person(p.x,p.y,p.z,p.yaw,walkCycle,true);
 const t=target(),floor=ground(t.x,t.z);meshDraw(cube,model(t.x,floor,t.z,0,.12,9,.12),C.gold);
 meshDraw(ringMesh,model(t.x,floor+3.6+Math.sin(totalTime*2)*.2,t.z,totalTime,1,1,1));
 meshDraw(cube,model(t.x,floor+5,t.z,totalTime,.6,.6,.6),C.gold);
 // Breadcrumb posts appear on the suggested streets and use the depth buffer.
 const path=routePoints();for(let i=1;i<path.length;i++){const a=path[i-1],b=path[i],len=dist(a,b);for(let d=12;d<len;d+=16){const x=a.x+(b.x-a.x)*d/len,z=a.z+(b.z-a.z)*d/len;
   if(canStand(x,z)&&dist(p,{x,z})<75)meshDraw(ringMesh,model(x,ground(x,z)+.08,z,0,.26,.3,.26));}}
 drawMap();frameCount++;
}
const map=$('map'),mc=map.getContext('2d');
function drawMap(){const sx=x=>(x+150)/300*300,sz=z=>(z+280)/560*360;mc.fillStyle='#f0e4c5';mc.fillRect(0,0,300,360);
 mc.fillStyle='#739ba0';mc.fillRect(0,sz(-15),300,sz(15)-sz(-15));mc.strokeStyle='#baaa83';mc.lineWidth=7;
 for(const x of[-80,0,80]){mc.beginPath();mc.moveTo(sx(x),6);mc.lineTo(sx(x),354);mc.stroke();}
 for(const z of[-185,-105,-40,40,110,180,250]){mc.beginPath();mc.moveTo(10,sz(z));mc.lineTo(290,sz(z));mc.stroke();}
 mc.fillStyle='#a39e80';for(const b of solids)mc.fillRect(sx(b.x-b.w/2),sz(b.z-b.d/2),b.w,b.d/560*360);
 mc.fillStyle='#b54534';for(const x of bridges)mc.fillRect(sx(x)-6,sz(-22),12,sz(22)-sz(-22));
 mc.strokeStyle='#d39325';mc.lineWidth=3;mc.setLineDash([5,4]);mc.beginPath();routePoints().forEach((v,i)=>i?mc.lineTo(sx(v.x),sz(v.z)):mc.moveTo(sx(v.x),sz(v.z)));mc.stroke();mc.setLineDash([]);
 mc.fillStyle='#59734a';for(const t of teas){mc.beginPath();mc.arc(sx(t.x),sz(t.z),3.5,0,7);mc.fill();}
 const t=target();mc.fillStyle='#b64531';mc.save();mc.translate(sx(t.x),sz(t.z));mc.rotate(Math.PI/4);mc.fillRect(-5,-5,10,10);mc.restore();
 mc.save();mc.translate(sx(p.x),sz(p.z));mc.rotate(-camYaw);mc.fillStyle='#153c4b';mc.beginPath();mc.moveTo(0,9);mc.lineTo(-5,-5);mc.lineTo(5,-5);mc.closePath();mc.fill();mc.restore();
 mc.strokeStyle='#153c4b';mc.lineWidth=2;mc.strokeRect(1,1,298,358);
}
$('start').onclick=()=>enter();$('resume').onclick=()=>enter(true);$('interact').onclick=interact;$('pause').onclick=pause;$('rest').onclick=rest;$('jump').onclick=jump;
$('camera').onclick=()=>{const g=routePoints()[1]||target();camYaw=Math.atan2(g.x-p.x,g.z-p.z);camPitch=.43;camDistance=8;toast('配達の道案内へ視点を戻しました。');};
$('sound').onclick=()=>{sound=!sound;if(sound){try{audio??=new(window.AudioContext||window.webkitAudioContext)();audio.resume();tone(440);}catch{sound=false;toast('音を再生できません。');}}$('sound').textContent='音：'+(sound?'入':'切');$('sound').setAttribute('aria-pressed',String(sound));};
addEventListener('keydown',e=>{if(e.code==='Escape'){e.preventDefault();pause();return;}if(mode!=='play')return;if(e.code==='Space'&&document.activeElement.tagName==='BUTTON')return;
 if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code))e.preventDefault();keys.add(e.code);if(e.code==='Space'&&!e.repeat)jump();if(e.code==='KeyF'&&!e.repeat)interact();});
addEventListener('keyup',e=>keys.delete(e.code));
canvas.onpointerdown=e=>{if(mode!=='play')return;canvas.focus();canvas.setPointerCapture(e.pointerId);drag={id:e.pointerId,x:e.clientX,y:e.clientY};};
canvas.onpointermove=e=>{if(!drag||drag.id!==e.pointerId)return;camYaw-=(e.clientX-drag.x)*.006;camPitch=Math.max(.16,Math.min(.95,camPitch+(e.clientY-drag.y)*.004));drag.x=e.clientX;drag.y=e.clientY;};
canvas.onpointerup=()=>drag=null;canvas.onpointercancel=()=>drag=null;
canvas.onwheel=e=>{e.preventDefault();camDistance=Math.max(4,Math.min(14,camDistance+e.deltaY*.008));};
let stickId=null;
function stickMove(e){const r=$('stick').getBoundingClientRect(),dx=(e.clientX-r.left-r.width/2)/(r.width*.35),dy=(e.clientY-r.top-r.height/2)/(r.height*.35),len=Math.max(1,Math.hypot(dx,dy));stick={x:dx/len,y:dy/len};$('knob').style.transform=`translate(${stick.x*r.width*.27}px,${stick.y*r.height*.27}px)`;}
$('stick').onpointerdown=e=>{e.preventDefault();if(mode!=='play')return;stickId=e.pointerId;$('stick').setPointerCapture(e.pointerId);stickMove(e);};
$('stick').onpointermove=e=>{if(e.pointerId===stickId)stickMove(e);};
function releaseStick(){stickId=null;stick={x:0,y:0};$('knob').style.transform='translate(0,0)';}
$('stick').onpointerup=releaseStick;$('stick').onpointercancel=releaseStick;$('stick').onlostpointercapture=releaseStick;
$('dash').onpointerdown=e=>{e.preventDefault();dash=true;$('dash').setPointerCapture(e.pointerId);};$('dash').onpointerup=()=>dash=false;$('dash').onpointercancel=()=>dash=false;
addEventListener('blur',()=>{if(mode==='play')pause();});document.addEventListener('visibilitychange',()=>{if(document.hidden&&mode==='play')pause();});addEventListener('pagehide',()=>{if(mode!=='intro')saveGame(mode!=='end');});
canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();if(mode==='play')pause();toast('3D描画が中断されました。ページを再読み込みすると保存地点から再開できます。',999);});
// Return pointer users to gameplay focus after toolbar actions. Keyboard users
// can still Tab to buttons and activate them with their normal semantics.
for(const button of document.querySelectorAll('button'))button.addEventListener('click',e=>{if(mode==='play'&&e.detail>0)canvas.focus();});
if(resumeState&&canStand(resumeState.x,resumeState.z))$('resume').hidden=false;
record();hud();
function frame(now){const dt=Math.min((now-last)/1000,.05);last=now;update(dt);draw();requestAnimationFrame(frame);}requestAnimationFrame(frame);
