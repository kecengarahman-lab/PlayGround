(() => {
  'use strict';
  const canvas = document.getElementById('game'), ctx = canvas.getContext('2d');
  const preview = document.getElementById('carPreview'), pctx = preview.getContext('2d');
  const $ = id => document.getElementById(id);
  const screens = ['menuScreen','garageScreen','settingsScreen','pauseScreen'];
  const cars = [
    {name:'KAZE R-34',cls:'STREET / AWD',desc:'Legenda jalanan dengan keseimbangan sempurna. Dibuat untuk tikungan panjang dan malam tanpa akhir.',power:92,grip:78,drift:86,color:'#35d9db',accent:'#ff416e',shape:1},
    {name:'HAYATE S-15',cls:'TOUGE / RWD',desc:'Ringan, lincah, dan hidup di setiap tikungan. Pilihan para pemburu apex di jalur gunung.',power:78,grip:72,drift:96,color:'#f0eff5',accent:'#ff4d7e',shape:0},
    {name:'AKUMA RX-7',cls:'ROTARY / RWD',desc:'Jantung rotary yang meraung di tengah malam. Mesin responsif untuk drift panjang yang presisi.',power:88,grip:69,drift:92,color:'#f4b044',accent:'#e64163',shape:2},
    {name:'RAIJIN 86',cls:'CLASSIC / RWD',desc:'Klasik yang tak pernah padam. Jinakkan tenaga liar dan jadikan setiap sudut sebagai panggung.',power:73,grip:81,drift:88,color:'#f1f0eb',accent:'#d83c54',shape:3}
  ];
  let selected=0, W=innerWidth,H=innerHeight,dpr=1,last=0,run=false,paused=false,settingsReturn='menuScreen',simTime=0, roadScroll=0, skyline=[], particles=[], toastTimer=0;
  const state={speed:0,steer:0,offset:0,score:0,drift:0,distance:0,light:true,camera:0,mission:'delivery',missionActive:false,missionProgress:0,raceTime:0,boost:0};
  const input={gas:false,brake:false,left:false,right:false,handbrake:false};
  const prefersTouch=('ontouchstart' in window)||navigator.maxTouchPoints>0;
  function resize(){W=innerWidth;H=innerHeight;dpr=Math.min(devicePixelRatio||1,1.65);canvas.width=Math.floor(W*dpr);canvas.height=Math.floor(H*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);seedCity();drawPreview();}
  function seedCity(){skyline=[];let x=-40;while(x<W+80){let w=24+Math.random()*65,h=45+Math.random()*180;skyline.push({x,w,h,seed:Math.random(),rows:Math.floor(h/13)});x+=w+3}}
  function showScreen(id){screens.forEach(s=>$(s).classList.toggle('active',s===id));}
  function updateCar(){let c=cars[selected];$('carName').textContent=c.name;$('menuCarName').textContent=c.name;$('carClass').textContent=c.cls;$('carDesc').textContent=c.desc;$('carIndex').innerHTML=`0${selected+1} <i>/ 04</i>`;$('powerNum').textContent=c.power;$('gripNum').textContent=c.grip;$('driftNum').textContent=c.drift;$('statPower').style.width=c.power+'%';$('statGrip').style.width=c.grip+'%';$('statDrift').style.width=c.drift+'%';$('carDots').innerHTML=cars.map((_,i)=>`<i class="car-dot ${i===selected?'active':''}"></i>`).join('');drawPreview()}
  function cycleCar(dir){selected=(selected+dir+cars.length)%cars.length;updateCar()}
  function startGame(){screens.forEach(s=>$(s).classList.remove('active'));$('hud').classList.remove('hidden');run=true;paused=false;state.speed=0;state.offset=0;state.steer=0;state.score=0;state.distance=0;state.mission='delivery';state.missionActive=false;state.missionProgress=0;state.raceTime=0;updateMission();showToast('SHIBUYA TERBUKA — JALANAN MENUNGGUMU');initAudio();}
  function pauseGame(){if(!run)return;paused=true;showScreen('pauseScreen')}
  function resume(){paused=false;screens.forEach(s=>$(s).classList.remove('active'))}
  function quit(){run=false;paused=false;$('hud').classList.add('hidden');showScreen('menuScreen')}
  $('startBtn').onclick=()=>showScreen('garageScreen');$('settingsBtn').onclick=()=>{settingsReturn='menuScreen';showScreen('settingsScreen')};$('exitBtn').onclick=()=>showToast('Sampai jumpa di jalanan, pembalap.');
  document.querySelectorAll('[data-back]').forEach(b=>b.onclick=()=>showScreen(b.closest('#settingsScreen')?settingsReturn:b.dataset.back));$('prevCar').onclick=()=>cycleCar(-1);$('nextCar').onclick=()=>cycleCar(1);$('driveBtn').onclick=startGame;
  $('pauseBtn').onclick=pauseGame;$('resumeBtn').onclick=resume;$('quitBtn').onclick=quit;$('pauseSettingsBtn').onclick=()=>{settingsReturn='pauseScreen';showScreen('settingsScreen')};
  $('lightBtn').onclick=()=>{state.light=!state.light;$('lightBtn').style.color=state.light?'var(--yellow)':'#858796';showToast(state.light?'LAMPU DEPAN AKTIF':'LAMPU DEPAN MATI')};
  $('cameraBtn').onclick=()=>{state.camera=(state.camera+1)%3;$('cameraBtn').textContent=['▣','◉','⌖'][state.camera];showToast(['KAMERA KEJAR','KAMERA KAP MOBIL','KAMERA JAUH'][state.camera])};
  $('missionAction').onclick=()=>{if(!state.missionActive){state.missionActive=true;state.missionProgress=0;state.raceTime=60;showToast(state.mission==='race'?'BALAPAN DIMULAI — GAS!':'PESANAN DITERIMA — IKUTI JALAN!')}else{state.mission=state.mission==='delivery'?'race':'delivery';state.missionActive=false;updateMission();showToast('KONTRAK DITUTUP')}};
  function updateMission(){
    const isRace=state.mission==='race';
    $('missionType').textContent=isRace?'TANTANGAN DARI REN':'PESANAN DARI AKI';
    $('missionTitle').textContent=isRace?'SPRINT SHIBUYA':'ANTAR SUKU CADANG';
    $('missionHint').textContent=state.missionActive ? (isRace ? `Selesaikan sebelum ${Math.ceil(state.raceTime)} dtk` : `Jarak tersisa: ${Math.max(0,Math.ceil(500-state.missionProgress))} m`) : 'Cari penanda kuning di jalan';
    $('missionAction').innerHTML=state.missionActive?'BATAL <b>×</b>' : (isRace?'BALAP <b>↗</b>':'AMBIL <b>↗</b>');
    $('routeName').textContent=state.missionActive ? (isRace?'SPRINT SHIBUYA':'KURIR TENGAH MALAM') : 'NEON DISTRICT';
    $('routeDistance').textContent=state.missionActive ? (isRace?`${Math.ceil(state.raceTime)} DETIK TERSISA`:`${Math.max(0,Math.ceil(500-state.missionProgress))} M MENUJU TUJUAN`) : 'FREE ROAM · NIGHT DRIVE';
  }
  function showToast(msg){let t=$('toast');t.textContent=msg;t.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.classList.remove('show'),2100)}
  function bindControl(el,key){const on=e=>{e.preventDefault();input[key]=true;el.classList.add('pressed');try{el.setPointerCapture(e.pointerId)}catch(_){}};const off=e=>{e.preventDefault();input[key]=false;el.classList.remove('pressed')};el.addEventListener('pointerdown',on);['pointerup','pointercancel','lostpointercapture','pointerleave'].forEach(ev=>el.addEventListener(ev,off))}
  document.querySelectorAll('[data-control]').forEach(el=>bindControl(el,el.dataset.control));
  const keyMap={ArrowUp:'gas',KeyW:'gas',ArrowDown:'brake',KeyS:'brake',ArrowLeft:'left',KeyA:'left',ArrowRight:'right',KeyD:'right',Space:'handbrake'};
  addEventListener('keydown',e=>{if(keyMap[e.code]){input[keyMap[e.code]]=true;e.preventDefault()}if(e.code==='Escape'&&run){paused?resume():pauseGame()}if(e.code==='KeyC'&&run)$('cameraBtn').click();if(e.code==='KeyL'&&run)$('lightBtn').click()});
  addEventListener('keyup',e=>{if(keyMap[e.code])input[keyMap[e.code]]=false});
  $('brightness').oninput=e=>{let v=+e.target.value;$('brightnessValue').textContent=v+'%';document.documentElement.style.setProperty('--brightness',v/100);canvas.style.filter=`brightness(${v/100})`};
  $('volume').oninput=e=>$('volumeValue').textContent=e.target.value+'%';
  $('quality').onchange=e=>{dpr=Math.min(devicePixelRatio||1,e.target.value==='high'?2:e.target.value==='balanced'?1.35:1);resize()};
  function initAudio(){if(!window.AudioContext&&!window.webkitAudioContext)return;try{if(!audio){audio=new (window.AudioContext||window.webkitAudioContext)();osc=audio.createOscillator();gain=audio.createGain();osc.type='sawtooth';osc.frequency.value=45;gain.gain.value=0;osc.connect(gain);gain.connect(audio.destination);osc.start()}if(audio.state==='suspended')audio.resume()}catch(_){}}
  let audio=null,osc=null,gain=null;
  function audioTick(){if(!audio||!osc)return;let vol=(+$('volume').value/100)*.022;gain.gain.setTargetAtTime(run&&!paused?vol:0,audio.currentTime,.12);osc.frequency.setTargetAtTime(38+state.speed*1.12,audio.currentTime,.08)}
  function update(dt){simTime+=dt;let accelerating=input.gas, braking=input.brake;let max=selected===0?190:selected===1?174:selected===2?184:160;
    if(accelerating)state.speed+=68*dt;else state.speed-=17*dt;if(braking)state.speed-=94*dt;if(input.handbrake)state.speed-=24*dt;state.speed=Math.max(0,Math.min(max,state.speed));
    let target=(input.left?-1:0)+(input.right?1:0);state.steer+=(target-state.steer)*Math.min(1,dt*7);let handling=cars[selected].grip/78;state.offset+=state.steer*dt*(.68+state.speed/160)*handling;state.offset*=Math.pow(.985,dt*60);state.offset=Math.max(-1.3,Math.min(1.3,state.offset));
    let drifting=(input.handbrake||Math.abs(state.steer)>.52)&&state.speed>35;if(drifting){state.drift=Math.min(1,state.drift+dt*1.5);let points=Math.floor((state.speed/7)*Math.abs(state.steer)*dt*10);state.score+=points;state.boost=Math.min(1,state.boost+dt*.17)}else{state.drift=Math.max(0,state.drift-dt*1.8);state.boost=Math.max(0,state.boost-dt*.3)}
    let km=state.speed/3.6;state.distance+=km*dt;roadScroll+=state.speed*dt*.009; if(state.missionActive){state.missionProgress+=km*dt;if(state.mission==='race'){state.raceTime-=dt;if(state.raceTime<=0){state.missionActive=false;showToast('WAKTU HABIS — COBA LAGI!')}else if(state.missionProgress>850){state.missionActive=false;state.score+=2500;showToast('MENANG! +2500 POIN BONUS')}}else if(state.missionProgress>500){state.missionActive=false;state.score+=1200;showToast('PESANAN TERANTAR — +1200 POIN');state.mission='race'}updateMission()}
    $('speed').textContent=String(Math.round(state.speed)).padStart(3,'0');$('gear').textContent=state.speed<35?'1':state.speed<70?'2':state.speed<115?'3':state.speed<155?'4':'5';$('score').textContent=String(state.score).padStart(5,'0');$('driftFill').style.width=Math.round(state.drift*100)+'%';audioTick();
  }
  function polygon(points,fill,stroke=null,lw=1){ctx.beginPath();ctx.moveTo(points[0][0],points[0][1]);for(let i=1;i<points.length;i++)ctx.lineTo(points[i][0],points[i][1]);ctx.closePath();ctx.fillStyle=fill;ctx.fill();if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=lw;ctx.stroke()}}
  function drawBuilding(b){let base=H*.49;let h=Math.min(b.h,H*.33);let x=b.x;let w=b.w;ctx.fillStyle='#111526';ctx.fillRect(x,base-h,w,h);ctx.fillStyle='rgba(68,79,107,.24)';ctx.fillRect(x+w*.12,base-h+8,w*.08,h-10);ctx.fillStyle=b.seed>.5?'rgba(75,218,228,.6)':'rgba(255,66,119,.58)';ctx.fillRect(x+w*.1,base-h+5,Math.min(2,w*.1),h*.3);for(let r=0;r<b.rows;r++){for(let c=0;c<Math.floor(w/11);c++){let n=Math.sin((r+1)*42+(c+1)*11+b.seed*100);if(n>.42){ctx.fillStyle=(n>.79?'rgba(255,199,112,.82)':b.seed>.5?'rgba(77,213,225,.55)':'rgba(255,73,125,.52)');ctx.fillRect(x+5+c*11,base-h+12+r*13,3,5)}}}if(b.seed>.57&&w>42){ctx.strokeStyle='rgba(255,65,123,.7)';ctx.lineWidth=1;ctx.strokeRect(x+w*.18,base-h+17,w*.58,16);ctx.fillStyle='rgba(255,85,140,.9)';ctx.font=`bold ${Math.max(7,Math.min(10,w*.16))}px sans-serif`;ctx.fillText('ラーメン',x+w*.21,base-h+28)}}
  function drawRoad(){let horizon=H*.48,cx=W*.5-state.offset*W*.105;let roadTop=Math.max(40,W*.075),roadBottom=W*.97;ctx.fillStyle='#181a2c';ctx.fillRect(0,horizon,W,H-horizon);polygon([[cx-roadTop,horizon],[cx+roadTop,horizon],[cx+roadBottom,H],[cx-roadBottom,H]],'#292a36');polygon([[cx-roadTop,horizon],[cx-roadTop+4,horizon],[cx-roadBottom+6,H],[cx-roadBottom-8,H]],'#ec3d70');polygon([[cx+roadTop-4,horizon],[cx+roadTop,horizon],[cx+roadBottom+8,H],[cx+roadBottom-6,H]],'#54d9d5');
    let count=16;for(let i=0;i<count;i++){let p=((i/count+roadScroll)%1);let y=horizon+(H-horizon)*p*p;let z=(y-horizon)/(H-horizon);let half=roadTop+(roadBottom-roadTop)*z;let dash=((i+Math.floor(roadScroll*8))%2===0);if(dash){let dashH=2+z*28;let laneW=1+z*3;for(let lane=-1;lane<=1;lane++){if(lane===0)continue;let lx=cx+half*lane*.5;ctx.fillStyle=`rgba(240,232,218,${.35+z*.55})`;ctx.fillRect(lx-laneW/2,y,laneW,dashH)}}}
    // roadside lamps and repeating shop signs
    for(let i=0;i<8;i++){let p=((i/8+roadScroll*.21)%1);let z=p*p,y=horizon+(H-horizon)*z,half=roadTop+(roadBottom-roadTop)*z;let side=i%2?1:-1;let x=cx+side*(half+8+z*18);let height=10+z*115;ctx.strokeStyle=`rgba(136,178,202,${.25+z*.6})`;ctx.lineWidth=1+z*2;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x,y-height);ctx.lineTo(x+side*height*.11,y-height);ctx.stroke();ctx.fillStyle=state.light?'rgba(255,228,167,.85)':'rgba(255,228,167,.25)';ctx.shadowColor='#ffe6af';ctx.shadowBlur=5*z;ctx.fillRect(x-2*z,y-height-2*z,4*z+1,2*z+1);ctx.shadowBlur=0;if(i%3===0){ctx.fillStyle=z>.3?'rgba(243,45,103,.88)':'rgba(243,45,103,.38)';ctx.fillRect(x+side*4*z,y-height*.72,9*z+2,21*z);ctx.fillStyle='#ffeef5';ctx.font=`bold ${Math.max(4,5+z*6)}px sans-serif`;ctx.fillText('DRIFT',x+side*4*z+1,y-height*.72+9*z)}}
    // distant mountains and skyline
    let g=ctx.createLinearGradient(0,horizon-150,0,horizon+30);g.addColorStop(0,'#14172a');g.addColorStop(1,'#28273d');polygon([[0,horizon],[0,horizon-55],[W*.1,horizon-83],[W*.2,horizon-45],[W*.32,horizon-108],[W*.44,horizon-42],[W*.57,horizon-89],[W*.7,horizon-50],[W*.82,horizon-100],[W,horizon-32],[W,horizon]],g);
    skyline.forEach(b=>drawBuilding(b));
    // distant sign/arcade portal
    let gx=W*.5-state.offset*W*.04,gy=horizon-20;ctx.strokeStyle='rgba(255,70,128,.72)';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(gx-58,gy);ctx.lineTo(gx-58,gy-39);ctx.quadraticCurveTo(gx,gy-56,gx+58,gy-39);ctx.lineTo(gx+58,gy);ctx.stroke();ctx.fillStyle='rgba(255,83,139,.8)';ctx.font='bold 9px sans-serif';ctx.textAlign='center';ctx.fillText('渋谷',gx,gy-34);ctx.textAlign='left';
  }
  function drawCar(g,x,y,w,c,angle=0){g.save();g.translate(x,y);g.rotate(angle);g.shadowColor='rgba(0,0,0,.7)';g.shadowBlur=w*.2;g.fillStyle='rgba(0,0,0,.45)';g.beginPath();g.ellipse(0,w*.03,w*.63,w*.2,0,0,Math.PI*2);g.fill();g.shadowBlur=0;
    // tires
    g.fillStyle='#090b10';g.fillRect(-w*.48,-w*.16,w*.15,w*.34);g.fillRect(w*.33,-w*.16,w*.15,w*.34);
    // sculpted body
    g.beginPath();g.moveTo(-w*.43,w*.2);g.lineTo(-w*.49,-w*.03);g.lineTo(-w*.36,-w*.25);g.lineTo(-w*.25,-w*.42);g.quadraticCurveTo(0,-w*.51,w*.25,-w*.42);g.lineTo(w*.37,-w*.22);g.lineTo(w*.49,-w*.03);g.lineTo(w*.43,w*.2);g.quadraticCurveTo(0,w*.29,-w*.43,w*.2);g.closePath();g.fillStyle=c.color;g.fill();g.strokeStyle='rgba(255,255,255,.55)';g.lineWidth=Math.max(1,w*.012);g.stroke();
    g.beginPath();g.moveTo(-w*.28,-w*.27);g.quadraticCurveTo(0,-w*.38,w*.28,-w*.27);g.lineTo(w*.2,-w*.1);g.lineTo(-w*.2,-w*.1);g.closePath();g.fillStyle='#172332';g.fill();g.strokeStyle='rgba(120,226,231,.55)';g.stroke();g.fillStyle='rgba(150,217,225,.48)';g.fillRect(-w*.015,-w*.34,w*.03,w*.23);
    g.fillStyle=c.accent;g.fillRect(-w*.4,w*.1,w*.19,w*.045);g.fillRect(w*.21,w*.1,w*.19,w*.045);g.fillStyle='#f9f4e3';g.fillRect(-w*.33,-w*.29,w*.1,w*.04);g.fillRect(w*.23,-w*.29,w*.1,w*.04);g.fillStyle='#171821';g.fillRect(-w*.5,w*.02,w*.08,w*.15);g.fillRect(w*.42,w*.02,w*.08,w*.15);
    // hood highlights & grille
    g.strokeStyle='rgba(255,255,255,.28)';g.beginPath();g.moveTo(-w*.33,-w*.04);g.lineTo(-w*.18,-w*.24);g.moveTo(w*.33,-w*.04);g.lineTo(w*.18,-w*.24);g.stroke();g.fillStyle='#11121a';g.fillRect(-w*.11,-w*.04,w*.22,w*.07);
    if(state.light&&run){g.globalAlpha=.16;g.fillStyle='#fff0bb';g.beginPath();g.moveTo(-w*.31,-w*.3);g.lineTo(-w*.58,-w*1.45);g.lineTo(-w*.13,-w*1.45);g.lineTo(-w*.2,-w*.3);g.fill();g.beginPath();g.moveTo(w*.31,-w*.3);g.lineTo(w*.58,-w*1.45);g.lineTo(w*.13,-w*1.45);g.lineTo(w*.2,-w*.3);g.fill()}
    g.restore()}
  function drawParticles(){if(state.drift>0.15&&state.speed>40){for(let i=0;i<2;i++)particles.push({x:W*.5+(Math.random()-.5)*W*.08,y:H*.87+Math.random()*20,v:20+Math.random()*55,a:.45,sz:2+Math.random()*5})}for(let i=particles.length-1;i>=0;i--){let p=particles[i];p.y+=p.v*.016;p.a-=.011;p.x+=(Math.random()-.5)*.8;if(p.a<=0){particles.splice(i,1);continue}ctx.fillStyle=`rgba(225,229,236,${p.a})`;ctx.beginPath();ctx.arc(p.x,p.y,p.sz,0,Math.PI*2);ctx.fill()}}
  function render(){ctx.clearRect(0,0,W,H);let night=ctx.createLinearGradient(0,0,0,H);night.addColorStop(0,'#090d1c');night.addColorStop(.46,'#25243a');night.addColorStop(1,'#131522');ctx.fillStyle=night;ctx.fillRect(0,0,W,H);ctx.fillStyle='rgba(241,219,192,.65)';ctx.beginPath();ctx.arc(W*.77,H*.17,Math.min(W,H)*.035,0,Math.PI*2);ctx.fill();ctx.fillStyle='rgba(9,12,25,.75)';ctx.beginPath();ctx.arc(W*.785,H*.16,Math.min(W,H)*.033,0,Math.PI*2);ctx.fill();
    drawRoad();let c=cars[selected],carX=W*.5+state.offset*W*.16,carY=H*(state.camera===1?.85:.86),cw=Math.min(W*.25,210)*(state.camera===2?.77:1);if(run&&state.camera===1){ctx.fillStyle='rgba(10,12,18,.8)';ctx.fillRect(0,H*.76,W,H*.24);drawCar(ctx,carX,carY,cw*.75,c,state.steer*.16)}else drawCar(ctx,carX,carY,cw,c,state.steer*.16);
    if(state.light&&run){let grad=ctx.createRadialGradient(carX,H*.65,10,carX,H*.59,H*.6);grad.addColorStop(0,'rgba(249,231,173,.075)');grad.addColorStop(1,'rgba(249,231,173,0)');ctx.fillStyle=grad;ctx.fillRect(0,H*.4,W,H*.6)}drawParticles();
    // speed streaks while moving fast
    if(run&&state.speed>125){ctx.strokeStyle=`rgba(134,219,239,${Math.min(.2,(state.speed-125)/400)})`;for(let i=0;i<12;i++){let x=(i*173+simTime*170)%W,y=H*.48+(i*83%Math.floor(H*.5));ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+(x<W/2?-1:1)*12,y+30);ctx.stroke()}}
  }
  function drawPreview(){if(!pctx)return;let w=preview.width,h=preview.height;pctx.clearRect(0,0,w,h);let gr=pctx.createLinearGradient(0,0,0,h);gr.addColorStop(0,'rgba(14,18,32,0)');gr.addColorStop(1,'rgba(19,22,37,.9)');pctx.fillStyle=gr;pctx.fillRect(0,0,w,h);pctx.strokeStyle='rgba(81,221,222,.25)';pctx.beginPath();pctx.moveTo(20,h*.85);pctx.lineTo(w-20,h*.85);pctx.stroke();let c=cars[selected];pctx.save();pctx.translate(w*.5,h*.65);pctx.scale(1.75,1.15);pctx.rotate(-.05);pctx.fillStyle='rgba(255,61,119,.18)';pctx.beginPath();pctx.ellipse(0,42,180,29,0,0,Math.PI*2);pctx.fill();pctx.restore();drawCar(pctx,w*.5,h*.69,280,c,-.045);pctx.fillStyle='rgba(255,255,255,.35)';pctx.font='700 10px sans-serif';pctx.textAlign='left';pctx.fillText('YORU MOTOR WORKS',20,h-18);}
  function frame(t){let dt=Math.min(.04,(t-last)/1000||0);last=t;if(run&&!paused)update(dt);else{simTime+=dt;roadScroll+=dt*.15}render();requestAnimationFrame(frame)}
  addEventListener('resize',resize);updateCar();if(prefersTouch){document.querySelector('.key-hint').style.display='none'}resize();requestAnimationFrame(frame);
})();
