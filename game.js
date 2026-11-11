(() => {
  'use strict';
  const canvas = document.getElementById('scene');
  const ctx = canvas.getContext('2d');
  const $ = id => document.getElementById(id);
  const ui = {score:$('score'),speed:$('speed'),gear:$('gear'),rpmText:$('rpmText'),rpmBar:$('rpmBar'),combo:$('combo'),state:$('driftState'),best:$('best'),status:$('statusText'),start:$('startScreen'),paused:$('pausedOverlay'),help:$('helpTip')};
  const keys = Object.create(null);
  const touch = {gas:false,brake:false,left:false,right:false,handbrake:false};
  let W=0,H=0,DPR=1,now=0,last=0,active=false,paused=false,lights=true,soundOn=true,audio=null;
  let speed=0,steer=0,lateral=0,yaw=0,score=0,banked=0,combo=1,comboTime=0,distance=0,driftAmount=0,slip=0,shake=0;
  let best=Number(localStorage.getItem('yoru-best')||0), nightTint=0;
  let seed=8128;
  const rand=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296};
  const buildings=[];
  for(let i=0;i<80;i++) buildings.push({distance:i*47+rand()*30,side:i%2?1:-1,w:35+rand()*60,h:55+rand()*145,color:['#151c2d','#172137','#21172d','#17262d','#252038'][Math.floor(rand()*5)],sign:i%3===0?['歌舞伎町','ラーメン','東京','酒','ネオン'][Math.floor(rand()*5)]:null,signColor:['#fa315c','#36d6dc','#f7a94b','#a75cff'][Math.floor(rand()*4)],windows:3+Math.floor(rand()*4)});
  const lamps=[];for(let i=0;i<34;i++) lamps.push({distance:i*115+rand()*40,side:i%2?1:-1});
  const signs=[];for(let i=0;i<22;i++) signs.push({distance:i*173+50,side:i%2?-1:1,text:['峠','ドリフト','首都高','夜遊び','大黒'][i%5],color:['#ff315b','#fcae46','#25dfdf','#a36bff'][i%4]});
  const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
  const mod=(a,b)=>((a%b)+b)%b;
  function resize(){DPR=Math.min(devicePixelRatio||1,2);W=innerWidth;H=innerHeight;canvas.width=Math.floor(W*DPR);canvas.height=Math.floor(H*DPR);canvas.style.width=W+'px';canvas.style.height=H+'px';ctx.setTransform(DPR,0,0,DPR,0,0)}
  addEventListener('resize',resize,{passive:true});resize();
  function roadCurve(d){return Math.sin((distance/650)+(1-d)*2.8)*.22+Math.sin(distance/1900+(1-d)*2.1)*.13}
  function project(d){const horizon=H*.355;const y=horizon+Math.pow(d,1.72)*(H-horizon);const half=(W*.028)+Math.pow(d,1.15)*W*.39;const curve=roadCurve(d)*W;const x=W*.5+curve-lateral*half*.52;return {x,y,half}}
  function polygon(points,fill){ctx.fillStyle=fill;ctx.beginPath();ctx.moveTo(points[0][0],points[0][1]);for(let i=1;i<points.length;i++)ctx.lineTo(points[i][0],points[i][1]);ctx.closePath();ctx.fill()}
  function roundedRect(x,y,w,h,r,fill){ctx.fillStyle=fill;ctx.beginPath();ctx.roundRect(x,y,w,h,r);ctx.fill()}
  function drawSky(){
    const horizon=H*.355;const sky=ctx.createLinearGradient(0,0,0,H);sky.addColorStop(0,'#080d1b');sky.addColorStop(.42,'#17162a');sky.addColorStop(.72,'#3b1b38');sky.addColorStop(1,'#11101b');ctx.fillStyle=sky;ctx.fillRect(0,0,W,H);
    // distant skyline glow and moon haze
    const glow=ctx.createRadialGradient(W*.71,horizon*.68,2,W*.71,horizon*.68,W*.42);glow.addColorStop(0,'#ec4d6726');glow.addColorStop(1,'#ea335000');ctx.fillStyle=glow;ctx.fillRect(0,0,W,H*.6);
    for(let i=0;i<48;i++){const x=((i*173.3)%W),y=((i*41.7)%Math.max(1,horizon*.7));ctx.globalAlpha=.18+(i%4)*.06;ctx.fillStyle=i%3?'#dceaff':'#ffb6cb';ctx.fillRect(x,y,1,1)}ctx.globalAlpha=1;
    ctx.fillStyle='#0c1120';let x=-15;while(x<W){const bw=25+((x*13+W)%63),bh=horizon*(.14+((x*7+W)%47)/100);ctx.fillRect(x,horizon-bh,bw,bh+4);if(bw>40){ctx.fillStyle='#263045';ctx.fillRect(x+bw*.63,horizon-bh*.65,2,2);ctx.fillStyle='#0c1120'}x+=bw-2}
    const haze=ctx.createLinearGradient(0,horizon*.72,0,horizon+20);haze.addColorStop(0,'#ef658a00');haze.addColorStop(1,'#fa618a26');ctx.fillStyle=haze;ctx.fillRect(0,horizon*.7,W,horizon*.45);
  }
  function drawTerrain(){
    const horizon=H*.355;ctx.fillStyle='#101721';ctx.fillRect(0,horizon,W,H-horizon);
    // city-side ground with distant reflective pools
    for(let i=0;i<14;i++){const d=(i/14);const p=project(d);const y=p.y;ctx.fillStyle=i%2?'#111622':'#161923';ctx.fillRect(0,y,W,Math.max(1,H/30));}
    // Road segments
    const strips=100;for(let i=0;i<strips;i++){const d0=i/strips,d1=(i+1)/strips,p0=project(d0),p1=project(d1);if(d0===0)continue;const alt=Math.floor((distance/7)+i/4)%2;polygon([[p0.x-p0.half,p0.y],[p0.x+p0.half,p0.y],[p1.x+p1.half,p1.y],[p1.x-p1.half,p1.y]],alt?'#25252e':'#292830');
      // shoulder edge neon / wet highlights
      const edgeA=p0.half,edgeB=p1.half;polygon([[p0.x-edgeA,p0.y],[p0.x-edgeA+Math.max(1,edgeA*.012),p0.y],[p1.x-edgeB+Math.max(1,edgeB*.012),p1.y],[p1.x-edgeB,p1.y]],'#da315b');polygon([[p0.x+edgeA-Math.max(1,edgeA*.012),p0.y],[p0.x+edgeA,p0.y],[p1.x+edgeB,p1.y],[p1.x+edgeB-Math.max(1,edgeB*.012),p1.y]],'#44d4d7');
      // broken center line
      if(Math.floor((distance/9)+i/2)%6<3){const w0=Math.max(1,p0.half*.009),w1=Math.max(1,p1.half*.009);polygon([[p0.x-w0,p0.y],[p0.x+w0,p0.y],[p1.x+w1,p1.y],[p1.x-w1,p1.y]],'#dfd6bf99')}
      // lane guides
      for(const lane of [-.33,.33]){if(Math.floor((distance/9)+i/3)%8<3){const w0=Math.max(.5,p0.half*.002),w1=Math.max(.5,p1.half*.002),x0=p0.x+p0.half*lane,x1=p1.x+p1.half*lane;polygon([[x0-w0,p0.y],[x0+w0,p0.y],[x1+w1,p1.y],[x1-w1,p1.y]],'#d9d7d066')}}
    }
    // Wet road reflections, animated streaks
    for(let i=0;i<15;i++){let d=mod(i*.083+distance/830,1);if(d<.08)continue;let p=project(d),side=(i%2?1:-1),x=p.x+side*p.half*(.12+randSeed(i)*.72),len=5+d*55;ctx.globalAlpha=.04+d*.13;ctx.strokeStyle=i%3?'#ff6480':'#3be1e6';ctx.lineWidth=1+d*3;ctx.beginPath();ctx.moveTo(x,p.y);ctx.lineTo(x+side*len*.12,p.y+len);ctx.stroke()}ctx.globalAlpha=1;
  }
  function randSeed(i){return (Math.sin(i*12.98+Math.floor(distance/170)*3.1)*43758.5)%1+1}
  function objectD(objDist){return mod(objDist-distance,3760)/3760}
  function drawBuildings(){
    // far to near
    for(const b of buildings){const d=objectD(b.distance);if(d<.025||d>.99)continue;const p=project(d),scale=.12+d*1.42;const bw=b.w*scale,bh=b.h*scale;const x=p.x+b.side*(p.half+bw*.52+10*scale),y=p.y-bh;
      if(x<-bw*2||x>W+bw*2)continue;
      // glow behind illuminated sign
      ctx.fillStyle=b.color;ctx.fillRect(x-bw/2,y,bw,bh);ctx.fillStyle='#283047';ctx.fillRect(x-bw/2,y,bw,Math.max(2,2*scale));
      for(let r=0;r<b.windows;r++){const wy=y+bh*(.14+r*.16);for(let c=0;c<2;c++){ctx.globalAlpha=.4+((r+c)%2)*.24;ctx.fillStyle=(r+c)%3===0?'#ffcf76':'#6dc8d7';ctx.fillRect(x-bw*.33+c*bw*.4,wy,Math.max(1,3*scale),Math.max(1,4*scale))}}ctx.globalAlpha=1;
      if(b.sign&&scale>.24){ctx.save();ctx.shadowBlur=10*scale;ctx.shadowColor=b.signColor;ctx.fillStyle=b.signColor;ctx.fillRect(x-bw*.39,y+bh*.37,bw*.78,Math.max(6,13*scale));ctx.shadowBlur=0;ctx.fillStyle='#fff';ctx.font=`${Math.max(5,9*scale)}px sans-serif`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(b.sign,x,y+bh*.37+Math.max(3,6.5*scale));ctx.restore()}
    }
    for(const s of signs){const d=objectD(s.distance);if(d<.04||d>.94)continue;const p=project(d),scale=.17+d*1.1,x=p.x+s.side*(p.half+20*scale),y=p.y-92*scale;if(x<-50||x>W+50)continue;ctx.fillStyle='#343342';ctx.fillRect(x-2*scale,y+15*scale,4*scale,100*scale);ctx.save();ctx.shadowBlur=18*scale;ctx.shadowColor=s.color;ctx.fillStyle='#111321';ctx.fillRect(x-20*scale,y,40*scale,25*scale);ctx.strokeStyle=s.color;ctx.lineWidth=1.5*scale;ctx.strokeRect(x-20*scale,y,40*scale,25*scale);ctx.fillStyle=s.color;ctx.font=`bold ${17*scale}px sans-serif`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(s.text,x,y+12*scale);ctx.restore()}
  }
  function drawStreetLights(){for(const l of lamps){const d=objectD(l.distance);if(d<.02||d>.95)continue;const p=project(d),s=.15+d*1.35,x=p.x+l.side*(p.half+16*s),y=p.y,h=100*s;ctx.strokeStyle='#4b4c5b';ctx.lineWidth=Math.max(1,2*s);ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x,y-h);ctx.lineTo(x-l.side*12*s,y-h);ctx.stroke();const lx=x-l.side*12*s,ly=y-h;const g=ctx.createRadialGradient(lx,ly,1,lx,ly,25*s);g.addColorStop(0,'#ffdcae88');g.addColorStop(1,'#ffb95500');ctx.fillStyle=g;ctx.fillRect(lx-25*s,ly-25*s,50*s,50*s);ctx.fillStyle='#ffdcac';ctx.fillRect(lx-3*s,ly-2*s,6*s,3*s)}}
  function drawHeadlights(){if(!lights)return;const x=W*.5-lateral*W*.18,y=H*.78;const g=ctx.createRadialGradient(x,y,0,x,y-H*.38,W*.38);g.addColorStop(0,'#ffe9b619');g.addColorStop(1,'#ffe9b600');ctx.fillStyle=g;polygon([[x-W*.13,y],[x-W*.49,H*.36],[x+W*.43,H*.36],[x+W*.11,y]],g);}
  function drawCar(){
    const scale=clamp(Math.min(W/1000,H/700),.68,1.2),cx=W*.5-lateral*W*.19+Math.sin(yaw)*W*.032,cy=H*.815,carW=Math.min(245,W*.255)*scale,carH=carW*.53;ctx.save();ctx.translate(cx,cy);ctx.rotate(clamp(yaw,-.45,.45)*.55);
    // ground shadow
    ctx.fillStyle='#020308a8';ctx.beginPath();ctx.ellipse(0,carH*.4,carW*.64,carH*.28,0,0,Math.PI*2);ctx.fill();
    // tire smoke when drifting
    if(driftAmount>.18){for(let i=0;i<5;i++){const sx=(i%2?1:-1)*carW*.38,sy=carH*.25+Math.random()*carH*.15;const r=(7+Math.random()*18)*scale;ctx.globalAlpha=.08+driftAmount*.1;ctx.fillStyle='#d2d7e8';ctx.beginPath();ctx.arc(sx+(Math.random()-.5)*18*scale,sy+Math.random()*15*scale,r,0,Math.PI*2);ctx.fill()}ctx.globalAlpha=1}
    // tires
    roundedRect(-carW*.51,-carH*.05,carW*.19,carH*.36,4*scale,'#08090d');roundedRect(carW*.32,-carH*.05,carW*.19,carH*.36,4*scale,'#08090d');
    // body silhouette and hood
    polygon([[-carW*.49,carH*.2],[-carW*.45,-carH*.02],[-carW*.29,-carH*.22],[-carW*.18,-carH*.52],[carW*.18,-carH*.52],[carW*.31,-carH*.2],[carW*.46,-carH*.02],[carW*.5,carH*.2],[carW*.43,carH*.37],[-carW*.42,carH*.37]],'#b8b8b5');
    polygon([[-carW*.45,carH*.15],[-carW*.36,-carH*.08],[-carW*.21,-carH*.2],[carW*.2,-carH*.2],[carW*.37,-carH*.06],[carW*.46,carH*.16],[carW*.4,carH*.32],[-carW*.4,carH*.32]],'#e6e2d9');
    // roof glass, windshield
    polygon([[-carW*.29,-carH*.22],[-carW*.18,-carH*.49],[carW*.18,-carH*.49],[carW*.3,-carH*.21],[carW*.2,-carH*.15],[-carW*.2,-carH*.15]],'#121c2d');
    polygon([[-carW*.16,-carH*.45],[carW*.15,-carH*.45],[carW*.24,-carH*.24],[-carW*.22,-carH*.24]],'#305166');
    // windshield reflections
    ctx.strokeStyle='#a5e8f388';ctx.lineWidth=2*scale;ctx.beginPath();ctx.moveTo(-carW*.11,-carH*.43);ctx.lineTo(-carW*.2,-carH*.27);ctx.moveTo(carW*.04,-carH*.43);ctx.lineTo(-carW*.04,-carH*.25);ctx.stroke();
    // hood details and pop-up headlights
    ctx.fillStyle='#282a30';ctx.fillRect(-carW*.16,-carH*.09,carW*.32,carH*.018);ctx.fillStyle=lights?'#fff5cf':'#333';ctx.shadowBlur=lights?20*scale:0;ctx.shadowColor='#fff5bd';roundedRect(-carW*.4,carH*.015,carW*.18,carH*.095,3*scale,lights?'#fff4c9':'#34343a');roundedRect(carW*.22,carH*.015,carW*.18,carH*.095,3*scale,lights?'#fff4c9':'#34343a');ctx.shadowBlur=0;
    // front grille, bumper, lip
    roundedRect(-carW*.2,carH*.2,carW*.4,carH*.09,3*scale,'#15171c');ctx.fillStyle='#c92249';ctx.fillRect(-carW*.47,carH*.29,carW*.94,carH*.028);ctx.fillStyle='#25262b';ctx.fillRect(-carW*.45,carH*.34,carW*.9,carH*.035);
    // red tail-style marker accents and mirrors
    ctx.fillStyle='#f33a5c';ctx.fillRect(-carW*.46,carH*.19,carW*.08,carH*.035);ctx.fillRect(carW*.38,carH*.19,carW*.08,carH*.035);ctx.fillStyle='#1b1b1d';ctx.fillRect(-carW*.48,-carH*.03,carW*.09,carH*.06);ctx.fillRect(carW*.39,-carH*.03,carW*.09,carH*.06);
    // plate
    ctx.fillStyle='#f3eee1';ctx.fillRect(-carW*.12,carH*.21,carW*.24,carH*.055);ctx.fillStyle='#24252b';ctx.font=`bold ${Math.max(6,carW*.035)}px monospace`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('藤原',0,carH*.238);
    // wheel angle hint
    ctx.restore();
    // skid trails
    if(driftAmount>.42){ctx.globalAlpha=.12+driftAmount*.16;ctx.strokeStyle='#e2e4e9';ctx.lineWidth=2+driftAmount*3;ctx.beginPath();ctx.moveTo(cx-carW*.34,cy+carH*.42);ctx.lineTo(cx-carW*.34-yaw*52,H);ctx.moveTo(cx+carW*.34,cy+carH*.42);ctx.lineTo(cx+carW*.34-yaw*52,H);ctx.stroke();ctx.globalAlpha=1}
  }
  function draw(){drawSky();drawTerrain();drawBuildings();drawStreetLights();drawHeadlights();drawCar();if(shake>0){ctx.fillStyle=`rgba(255,255,255,${shake*.025})`;ctx.fillRect(0,0,W,H)}}
  function controls(){const gas=touch.gas||keys.ArrowUp||keys.KeyW||keys.Space&&false,brake=touch.brake||keys.ArrowDown||keys.KeyS,hand=touch.handbrake||keys.Space,left=touch.left||keys.ArrowLeft||keys.KeyA,right=touch.right||keys.ArrowRight||keys.KeyD;return {gas,brake,hand,left,right}}
  function update(dt){if(!active||paused)return;const c=controls();const steerInput=(c.right?1:0)-(c.left?1:0);steer+=(steerInput-steer)*Math.min(1,dt*5.5);const oldSpeed=speed;
    if(c.gas)speed+=27*dt;else speed-=5.4*dt;if(c.brake)speed-=44*dt;speed=clamp(speed,0,245);
    const speedFactor=.2+speed/190;const targetYaw=steer*speedFactor*(c.hand?1.2:.68);yaw+=(targetYaw-yaw)*Math.min(1,dt*(c.hand?2.3:4));lateral+=steer*dt*(.31+speed/210)+(c.hand?yaw*dt*.2:0);lateral*=Math.pow(.985,dt*60);lateral=clamp(lateral,-1.3,1.3);
    const desiredSlip=Math.abs(yaw)*(.35+speed/120)+(c.hand&&speed>25?.72:0);slip+=(desiredSlip-slip)*Math.min(1,dt*3.5);driftAmount=clamp((slip-.24)*2.6,0,1);distance+=speed*dt*.48;
    const drifting=driftAmount>.12&&speed>25&&Math.abs(steer)>.08;if(drifting){comboTime+=dt;combo=1+Math.min(4,Math.floor(comboTime/3)*.25);const earned=(speed*.38+Math.abs(steer)*92+ (c.hand?24:0))*driftAmount*combo*dt;score+=earned;banked+=earned;shake=Math.min(1,shake+dt*.6)}else{comboTime=Math.max(0,comboTime-dt*.72);if(comboTime<.2)combo=1;shake=Math.max(0,shake-dt*1.8)}
    if(lateral>1.02||lateral< -1.02){speed=Math.max(0,speed-24*dt);shake=Math.max(shake,.4)}
    if(score>best){best=Math.floor(score);localStorage.setItem('yoru-best',best)}
    const kmh=Math.round(speed);ui.speed.textContent=String(kmh).padStart(3,'0');ui.score.textContent=String(Math.floor(score)).padStart(6,'0');ui.best.textContent=String(Math.floor(best)).padStart(6,'0');ui.combo.textContent='x'+combo.toFixed(1);ui.gear.textContent=speed<3?'N':String(clamp(Math.floor(speed/39)+1,1,5));const rpm=speed<3?0:Math.round(900+(speed%39)/39*5200);ui.rpmText.textContent=rpm.toLocaleString('en-US')+' RPM';ui.rpmBar.style.width=clamp((rpm-700)/5800*100,0,100)+'%';ui.state.textContent=drifting?'DRIFTING · KEEP IT ALIVE':speed>5?'CRUISING · FIND YOUR ANGLE':'READY TO RUN';ui.status.textContent=drifting?'ANGLE '+Math.round(Math.abs(yaw)*64)+'° · '+Math.floor(banked)+' PTS':lights?'LIGHTS ON':'LIGHTS OFF';if(oldSpeed===0&&speed>3)playEngine();if(speed<1&&audio)stopEngine();
  }
  function loop(t){const dt=Math.min(.04,(t-last)/1000||0);last=t;now=t;update(dt);draw();requestAnimationFrame(loop)}requestAnimationFrame(loop);
  function ensureAudio(){if(!audio){try{const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return;audio=new AC();const osc=audio.createOscillator(),gain=audio.createGain(),filter=audio.createBiquadFilter();osc.type='sawtooth';osc.frequency.value=55;filter.type='lowpass';filter.frequency.value=180;gain.gain.value=0;osc.connect(filter);filter.connect(gain);gain.connect(audio.destination);osc.start();audio.engine={osc,gain,filter}}catch(e){audio=null}}if(audio?.state==='suspended')audio.resume()}
  function playEngine(){if(!soundOn)return;ensureAudio();if(audio?.engine)audio.engine.gain.gain.setTargetAtTime(.035,audio.currentTime,.12)}
  function stopEngine(){if(audio?.engine)audio.engine.gain.gain.setTargetAtTime(0,audio.currentTime,.25)}
  function toggleLight(){lights=!lights;ui.status.textContent=lights?'LIGHTS ON':'LIGHTS OFF';document.querySelector('[data-control="lights"]').classList.toggle('active',!lights)}
  function start(){active=true;paused=false;ui.start.classList.add('dismissed');ui.paused.classList.add('hidden');ui.help.style.opacity='0';ensureAudio();playEngine();setTimeout(()=>{if(ui.help)ui.help.style.display='none'},500)}
  function setPause(value){if(!active)return;paused=value;ui.paused.classList.toggle('hidden',!paused);if(paused)stopEngine();else playEngine()}
  $('startBtn').addEventListener('click',start);$('pauseBtn').addEventListener('click',()=>setPause(!paused));$('resumeBtn').addEventListener('click',()=>setPause(false));$('soundBtn').addEventListener('click',()=>{soundOn=!soundOn;$('soundBtn').innerHTML=soundOn?'♫ <span>SOUND ON</span>':'♫ <span>SOUND OFF</span>';if(!soundOn)stopEngine();else if(active&&!paused)playEngine()});
  document.querySelectorAll('[data-control]').forEach(btn=>{const type=btn.dataset.control;if(type==='lights'){btn.addEventListener('pointerdown',e=>{e.preventDefault();toggleLight()});return}const down=e=>{e.preventDefault();touch[type]=true;btn.classList.add('active');try{btn.setPointerCapture(e.pointerId)}catch(_){}};const up=e=>{e.preventDefault();touch[type]=false;btn.classList.remove('active')};btn.addEventListener('pointerdown',down);['pointerup','pointercancel','lostpointercapture'].forEach(ev=>btn.addEventListener(ev,up))});
  const keyMap={ArrowUp:true,ArrowDown:true,ArrowLeft:true,ArrowRight:true,Space:true};addEventListener('keydown',e=>{if(keyMap[e.code])e.preventDefault();keys[e.code]=true;if(e.code==='KeyL'&&!e.repeat)toggleLight();if(e.code==='Escape'||e.code==='KeyP'){if(active)setPause(!paused)}if((e.code==='Enter'||e.code==='NumpadEnter')&&!active)start()});addEventListener('keyup',e=>{keys[e.code]=false});addEventListener('blur',()=>{for(const k in keys)keys[k]=false;for(const k in touch)touch[k]=false});
  ui.best.textContent=String(best).padStart(6,'0');
})();
