/* =========================================================================
   Horizon Roulette — standalone app.js
   Requires: data.js (CARS, RACES), firebase-config.js (db, may be null)
   ========================================================================= */

document.getElementById('rosterCount').textContent = CARS.length;
document.getElementById('raceCount').textContent = RACES.length;

/* ---------------- derive wheel content from real data ---------------- */
const CLASS_COLORS = { D:'#8f8f8f', C:'#ff7a1a', B:'#7c4fe0', A:'#e5323f', S1:'#ff2f92', S2:'#2f7dff', R:'#141414' };
const CLASS_DARK = { R:true }; // classes dark enough that chips need light text + a border
const GROUP_COLORS = ['#1c2230','#232833','#1b2530','#26202f','#1f2a26','#2a2320','#20242f'];
function colorForGroup(name){
  let h = 0; for(let i=0;i<name.length;i++) h = (h*31 + name.charCodeAt(i)) >>> 0;
  return GROUP_COLORS[h % GROUP_COLORS.length];
}

const RACE_ITEMS = RACES.map((r,i)=>({ id:'race'+i, label:r.name, group:r.eventType, meta:r, color: colorForGroup(r.eventType) }));
const CLASS_ITEMS = ['D','C','B','A','S1','S2','R'].map(c=>({ id:'cls'+c, label:c, color:CLASS_COLORS[c] }));

function topBy(field, n){
  const counts = {};
  CARS.forEach(c=>{ const v=c[field]; if(!v) return; counts[v]=(counts[v]||0)+1; });
  return Object.keys(counts).sort((a,b)=>counts[b]-counts[a]).slice(0,n);
}
const RESTRICT_DEFS = [];
[...new Set(CARS.map(c=>c.country))].sort().forEach(v=> RESTRICT_DEFS.push({label:v, field:'country', value:v, cat:'Country'}));
topBy('make', 18).forEach(v=> RESTRICT_DEFS.push({label:v, field:'make', value:v, cat:'Brand'}));
topBy('type', 16).forEach(v=> RESTRICT_DEFS.push({label:v, field:'type', value:v, cat:'Car Type'}));
const fullDecadesPresent = [...new Set(CARS.map(c=>c.year!=null ? Math.floor(c.year/10)*10 : null).filter(v=>v!=null))].sort((a,b)=>a-b);
fullDecadesPresent.forEach(fd=>{
  const label = "'" + String(fd%100).padStart(2,'0') + 's';
  RESTRICT_DEFS.push({label, field:'decade', value:String(fd%100).padStart(2,'0')+'s', cat:'Decade'});
});
const RESTRICT_ITEMS = RESTRICT_DEFS.map((r,i)=>({ id:'res'+i, label:r.label, field:r.field, value:r.value, group:r.cat, color: colorForGroup(r.cat) }));

/* ---------------- filter state ---------------- */
const raceEnabled = {}; RACE_ITEMS.forEach(r=>raceEnabled[r.id]=true);
const classEnabled = {}; CLASS_ITEMS.forEach(c=>classEnabled[c.id]=true);
const restrictEnabled = {}; RESTRICT_ITEMS.forEach(r=>restrictEnabled[r.id]=true);

function groupBy(arr, key){
  const out = {};
  arr.forEach(it=>{ (out[it[key]] = out[it[key]]||[]).push(it); });
  return out;
}
function buildGroupedFilterUI(container, items, enabledMap, kind){
  container.innerHTML = '';
  const groups = groupBy(items, 'group');
  Object.keys(groups).forEach(gName=>{
    const gItems = groups[gName];
    const wrap = document.createElement('details');
    wrap.className = 'filter-group';
    wrap.open = false;
    const summary = document.createElement('summary');
    const headCb = document.createElement('input');
    headCb.type = 'checkbox'; headCb.checked = true;
    headCb.addEventListener('click', e=> e.stopPropagation());
    summary.appendChild(headCb);
    summary.appendChild(document.createTextNode(gName + ' (' + gItems.length + ')'));
    wrap.appendChild(summary);
    const body = document.createElement('div');
    body.className = 'group-items';
    gItems.forEach(it=>{
      const lab = document.createElement('label');
      const cb = document.createElement('input');
      cb.type = 'checkbox'; cb.checked = true;
      cb.addEventListener('change', ()=>{
        enabledMap[it.id] = cb.checked;
        syncGroupHead();
        onFilterChange(kind);
      });
      lab.appendChild(cb);
      lab.appendChild(document.createTextNode(it.label));
      body.appendChild(lab);
    });
    function syncGroupHead(){
      const boxes = [...body.querySelectorAll('input[type=checkbox]')];
      const checked = boxes.filter(b=>b.checked).length;
      headCb.checked = checked===boxes.length;
      headCb.indeterminate = checked>0 && checked<boxes.length;
    }
    headCb.addEventListener('change', ()=>{
      const boxes = [...body.querySelectorAll('input[type=checkbox]')];
      boxes.forEach(b=>{ b.checked = headCb.checked; });
      gItems.forEach(it=>{ enabledMap[it.id] = headCb.checked; });
      headCb.indeterminate = false;
      onFilterChange(kind);
    });
    wrap.appendChild(body);
    container.appendChild(wrap);
  });
}
function buildFlatFilterUI(container, items, enabledMap, kind){
  container.innerHTML = '';
  items.forEach(it=>{
    const lab = document.createElement('label');
    const cb = document.createElement('input');
    cb.type = 'checkbox'; cb.checked = true;
    cb.addEventListener('change', ()=>{ enabledMap[it.id] = cb.checked; onFilterChange(kind); });
    lab.appendChild(cb);
    lab.appendChild(document.createTextNode(it.label));
    container.appendChild(lab);
  });
}
buildGroupedFilterUI(document.getElementById('raceFilters'), RACE_ITEMS, raceEnabled, 'race');
buildFlatFilterUI(document.getElementById('classFilters'), CLASS_ITEMS, classEnabled, 'class');
buildGroupedFilterUI(document.getElementById('restrictFilters'), RESTRICT_ITEMS, restrictEnabled, 'restrict');

/* ---------------- reel (slot-machine) build + spin ---------------- */
const ITEM_H = 62;         // must match .reel-item height in CSS
const VISIBLE_ROWS = 3;    // must match viewport height / ITEM_H
const BASE_SPIN_MS = 2500;   // how long the first (race) reel spins
const STAGGER_MS = 1000;      // extra time each subsequent reel keeps spinning
const REEL_DURATIONS = { race: BASE_SPIN_MS, class: BASE_SPIN_MS + STAGGER_MS, restrict: BASE_SPIN_MS + STAGGER_MS*2 };
const TOTAL_SPIN_MS = BASE_SPIN_MS + STAGGER_MS*2; // longest reel — used for cross-client timing
const FILLER_PER_SEC = 8;    // how many items "pass by" per second of spin (keeps speed consistent across staggered durations)

const reels = {
  race:      { viewport: document.getElementById('wheelRace') },
  class:     { viewport: document.getElementById('wheelClass') },
  restrict:  { viewport: document.getElementById('wheelRestrict') },
};
Object.values(reels).forEach(r=>{ r.strip = r.viewport.querySelector('.reel-strip'); });

/* ---- sound: synthesized in Web Audio, no external audio files needed ---- */
let audioCtx = null;
let muted = localStorage.getItem('hr_muted') === '1';
function ensureAudio(){
  if(!audioCtx){
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if(!Ctx) return null;
    audioCtx = new Ctx();
  }
  if(audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}
function playTick(freq){
  if(muted) return;
  const ctx = ensureAudio(); if(!ctx) return;
  const t = ctx.currentTime;
  const osc = ctx.createOscillator(), gain = ctx.createGain();
  osc.type = 'square'; osc.frequency.value = freq || (650 + Math.random()*150);
  gain.gain.setValueAtTime(0.045, t);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.045);
  osc.connect(gain).connect(ctx.destination);
  osc.start(t); osc.stop(t + 0.05);
}
function playThunk(){
  if(muted) return;
  const ctx = ensureAudio(); if(!ctx) return;
  const t = ctx.currentTime;
  const osc = ctx.createOscillator(), gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(190, t);
  osc.frequency.exponentialRampToValueAtTime(55, t + 0.16);
  gain.gain.setValueAtTime(0.28, t);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
  osc.connect(gain).connect(ctx.destination);
  osc.start(t); osc.stop(t + 0.22);
}
const muteBtn = document.getElementById('muteBtn');
function refreshMuteBtn(){
  muteBtn.textContent = muted ? '\uD83D\uDD07 Sound Off' : '\uD83D\uDD0A Sound On';
  muteBtn.setAttribute('aria-pressed', String(muted));
}
muteBtn.addEventListener('click', ()=>{
  muted = !muted;
  localStorage.setItem('hr_muted', muted ? '1' : '0');
  refreshMuteBtn();
  if(!muted) ensureAudio();
});
refreshMuteBtn();

function reelItemHTML(it){
  const sub = it.meta ? it.meta.eventType : (it.group || '');
  return `<div class="reel-item" style="--slot-color:${it.color||'#232833'}">${it.label}${sub ? '<span class="sub">'+sub+'</span>' : ''}</div>`;
}
function renderStripAtRest(reel, items, idx){
  reel.strip.style.transition = 'none';
  if(items.length===0){
    reel.strip.innerHTML = '<div class="reel-item" style="--slot-color:#1c2028;color:var(--sub);">No options enabled</div>'.repeat(VISIBLE_ROWS);
    reel.strip.style.transform = 'translateY(0px)';
    return;
  }
  const before = items[(idx-1+items.length)%items.length];
  const current = items[idx];
  const after = items[(idx+1)%items.length];
  reel.strip.innerHTML = reelItemHTML(before) + reelItemHTML(current) + reelItemHTML(after);
  reel.strip.style.transform = `translateY(-${ITEM_H}px)`;
  requestAnimationFrame(()=>{ reel.strip.style.transition = ''; });
}

function spinReel(reelKey, items, targetIndex){
  const durationMs = REEL_DURATIONS[reelKey] || BASE_SPIN_MS;
  return new Promise(resolve=>{
    const reel = reels[reelKey];
    if(items.length===0){ renderStripAtRest(reel, items, 0); resolve(null); return; }
    const fillerCount = Math.max(6, Math.round(durationMs/1000 * FILLER_PER_SEC));
    const seq = [];
    for(let i=0;i<fillerCount;i++){ seq.push(items[Math.floor(Math.random()*items.length)]); }
    seq.push(items[targetIndex]);                       // lands centered
    seq.push(items[Math.floor(Math.random()*items.length)]); // bottom partial peek

    reel.strip.style.transition = 'none';
    reel.strip.style.transform = 'translateY(0px)';
    reel.strip.innerHTML = seq.map(reelItemHTML).join('');
    // force reflow so the transition below actually animates from translateY(0)
    void reel.strip.offsetHeight;

    const finalIndex = seq.length - 2; // the appended target
    const finalY = (finalIndex - 1) * ITEM_H; // -1 so target centers in the highlight row
    reel.strip.style.transition = `transform ${durationMs}ms cubic-bezier(.15,.7,.12,1)`;
    reel.strip.style.transform = `translateY(-${finalY}px)`;

    const tickEvery = Math.max(55, Math.round(durationMs / fillerCount));
    const tickHandle = setInterval(()=> playTick(), tickEvery);
    setTimeout(()=>{
      clearInterval(tickHandle);
      playThunk();
      resolve(items[targetIndex]);
    }, durationMs);
  });
}

let activeRace=[], activeClass=[], activeRestrict=[];
function refreshWheels(){
  activeRace = RACE_ITEMS.filter(r=>raceEnabled[r.id]);
  activeClass = CLASS_ITEMS.filter(c=>classEnabled[c.id]);
  activeRestrict = RESTRICT_ITEMS.filter(r=>restrictEnabled[r.id]);
  renderStripAtRest(reels.race, activeRace, 0);
  renderStripAtRest(reels.class, activeClass, 0);
  renderStripAtRest(reels.restrict, activeRestrict, 0);
  document.getElementById('warnRace').style.display = activeRace.length? 'none':'block';
  document.getElementById('warnClass').style.display = activeClass.length? 'none':'block';
  document.getElementById('warnRestrict').style.display = activeRestrict.length? 'none':'block';
  document.getElementById('raceFilterCount').textContent = activeRace.length + '/' + RACE_ITEMS.length + ' on';
  document.getElementById('classFilterCount').textContent = activeClass.length + '/' + CLASS_ITEMS.length + ' on';
  document.getElementById('restrictFilterCount').textContent = activeRestrict.length + '/' + RESTRICT_ITEMS.length + ' on';
  const ok = activeRace.length && activeClass.length && activeRestrict.length;
  spinBtn.disabled = !ok;
}
function onFilterChange(){ refreshWheels(); }

/* ---------------- rules UI ---------------- */
const rEls = {
  noDupMaster: document.getElementById('rNoDupMaster'),
  noDupRace: document.getElementById('rNoDupRace'),
  noDupClass: document.getElementById('rNoDupClass'),
  noDupRestrict: document.getElementById('rNoDupRestrict'),
  available: document.getElementById('rAvailable'),
  upgrade: document.getElementById('rUpgrade'),
  voteDuration: document.getElementById('voteDuration'),
};
rEls.noDupMaster.addEventListener('change', ()=>{
  rEls.noDupRace.checked = rEls.noDupClass.checked = rEls.noDupRestrict.checked = rEls.noDupMaster.checked;
});
function getCarMode(){ return document.querySelector('input[name="carMode"]:checked').value; }

/* ---------------- car pool + evaluation ---------------- */
function poolCars(){ return rEls.available.checked ? CARS.filter(c=>c.avail!==false) : CARS; }
function evaluateSpin(spin){
  const cls = CLASS_ITEMS.find(c=>c.id===spin.classId);
  const restrict = RESTRICT_ITEMS.find(r=>r.id===spin.restrictId);
  const pool = poolCars();
  const restrictMatches = pool.filter(c=>c[restrict.field]===restrict.value);
  const fullMatches = restrictMatches.filter(c=>c.cls===cls.label);
  return { cls, restrict, restrictMatches, fullMatches };
}

let lastPick = { raceId:null, classId:null, restrictId:null };
function pickIndex(items, noDupLastId){
  let pool = items.map((it,i)=>i);
  if(noDupLastId!=null && items.length>1){ pool = pool.filter(i=>items[i].id!==noDupLastId); }
  if(pool.length===0) pool = items.map((it,i)=>i);
  return pool[Math.floor(Math.random()*pool.length)];
}
function computeSpin(){
  const iRace = pickIndex(activeRace, rEls.noDupRace.checked? lastPick.raceId : null);
  const iClass = pickIndex(activeClass, rEls.noDupClass.checked? lastPick.classId : null);
  const iRestrict = pickIndex(activeRestrict, rEls.noDupRestrict.checked? lastPick.restrictId : null);
  return { raceId: activeRace[iRace].id, classId: activeClass[iClass].id, restrictId: activeRestrict[iRestrict].id };
}

/* automatic reroll: no manual toggle. Rerolls until a full match exists,
   OR (upgrade candidates are enabled AND at least one exists), OR attempts exhausted. */
function resolveSpin(){
  let spin = computeSpin();
  let evalRes = evaluateSpin(spin);
  let attempts = 0;
  const maxAttempts = 60;
  while(attempts < maxAttempts){
    const hasFull = evalRes.fullMatches.length>0;
    const upgradeOK = rEls.upgrade.checked && evalRes.restrictMatches.length>0;
    if(hasFull || upgradeOK) break;
    attempts++;
    spin = computeSpin();
    evalRes = evaluateSpin(spin);
  }
  lastPick = { raceId: spin.raceId, classId: spin.classId, restrictId: spin.restrictId };
  return { spin, evalRes, rerolls: attempts };
}

/* ---------------- rendering ---------------- */
const spinBtn = document.getElementById('spinBtn');
const spinNote = document.getElementById('spinNote');
const ticket = document.getElementById('ticket');

function carKey(c){ return c.make + '|' + c.name; }
function findCarByKey(key){ return CARS.find(c=> carKey(c)===key); }

function renderCard(c, opts){
  opts = opts || {};
  const card = document.createElement('div');
  card.className = 'card' + (c.avail===false ? ' dim' : '') + (opts.votable ? ' votable' : '') + (opts.voted ? ' voted' : '');
  card.style.setProperty('--class-color', CLASS_COLORS[c.cls]);
  card.innerHTML = `
    <div class="name">${c.name}</div>
    <div class="meta">
      <span class="chip pi${CLASS_DARK[c.cls] ? ' dark-chip' : ''}">${c.pi} ${c.cls}</span>
      <span class="chip">${c.make}</span>
      <span class="chip">${c.type}</span>
      <span class="chip">${c.country}</span>
      ${c.avail===false ? '<span class="chip lock">'+(c.dlc || 'DLC')+'</span>' : ''}
    </div>
    ${opts.voteBar!=null ? `<div class="vote-bar"><span style="width:${opts.voteBar}%"></span></div><div class="vote-count">${opts.voteCount||0} vote${opts.voteCount===1?'':'s'}${opts.voteBar!=null?' · '+opts.voteBar+'%':''}</div>` : ''}
  `;
  if(opts.onClick) card.addEventListener('click', opts.onClick);
  return card;
}

function renderSpin(spinDoc, animate){
  const raceItem = RACE_ITEMS.find(r=>r.id===spinDoc.raceId);
  const evalRes = evaluateSpin(spinDoc);
  const { cls, restrict, restrictMatches, fullMatches } = evalRes;
  const raceIdx = activeRace.findIndex(r=>r.id===spinDoc.raceId);
  const classIdx = activeClass.findIndex(c=>c.id===spinDoc.classId);
  const restrictIdx = activeRestrict.findIndex(r=>r.id===spinDoc.restrictId);

  const finish = ()=>{
    document.getElementById('resRace').textContent = raceItem ? raceItem.label : '?';
    document.getElementById('resClass').textContent = cls.label;
    document.getElementById('resRestrict').textContent = restrict.label;

    document.getElementById('tRace').textContent = raceItem ? raceItem.label : '?';
    const meta = raceItem ? raceItem.meta : null;
    let metaLine = meta ? meta.eventType : '';
    if(meta && (meta.restrictClass || meta.restrictCarType)){
      const bits = [];
      if(meta.restrictClass) bits.push('Class ' + meta.restrictClass + (meta.restrictPI?(' '+meta.restrictPI):''));
      if(meta.restrictCarType) bits.push(meta.restrictCarType);
      metaLine += ' · in-game: ' + bits.join(' ');
    }
    document.getElementById('tRaceMeta').textContent = metaLine;
    document.getElementById('tClass').textContent = cls.label + '-Class';
    document.getElementById('tRestrict').textContent = restrict.label;

    const usingUpgradeOnly = fullMatches.length===0 && rEls.upgrade.checked && restrictMatches.length>0;
    document.getElementById('tCount').textContent = usingUpgradeOnly
      ? '0 exact matches · ' + restrictMatches.length + ' upgrade candidate' + (restrictMatches.length===1?'':'s')
      : fullMatches.length + ' car' + (fullMatches.length===1?'':'s') + ' qualify';

    const carMode = spinDoc.carMode || 'list';
    const specWrap = document.getElementById('specWrap');
    const voteWrap = document.getElementById('voteWrap');
    const listWrap = document.getElementById('listWrap');
    specWrap.style.display = 'none'; voteWrap.style.display = 'none'; listWrap.style.display = 'none';
    stopVoteTimer();

    const pool = usingUpgradeOnly ? [] : fullMatches;

    if(carMode === 'spec' && !usingUpgradeOnly){
      specWrap.style.display = '';
      const specCar = spinDoc.specCarKey ? findCarByKey(spinDoc.specCarKey) : null;
      specWrap.innerHTML = '';
      if(specCar){
        const banner = document.createElement('div');
        banner.className = 'spec-banner';
        banner.style.setProperty('--class-color', CLASS_COLORS[specCar.cls]);
        banner.innerHTML = `<div><div class="k">Spec car — everyone uses this</div><div class="name">${specCar.name}</div></div>`;
        specWrap.appendChild(banner);
        specWrap.appendChild(renderCard(specCar));
      } else {
        specWrap.innerHTML = '<div class="empty">No qualifying car to assign — spin again.</div>';
      }
    } else if(carMode === 'vote' && !usingUpgradeOnly){
      voteWrap.style.display = '';
      renderVotes(spinDoc, pool, {});
      startVoteTimer(spinDoc, pool);
    } else {
      listWrap.style.display = '';
      const grid = document.getElementById('carGrid');
      grid.innerHTML = '';
      document.getElementById('mainLabel').textContent = usingUpgradeOnly ? 'No exact match at this class' : 'Qualifying cars';
      if(!usingUpgradeOnly){
        if(fullMatches.length===0){
          grid.innerHTML = '<div class="empty">No cars qualify.</div>';
        } else {
          fullMatches.slice().sort((a,b)=>b.pi-a.pi).forEach(c=> grid.appendChild(renderCard(c)));
        }
      } else {
        grid.innerHTML = '<div class="empty">No car in the roster hits ' + cls.label + '-Class as a ' + restrict.label + ' vehicle at stock. See upgrade candidates below.</div>';
      }
      const upgradeWrap = document.getElementById('upgradeWrap');
      if(rEls.upgrade.checked){
        const upgradeGrid = document.getElementById('upgradeGrid');
        upgradeGrid.innerHTML = '';
        const candidates = restrictMatches.filter(c=>c.cls!==cls.label);
        document.getElementById('upgradeLabel').textContent =
          `Upgrade candidates — meet "${restrict.label}", not ${cls.label}-Class at stock (${candidates.length})`;
        if(candidates.length===0){
          upgradeGrid.innerHTML = '<div class="empty">Every ' + restrict.label + ' car in the roster is already ' + cls.label + '-Class or the restriction has no other cars.</div>';
        } else {
          candidates.slice().sort((a,b)=>b.pi-a.pi).forEach(c=> upgradeGrid.appendChild(renderCard(c)));
        }
        upgradeWrap.style.display = '';
      } else {
        upgradeWrap.style.display = 'none';
      }
    }

    ticket.classList.add('show');
    spinBtn.disabled = !(activeRace.length && activeClass.length && activeRestrict.length);
    spinNote.textContent = spinDoc.rerolls ? ('Rerolled ' + spinDoc.rerolls + '\u00D7 to find a valid combo.') : '';
  };

  if(!animate){
    renderStripAtRest(reels.race, activeRace, Math.max(raceIdx,0));
    renderStripAtRest(reels.class, activeClass, Math.max(classIdx,0));
    renderStripAtRest(reels.restrict, activeRestrict, Math.max(restrictIdx,0));
    finish();
  } else {
    spinBtn.disabled = true;
    ticket.classList.remove('show');
    document.getElementById('resRace').textContent = '…';
    document.getElementById('resClass').textContent = '…';
    document.getElementById('resRestrict').textContent = '…';
    const proms = [];
    proms.push(spinReel('race', activeRace, Math.max(raceIdx,0)));
    proms.push(spinReel('class', activeClass, Math.max(classIdx,0)));
    proms.push(spinReel('restrict', activeRestrict, Math.max(restrictIdx,0)));
    Promise.all(proms).then(finish);
  }
}

/* ---------------- voting (with timeout + winner) ---------------- */
let voteUnsub = null;
let myVoteCarKey = null;
let voteTimerHandle = null;

function stopVoteTimer(){
  if(voteTimerHandle){ clearInterval(voteTimerHandle); voteTimerHandle = null; }
  document.getElementById('voteTimerWrap').style.display = '';
  document.getElementById('voteWinner').innerHTML = '';
}

function startVoteTimer(spinDoc, pool){
  stopVoteTimer();
  const durationMs = (spinDoc.voteDurationSec || 20) * 1000;
  const deadline = spinDoc.ts + durationMs;
  const bar = document.getElementById('voteTimerBar');
  const text = document.getElementById('voteTimerText');
  const wrap = document.getElementById('voteTimerWrap');

  function tick(){
    const remain = deadline - Date.now();
    if(remain <= 0){
      clearInterval(voteTimerHandle); voteTimerHandle = null;
      bar.style.width = '0%';
      text.textContent = '0s';
      wrap.style.display = 'none';
      closeVoting(spinDoc, pool);
      return;
    }
    const pct = Math.max(0, Math.min(100, remain/durationMs*100));
    bar.style.width = pct + '%';
    text.textContent = Math.ceil(remain/1000) + 's';
  }
  if(deadline - Date.now() <= 0){
    // already closed (e.g. a late joiner) — give the vote subscription a
    // brief moment to deliver real tallies before computing a winner
    setTimeout(tick, 400);
  } else {
    tick();
    voteTimerHandle = setInterval(tick, 250);
  }
}

function closeVoting(spinDoc, pool){
  const grid = document.getElementById('voteGrid');
  [...grid.querySelectorAll('.card')].forEach(c=> c.classList.remove('votable'));
  // determine winner from whatever tally is currently on screen
  let best = null, bestCount = -1;
  [...grid.querySelectorAll('.card')].forEach((cardEl, i)=>{
    const countEl = cardEl.querySelector('.vote-count');
    const n = countEl ? parseInt(countEl.textContent) || 0 : 0;
    if(n > bestCount){ bestCount = n; best = pool.slice().sort((a,b)=>b.pi-a.pi)[i]; }
  });
  const winnerBox = document.getElementById('voteWinner');
  if(best){
    winnerBox.innerHTML = '';
    const banner = document.createElement('div');
    banner.className = 'winner-banner';
    banner.style.setProperty('--class-color', CLASS_COLORS[best.cls]);
    banner.innerHTML = `<div><div class="k">Voting closed — winner</div><div class="name">${best.name}</div></div>`;
    winnerBox.appendChild(banner);
  } else {
    winnerBox.innerHTML = '<div class="empty">Voting closed — no votes were cast.</div>';
  }
}

function renderVotes(spinDoc, pool, tally){
  tally = tally || {};
  const grid = document.getElementById('voteGrid');
  grid.innerHTML = '';
  if(pool.length===0){ grid.innerHTML = '<div class="empty">No qualifying cars to vote on.</div>'; return; }
  const votingOpen = Date.now() < (spinDoc.ts + (spinDoc.voteDurationSec||20)*1000);
  const totalVotes = Object.values(tally).reduce((a,b)=>a+b,0);
  pool.slice().sort((a,b)=>b.pi-a.pi).forEach(c=>{
    const key = carKey(c);
    const count = tally[key] || 0;
    const pct = totalVotes ? Math.round(count/totalVotes*100) : 0;
    const card = renderCard(c, {
      votable: votingOpen,
      voted: myVoteCarKey === key,
      voteBar: pct,
      voteCount: count,
      onClick: votingOpen ? (()=> castVote(spinDoc, key)) : null
    });
    grid.appendChild(card);
  });
}

function castVote(spinDoc, carKeyVal){
  if(Date.now() >= (spinDoc.ts + (spinDoc.voteDurationSec||20)*1000)) return; // closed
  myVoteCarKey = carKeyVal;
  if(!db || !currentRoomId || !spinDoc.roundId) return;
  db.collection('rooms').doc(currentRoomId)
    .collection('rounds').doc(String(spinDoc.roundId))
    .collection('votes').doc(clientId)
    .set({ carKey: carKeyVal, ts: Date.now() });
}

function subscribeVotes(roomId, spinDoc){
  if(voteUnsub){ voteUnsub(); voteUnsub = null; }
  if(!db || !roomId || !spinDoc.roundId) return;
  const evalRes = evaluateSpin(spinDoc);
  const pool = evalRes.fullMatches;
  voteUnsub = db.collection('rooms').doc(roomId)
    .collection('rounds').doc(String(spinDoc.roundId))
    .collection('votes')
    .onSnapshot(snap=>{
      const tally = {};
      snap.forEach(doc=>{
        const v = doc.data();
        if(doc.id === clientId) myVoteCarKey = v.carKey;
        tally[v.carKey] = (tally[v.carKey]||0) + 1;
      });
      if(document.getElementById('voteWrap').style.display !== 'none'){
        renderVotes(spinDoc, pool, tally);
      }
    });
}

/* ---------------- cleanup of old rounds (avoid permanent buildup) ----------------
   Best-effort client-side tidy-up of the *previous* round's vote docs whenever a
   new spin starts. For a full "auto-expire everything" setup, also configure a
   Firestore TTL policy on the `expiresAt` field for the `rooms` and `rounds`
   collection groups in the Firebase console (free, native, no code needed) —
   see README.md. */
let lastRoundId = null;
async function cleanupRound(roomId, roundId){
  if(!db || !roomId || !roundId) return;
  try{
    const votesSnap = await db.collection('rooms').doc(roomId)
      .collection('rounds').doc(String(roundId)).collection('votes').get();
    const batch = db.batch();
    votesSnap.forEach(doc=> batch.delete(doc.ref));
    batch.delete(db.collection('rooms').doc(roomId).collection('rounds').doc(String(roundId)));
    await batch.commit();
  }catch(e){ /* best effort only */ }
}

/* ---------------- room / sync ---------------- */
const syncDot = document.getElementById('syncDot');
const syncText = document.getElementById('syncText');
const joinFeedback = document.getElementById('joinFeedback');
const roomInput = document.getElementById('roomInput');
const roomJoinBtn = document.getElementById('roomJoinBtn');

function getClientId(){
  let id = localStorage.getItem('hr_client_id');
  if(!id){ id = 'c_' + Math.random().toString(36).slice(2) + Date.now().toString(36); localStorage.setItem('hr_client_id', id); }
  return id;
}
const clientId = getClientId();

let currentRoomId = null;
let roomUnsub = null;
let lastRenderedTs = null;
let firstSnapshot = true;
let applyingRemote = false;

function setJoinFeedback(msg, cls){
  joinFeedback.textContent = msg;
  joinFeedback.className = 'join-feedback' + (cls ? ' ' + cls : '');
}

function connectRoom(roomId){
  if(roomUnsub){ roomUnsub(); roomUnsub = null; }
  if(voteUnsub){ voteUnsub(); voteUnsub = null; }
  currentRoomId = roomId;
  lastRenderedTs = null; firstSnapshot = true; lastRoundId = null;
  localStorage.setItem('hr_room', roomId);
  history.replaceState(null, '', '#' + encodeURIComponent(roomId));

  if(!db){
    syncDot.style.background = '#ff5470';
    syncText.textContent = 'Not connected — add Firebase keys (see README.md) to sync with others';
    setJoinFeedback('Firebase isn\u2019t configured on this deployment yet, so "' + roomId + '" will stay local to your browser only.', 'err');
    return;
  }
  syncDot.style.background = '#3a4150';
  syncText.textContent = 'Connecting to room "' + roomId + '"…';
  setJoinFeedback('Connecting to room "' + roomId + '"…');

  roomUnsub = db.collection('rooms').doc(roomId).onSnapshot(doc=>{
    const wasFirst = firstSnapshot;
    syncDot.style.background = '#5ee06a';
    syncText.textContent = 'Live in room "' + roomId + '"';
    if(wasFirst){
      setJoinFeedback('Joined room "' + roomId + '" \u2014 you\u2019re synced with anyone else using this code.', 'ok');
    }
    const data = doc.data();
    if(data && data.currentSpin){
      const spin = data.currentSpin;
      if(spin.ts !== lastRenderedTs){
        const isFirst = firstSnapshot;
        lastRenderedTs = spin.ts;
        firstSnapshot = false;
        lastRoundId = spin.roundId;
        lastPick = { raceId: spin.raceId, classId: spin.classId, restrictId: spin.restrictId };
        if(!applyingRemote){
          applyingRemote = true;
          myVoteCarKey = null;
          renderSpin(spin, !isFirst);
          subscribeVotes(roomId, spin);
          setTimeout(()=>{ applyingRemote = false; }, isFirst ? 0 : TOTAL_SPIN_MS + 200);
        }
      }
    } else {
      firstSnapshot = false;
    }
  }, err=>{
    syncDot.style.background = '#ff5470';
    syncText.textContent = 'Sync error — check Firestore rules (see README.md)';
    setJoinFeedback('Couldn\u2019t join "' + roomId + '" \u2014 sync error, check Firestore rules (see README.md).', 'err');
    console.error(err);
  });
}

roomJoinBtn.addEventListener('click', ()=>{
  const val = (roomInput.value || '').trim().toLowerCase().replace(/[^a-z0-9-]/g,'-').slice(0,24);
  if(!val){ setJoinFeedback('Type a room code first.', 'err'); return; }
  connectRoom(val);
});
roomInput.addEventListener('keydown', e=>{ if(e.key==='Enter') roomJoinBtn.click(); });

/* ---------------- spin button ---------------- */
spinBtn.addEventListener('click', async ()=>{
  spinBtn.disabled = true;
  spinNote.textContent = 'Rolling…';
  const { spin, evalRes, rerolls } = resolveSpin();
  const carMode = getCarMode();
  const roundId = Date.now();
  const voteDurationSec = Math.max(5, Math.min(120, parseInt(rEls.voteDuration.value)||20));
  const spinDoc = {
    raceId: spin.raceId, classId: spin.classId, restrictId: spin.restrictId,
    carMode, rerolls, roundId, ts: roundId, voteDurationSec,
    expiresAt: db ? firebase.firestore.Timestamp.fromMillis(Date.now() + 24*3600*1000) : null
  };
  if(carMode === 'spec' && evalRes.fullMatches.length>0){
    const pick = evalRes.fullMatches[Math.floor(Math.random()*evalRes.fullMatches.length)];
    spinDoc.specCarKey = carKey(pick);
  }

  const roomToClean = currentRoomId;
  const roundToClean = lastRoundId;

  lastRenderedTs = spinDoc.ts;
  lastRoundId = spinDoc.roundId;
  applyingRemote = true;
  myVoteCarKey = null;
  renderSpin(spinDoc, true);
  if(currentRoomId) subscribeVotes(currentRoomId, spinDoc);
  setTimeout(()=>{ applyingRemote = false; }, TOTAL_SPIN_MS + 200);

  if(db && currentRoomId){
    try{
      await db.collection('rooms').doc(currentRoomId).set({ currentSpin: spinDoc }, { merge:true });
      if(roundToClean) cleanupRound(roomToClean, roundToClean); // tidy up the previous round, best effort
    }catch(e){
      syncDot.style.background = '#ff5470';
      syncText.textContent = 'Could not sync this spin';
      console.error(e);
    }
  }
});

/* ---------------- boot ----------------
   No auto-join: the room box starts blank and nothing connects until the
   person explicitly clicks Join/Create (or opens a link with #roomcode). */
refreshWheels();
const hashRoom = decodeURIComponent(location.hash.replace('#',''));
if(hashRoom){
  roomInput.value = hashRoom;
  connectRoom(hashRoom);
} else {
  roomInput.value = '';
  setJoinFeedback('Not in a room yet — spins stay local until you join one.');
}
