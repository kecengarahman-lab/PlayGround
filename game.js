(() => {
  'use strict';
  const canvas = document.getElementById('gameCanvas');
  const ctx = canvas.getContext('2d');
  const $ = id => document.getElementById(id);
  const cars = [
    { name: 'SILVIA S15', specs: 'RWD · 2.0 TURBO · 320 HP', color: '#e9e9df', accent: '#a4f52d', power: 1.02, grip: 1.0 },
    { name: 'RX-7 FD', specs: 'RWD · 1.3 ROTARY · 350 HP', color: '#fa594b', accent: '#ffd057', power: 1.1, grip: .92 },
    { name: 'AE86 TRUENO', specs: 'RWD · 1.6 NA · 210 HP', color: '#f0f0eb', accent: '#ef5b4c', power: .88, grip: 1.12 },
    { name: 'SKYLINE R34', specs: 'AWD · 2.6 TWIN TURBO · 400 HP', color: '#4d91e9', accent: '#b5e3ff', power: 1.18, grip: .9 }
  ];
  const world = { rx: 610, ry: 355, road: 248 };
  let carIndex = 0, running = false, paused = false, started = false;
  let width = 0, height = 0, dpr = 1, last = 0, score = 0, combo = 1, bestCombo = 1, angleTime = 0, sessionTime = 90;
  let toastTimer = 0, audioCtx = null, engineOsc = null, soundOn = false;
  const keys = Object.create(null), touch = { left: false, right: false, gas: false, handbrake: false };
  const car = { x: 0, y: world.ry, vx: 0, vy: 0, heading: 0, steer: 0, speed: 0, drift: 0 };
  const camera = { x: car.x, y: car.y };
  const dust = [];
  let best = Number(localStorage.getItem('neonslide-best') || 0);

  function resize() {
    const rect = canvas.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = Math.max(1, rect.width); height = Math.max(1, rect.height);
    canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  window.addEventListener('resize', resize); resize();

  function updateCarInfo() {
    const c = cars[carIndex];
    $('carName').textContent = c.name; $('carSpecs').textContent = c.specs; $('sideCar').textContent = c.name;
  }
  $('prevCar').addEventListener('click', () => { carIndex = (carIndex + cars.length - 1) % cars.length; updateCarInfo(); });
  $('nextCar').addEventListener('click', () => { carIndex = (carIndex + 1) % cars.length; updateCarInfo(); });
  $('bestScore').textContent = String(best).padStart(6, '0');

  function reset() {
    score = 0; combo = 1; bestCombo = 1; angleTime = 0; sessionTime = 90;
    car.x = 0; car.y = world.ry; car.vx = 0; car.vy = 0; car.heading = 0; car.steer = 0; car.speed = 0; car.drift = 0;
    camera.x = car.x; camera.y = car.y;
    $('scoreValue').textContent = '000000'; $('comboBadge').textContent = 'x1.0'; $('comboText').textContent = 'BUILD YOUR LINE';
    $('driftIndicator').classList.remove('active'); $('overlay').classList.add('hidden'); $('pauseOverlay').classList.add('hidden'); $('resultOverlay').classList.add('hidden');
    paused = false; running = true; started = true;
    $('sessionLabel').textContent = 'FREE RUN'; $('pauseBtn').style.visibility = 'visible';
    last = performance.now(); requestAnimationFrame(loop);
  }
  $('startBtn').addEventListener('click', reset);
  $('againBtn').addEventListener('click', reset);
  $('pauseBtn').addEventListener('click', () => {
    if (!started || !running) return;
    paused = true; running = false; $('pauseOverlay').classList.remove('hidden');
  });
  $('resumeBtn').addEventListener('click', () => { paused = false; running = true; $('pauseOverlay').classList.add('hidden'); last = performance.now(); requestAnimationFrame(loop); });
  $('restartBtn').addEventListener('click', reset);

  window.addEventListener('keydown', e => {
    if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' '].includes(e.key)) e.preventDefault();
    keys[e.key.toLowerCase()] = true;
    if (e.key === 'Escape' && running) $('pauseBtn').click();
  });
  window.addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; });
  window.addEventListener('blur', () => { Object.keys(keys).forEach(k => keys[k] = false); Object.keys(touch).forEach(k => touch[k] = false); });
  document.querySelectorAll('[data-control]').forEach(btn => {
    const name = btn.dataset.control;
    const press = e => { e.preventDefault(); touch[name] = true; btn.classList.add('pressed'); if (btn.setPointerCapture && e.pointerId != null) btn.setPointerCapture(e.pointerId); };
    const release = e => { e.preventDefault(); touch[name] = false; btn.classList.remove('pressed'); };
    btn.addEventListener('pointerdown', press); btn.addEventListener('pointerup', release); btn.addEventListener('pointercancel', release); btn.addEventListener('lostpointercapture', release);
  });

  $('soundBtn').addEventListener('click', () => {
    soundOn = !soundOn; $('soundIcon').textContent = soundOn ? '♫' : '♪'; $('soundBtn').style.color = soundOn ? 'var(--lime)' : '#858d97';
    if (soundOn) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) { audioCtx = audioCtx || new AC(); audioCtx.resume(); if (!engineOsc) { engineOsc = audioCtx.createOscillator(); const gain = audioCtx.createGain(); gain.gain.value = .018; engineOsc.type = 'sawtooth'; engineOsc.frequency.value = 58; engineOsc.connect(gain); gain.connect(audioCtx.destination); engineOsc.start(); engineOsc.gainNode = gain; } }
    } else if (engineOsc && audioCtx) { engineOsc.gainNode.gain.setTargetAtTime(0, audioCtx.currentTime, .05); }
  });

  function inputs() {
    const left = keys.a || keys.arrowleft || touch.left, right = keys.d || keys.arrowright || touch.right;
    return { steer: (right ? 1 : 0) - (left ? 1 : 0), gas: keys.w || keys.arrowup || touch.gas, brake: keys.s || keys.arrowdown, handbrake: keys[' '] || touch.handbrake };
  }
  function trackDistance(x, y) {
    const t = Math.atan2(y / world.ry, x / world.rx);
    const px = world.rx * Math.cos(t), py = world.ry * Math.sin(t);
    return Math.hypot(x - px, y - py);
  }
  function update(dt) {
    const input = inputs(), spec = cars[carIndex], speedBefore = Math.hypot(car.vx, car.vy);
    sessionTime -= dt;
    if (sessionTime <= 0) { finishRun(); return; }
    const forwardX = Math.cos(car.heading), forwardY = Math.sin(car.heading);
    const forwardSpeed = car.vx * forwardX + car.vy * forwardY;
    const sideSpeed = car.vx * -forwardY + car.vy * forwardX;
    const gas = input.gas ? 1 : 0, brake = input.brake ? 1 : 0;
    const accel = 360 * spec.power;
    car.vx += forwardX * (gas * accel - brake * 230 - (forwardSpeed > 0 ? 35 : -35)) * dt;
    car.vy += forwardY * (gas * accel - brake * 230 - (forwardSpeed > 0 ? 35 : -35)) * dt;
    const speedFactor = Math.min(speedBefore / 60, 1.35);
    const handbrake = input.handbrake;
    const maxTurn = handbrake ? 2.35 : 1.72;
    const steeringTarget = input.steer * maxTurn * speedFactor * (forwardSpeed >= 0 ? 1 : -1);
    car.steer += (steeringTarget - car.steer) * Math.min(1, dt * 7);
    car.heading += car.steer * dt;
    const fx = Math.cos(car.heading), fy = Math.sin(car.heading);
    const forward = car.vx * fx + car.vy * fy, lateral = car.vx * -fy + car.vy * fx;
    const grip = handbrake ? .993 : Math.max(.80, .91 + (1 - spec.grip) * .1);
    const lateralNew = lateral * Math.pow(grip, dt * 60);
    const forwardNew = forward * Math.pow(.996, dt * 60);
    car.vx = fx * forwardNew - fy * lateralNew; car.vy = fy * forwardNew + fx * lateralNew;
    car.x += car.vx * dt; car.y += car.vy * dt;
    const distance = trackDistance(car.x, car.y), half = world.road / 2;
    const offroad = distance > half - 8;
    if (distance > half + 20) {
      const t = Math.atan2(car.y / world.ry, car.x / world.rx), nx = Math.cos(t), ny = Math.sin(t);
      car.x -= nx * (distance - half - 20) * .2; car.y -= ny * (distance - half - 20) * .2;
      car.vx *= .94; car.vy *= .94;
    }
    car.speed = Math.hypot(car.vx, car.vy);
    const velAngle = car.speed > 2 ? Math.atan2(car.vy, car.vx) : car.heading;
    let slip = Math.atan2(Math.sin(velAngle - car.heading), Math.cos(velAngle - car.heading));
    if (car.speed < 17) slip = 0;
    car.drift = slip;
    const drifting = Math.abs(slip) > .20 && car.speed > 35 && !offroad;
    if (drifting) {
      angleTime += dt; combo = Math.min(5, combo + dt * .20); bestCombo = Math.max(bestCombo, combo);
      const angleFactor = Math.min(Math.abs(slip) / .72, 1.7), speedFactorScore = Math.min(car.speed / 125, 1.45);
      score += Math.round((angleFactor * speedFactorScore * combo * 72 + (handbrake ? 8 : 0)) * dt);
      $('driftIndicator').classList.add('active'); $('comboText').textContent = slip > 0 ? 'LEFT HAND STYLE' : 'RIGHT HAND STYLE';
      if (Math.random() < .35) dust.push({x:car.x - fx * 27, y:car.y - fy * 27, life:.6, size:7 + Math.random()*8});
    } else {
      $('driftIndicator').classList.remove('active');
      combo = Math.max(1, combo - dt * 1.5);
      $('comboText').textContent = combo > 1.05 ? 'HOLD THAT COMBO' : 'BUILD YOUR LINE';
    }
    if (offroad && speedBefore > 55) { car.vx *= .985; car.vy *= .985; }
    camera.x += (car.x - camera.x) * Math.min(1, dt * 5); camera.y += (car.y - camera.y) * Math.min(1, dt * 5);
    $('scoreValue').textContent = String(Math.floor(score)).padStart(6, '0');
    $('comboBadge').textContent = 'x' + combo.toFixed(1);
    $('sessionLabel').textContent = 'RUN · ' + Math.ceil(sessionTime) + 's';
    $('speedValue').textContent = String(Math.round(car.speed * .72)).padStart(3, '0');
    $('speedBar').style.width = Math.min(100, car.speed / 2.1) + '%';
    if (toastTimer > 0) { toastTimer -= dt; if (toastTimer <= 0) $('toast').classList.remove('show'); }
    if (audioCtx && engineOsc && soundOn) engineOsc.frequency.setTargetAtTime(48 + car.speed * .42 + (gas ? 20 : 0), audioCtx.currentTime, .08);
    dust.forEach(p => p.life -= dt); while (dust.length && dust[0].life <= 0) dust.shift();
  }

  function render(now) {
    const sx = Math.min(width / 1460, height / 1040), ox = width / 2 - camera.x * sx, oy = height / 2 - camera.y * sx;
    ctx.clearRect(0,0,width,height); ctx.save(); ctx.translate(ox,oy); ctx.scale(sx,sx);
    drawGround(now); drawTrack(now); drawDust(); drawCar(); ctx.restore();
  }
  function drawGround(now) {
    ctx.fillStyle = '#28302e'; ctx.fillRect(-2400,-1800,4800,3600);
    // Quiet harbor blocks beyond the circuit.
    ctx.save(); ctx.globalAlpha=.32;
    for (let x=-1800;x<1800;x+=185) for (let y=-1300;y<1300;y+=145) {
      if (Math.abs(x)<940 && Math.abs(y)<680) continue;
      ctx.fillStyle = ((x/185+y/145)%2>0) ? '#39403c':'#242c2b'; ctx.fillRect(x+12,y+10,155,112);
      ctx.fillStyle='#748079'; ctx.globalAlpha=.18; ctx.fillRect(x+23,y+22,48,3); ctx.fillRect(x+23,y+33,80,2); ctx.globalAlpha=.32;
    }
    ctx.restore();
    // Concrete apron and faint parking marks
    ctx.save(); ctx.strokeStyle='#c9d0c4'; ctx.globalAlpha=.12; ctx.lineWidth=2;
    for(let i=-5;i<=5;i++){ctx.beginPath();ctx.moveTo(i*150,-820);ctx.lineTo(i*150,820);ctx.stroke();}
    ctx.restore();
    ctx.fillStyle='#d9dfcf'; ctx.globalAlpha=.4; ctx.font='bold 22px monospace'; ctx.fillText('港湾 / DOCKSIDE',-970,-720); ctx.globalAlpha=1;
  }
  function drawTrack(now) {
    const {rx,ry,road}=world;
    // outer safety zone
    ctx.beginPath();ctx.ellipse(0,0,rx+road/2+27,ry+road/2+27,0,0,Math.PI*2);ctx.strokeStyle='#121717';ctx.lineWidth=18;ctx.stroke();
    ctx.beginPath();ctx.ellipse(0,0,rx,ry,0,0,Math.PI*2);ctx.strokeStyle='#7d817d';ctx.lineWidth=road+22;ctx.stroke();
    ctx.beginPath();ctx.ellipse(0,0,rx,ry,0,0,Math.PI*2);ctx.strokeStyle='#343a3b';ctx.lineWidth=road;ctx.stroke();
    // asphalt bands
    ctx.beginPath();ctx.ellipse(0,0,rx,ry,0,0,Math.PI*2);ctx.strokeStyle='#414748';ctx.lineWidth=road-34;ctx.stroke();
    ctx.beginPath();ctx.ellipse(0,0,rx,ry,0,0,Math.PI*2);ctx.strokeStyle='#33393a';ctx.lineWidth=road-44;ctx.stroke();
    // curb striping
    for (const offset of [-road/2+12,road/2-12]) {
      ctx.beginPath();ctx.ellipse(0,0,rx,ry,0,0,Math.PI*2);ctx.strokeStyle='#d4d3c5';ctx.lineWidth=19;ctx.setLineDash([25,20]);ctx.lineDashOffset=-(now*.055%45);ctx.stroke();ctx.setLineDash([]);
      ctx.beginPath();ctx.ellipse(0,0,rx,ry,0,0,Math.PI*2);ctx.strokeStyle='#db4e3f';ctx.lineWidth=19;ctx.setLineDash([25,20]);ctx.lineDashOffset=22-(now*.055%45);ctx.stroke();ctx.setLineDash([]);
      break;
    }
    // racing line markers and lane dashes
    ctx.beginPath();ctx.ellipse(0,0,rx,ry,0,0,Math.PI*2);ctx.strokeStyle='#c5c7bc';ctx.globalAlpha=.42;ctx.lineWidth=2;ctx.setLineDash([20,34]);ctx.stroke();ctx.setLineDash([]);ctx.globalAlpha=1;
    // infield: dock plaza with center island and service sheds
    ctx.beginPath();ctx.ellipse(0,0,rx-road/2+3,ry-road/2+3,0,0,Math.PI*2);ctx.fillStyle='#252d2a';ctx.fill();
    ctx.beginPath();ctx.ellipse(0,0,rx-road/2+3,ry-road/2+3,0,0,Math.PI*2);ctx.strokeStyle='#b5b7a9';ctx.lineWidth=4;ctx.stroke();
    ctx.save();ctx.translate(-90,-35);ctx.rotate(-.08);
    ctx.fillStyle='#323a39';ctx.fillRect(-115,-57,230,114);ctx.strokeStyle='#57605b';ctx.lineWidth=3;ctx.strokeRect(-115,-57,230,114);
    ctx.fillStyle='#a7c7af';ctx.globalAlpha=.45;ctx.fillRect(-99,-42,70,21);ctx.fillRect(22,-42,70,21);ctx.globalAlpha=1;
    ctx.fillStyle='#46504b';ctx.fillRect(-17,-56,34,112);ctx.fillStyle='#d8ff3e';ctx.globalAlpha=.75;ctx.font='bold 11px monospace';ctx.fillText('PIT / SERVICE',-46,8);ctx.restore();
    // start grid at the east curve
    ctx.save();ctx.translate(rx,0);ctx.rotate(Math.PI/2);for(let i=0;i<8;i++){ctx.fillStyle=i%2?'#15191a':'#dce0d4';ctx.fillRect(-16,-world.road/2+i*31,32,31);}ctx.restore();
    // roadside lamps
    for(let i=0;i<32;i++) {const a=i*Math.PI/16, x=(rx+road/2+40)*Math.cos(a),y=(ry+road/2+40)*Math.sin(a);ctx.save();ctx.globalAlpha=.68;ctx.fillStyle='#d8ff3e';ctx.shadowColor='#d8ff3e';ctx.shadowBlur=14;ctx.beginPath();ctx.arc(x,y,4,0,Math.PI*2);ctx.fill();ctx.restore();}
    // barriers around outer edge
    ctx.beginPath();ctx.ellipse(0,0,rx+road/2+22,ry+road/2+22,0,0,Math.PI*2);ctx.strokeStyle='#d2d3c9';ctx.lineWidth=5;ctx.stroke();
    ctx.beginPath();ctx.ellipse(0,0,rx+road/2+22,ry+road/2+22,0,0,Math.PI*2);ctx.strokeStyle='#df5948';ctx.lineWidth=5;ctx.setLineDash([18,30]);ctx.stroke();ctx.setLineDash([]);
    // subtle corner labels
    ctx.save();ctx.fillStyle='#c6cbbb';ctx.font='12px monospace';ctx.globalAlpha=.65;ctx.fillText('TURN 01  /  THE DOCK',-550,-445);ctx.fillText('TURN 02  /  NIGHT SHIFT',245,445);ctx.restore();
  }
  function drawDust() {
    for (const p of dust) { ctx.save();ctx.globalAlpha=Math.max(0,p.life/.6)*.27;ctx.fillStyle='#d5d9c4';ctx.beginPath();ctx.arc(p.x,p.y,p.size*(1.4-p.life),0,Math.PI*2);ctx.fill();ctx.restore(); }
  }
  function drawCar() {
    const spec=cars[carIndex];ctx.save();ctx.translate(car.x,car.y);ctx.rotate(car.heading);ctx.translate(0,-car.drift*25);
    ctx.fillStyle='#0009';ctx.beginPath();ctx.ellipse(2,7,31,15,0,0,Math.PI*2);ctx.fill();
    const wheelAngle=Math.max(-.35,Math.min(.35,car.steer*.17));
    for(const y of [-12,12]) for(const x of [-19,18]) {ctx.save();ctx.translate(x,y);if(x>0)ctx.rotate(wheelAngle);ctx.fillStyle='#111416';ctx.fillRect(-6,-4,12,8);ctx.fillStyle='#707875';ctx.fillRect(-3,-3,6,6);ctx.restore();}
    ctx.fillStyle=spec.color;ctx.beginPath();ctx.moveTo(-26,-8);ctx.lineTo(-18,-12);ctx.lineTo(13,-11);ctx.lineTo(24,-7);ctx.lineTo(27,0);ctx.lineTo(23,8);ctx.lineTo(13,11);ctx.lineTo(-18,11);ctx.lineTo(-26,7);ctx.closePath();ctx.fill();ctx.strokeStyle='#ffffff88';ctx.lineWidth=1;ctx.stroke();
    ctx.fillStyle='#1b3035';ctx.beginPath();ctx.moveTo(-13,-8);ctx.lineTo(-8,-9);ctx.lineTo(7,-8);ctx.lineTo(11,-5);ctx.lineTo(11,5);ctx.lineTo(7,8);ctx.lineTo(-8,9);ctx.lineTo(-13,7);ctx.closePath();ctx.fill();
    ctx.fillStyle='#9bb4b1';ctx.globalAlpha=.5;ctx.fillRect(-5,-7,2,14);ctx.globalAlpha=1;
    ctx.fillStyle='#ff5345';ctx.shadowColor='#ff3226';ctx.shadowBlur=12;ctx.fillRect(-24,-7,4,5);ctx.fillRect(-24,2,4,5);ctx.shadowBlur=0;
    ctx.fillStyle='#efffd0';ctx.shadowColor='#efffd0';ctx.shadowBlur=14;ctx.fillRect(22,-6,3,4);ctx.fillRect(22,2,3,4);ctx.shadowBlur=0;
    ctx.fillStyle=spec.accent;ctx.globalAlpha=.9;ctx.fillRect(-15,-1,30,2);ctx.globalAlpha=1;ctx.restore();
  }
  function finishRun() {
    running=false;paused=false;
    const final=Math.floor(score);
    if(final>best){best=final;localStorage.setItem('neonslide-best',String(best));$('bestScore').textContent=String(best).padStart(6,'0');}
    $('finalScore').textContent=String(final).padStart(6,'0');$('finalCombo').textContent='x'+bestCombo.toFixed(1);$('finalAngle').textContent=angleTime.toFixed(1)+'s';$('resultOverlay').classList.remove('hidden');
  }
  function render(now) {
    const sx=Math.min(width/1460,height/1040),ox=width/2-camera.x*sx,oy=height/2-camera.y*sx;
    ctx.clearRect(0,0,width,height);ctx.save();ctx.translate(ox,oy);ctx.scale(sx,sx);drawGround(now);drawTrack(now);drawDust();drawCar();ctx.restore();
  }
  function loop(now) {
    if(!running)return;const dt=Math.min(.04,(now-last)/1000||.016);last=now;update(dt);render(now);if(running)requestAnimationFrame(loop);
  }
  function idle(now) { if(!running)render(now);requestAnimationFrame(idle); }
  requestAnimationFrame(idle);
})();
