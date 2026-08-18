/* =========================================================================
   Horizon Roulette — standalone app.js
   Requires: data.js (CARS, RACES), firebase-config.js (db, may be null)
   ========================================================================= */

document.getElementById('rosterCount').textContent = CARS.length;
document.getElementById('raceCount').textContent = RACES.length;

/* ---------------- derive wheel content from real data ---------------- */
const CLASS_COLORS = { D:'#8b93a3', C:'#5ee06a', B:'#ffd23f', A:'#ff9e2c', S1:'#ff5470', S2:'#c86bff', R:'#00e5c7' };

const RACE_ITEMS = RACES.map((r,i)=>({ id:'race'+i, label:r.name, group:r.eventType, meta:r }));
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
const RESTRICT_ITEMS = RESTRICT_DEFS.map((r,i)=>({ id:'res'+i, label:r.label, field:r.field, value:r.value, group:r.cat }));

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

/* ---------------- wheel build + spin ---------------- */
const wheelRace = document.getElementById('wheelRace');
const wheelClass = document.getElementById('wheelClass');
const wheelRestrict = document.getElementById('wheelRestrict');
let activeRace=[], activeClass=[], activeRestrict=[];
let segRace=0, segClass=0, segRestrict=0;

function buildWheel(el, items){
  const n = items.length;
  if(n===0){ el.style.background = '#1c2028'; [...el.querySelectorAll('.seg-label')].forEach(x=>x.remove()); return 0; }
  const seg = 360/n;
  const stops = items.map((it,i)=>{
    const c = it.color || (i%2===0 ? '#00e5c7' : '#ff2f92');
    return `${c} ${i*seg}deg ${(i+1)*seg}deg`;
  }).join(',');
  el.style.background = `conic-gradient(${stops})`;
  [...el.querySelectorAll('.seg-label')].forEach(x=>x.remove());
  items.forEach((it,i)=>{
    const mid = i*seg + seg/2;
    const lab = document.createElement('div');
    lab.className='seg-label';
    lab.style.transform = `rotate(${mid}deg)`;
    lab.textContent = it.label;
    el.appendChild(lab);
  });
  return seg;
}
function refreshWheels(){
  activeRace = RACE_ITEMS.filter(r=>raceEnabled[r.id]);
  activeClass = CLASS_ITEMS.filter(c=>classEnabled[c.id]);
  activeRestrict = RESTRICT_ITEMS.filter(r=>restrictEnabled[r.id]);
  segRace = buildWheel(wheelRace, activeRace);
  segClass = buildWheel(wheelClass, activeClass);
  segRestrict = buildWheel(wheelRestrict, activeRestrict);
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

function spinWheel(el, items, targetIndex, seg){
  return new Promise(resolve=>{
    const spins = 5;
    const current = (parseFloat(el.dataset.rot)||0);
    const targetDeg = 360*spins - (targetIndex*seg + seg/2) + (Math.random()*seg*0.4 - seg*0.2);
    const newRot = current - (current % 360) + targetDeg;
    el.dataset.rot = newRot;
    el.style.transform = `rotate(${newRot}deg)`;
    setTimeout(()=>resolve(items[targetIndex]), 3300);
  });
}

/* ---------------- rules UI ---------------- */
const rEls = {
  noDupMaster: document.getElementById('rNoDupMaster'),
  noDupRace: document.getElementById('rNoDupRace'),
  noDupClass: document.getElementById('rNoDupClass'),
  noDupRestrict: document.getElementById('rNoDupRestrict'),
  available: document.getElementById('rAvailable'),
  upgrade: document.getElementById('rUpgrade'),
};
rEls.noDupMaster.addEventListener('change', ()=>{
  rEls.noDupRace.checked = rEls.noDupClass.checked = rEls.noDupRestrict.checked = rEls.noDupMaster.checked;
});
function getCarMode(){
  return document.querySelector('input[name="carMode"]:checked').value;
}

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
      <span class="chip pi">${c.pi} ${c.cls}</span>
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
      renderVotes(spinDoc, pool);
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
    [wheelRace,wheelClass,wheelRestrict].forEach(el=>{ el.style.transition='none'; });
    const snap = (el,seg,idx)=>{ if(idx<0) return; el.dataset.rot = 720 - (idx*seg + seg/2); el.style.transform = `rotate(${el.dataset.rot}deg)`; };
    snap(wheelRace, segRace, raceIdx);
    snap(wheelClass, segClass, classIdx);
    snap(wheelRestrict, segRestrict, restrictIdx);
    requestAnimationFrame(()=>{ [wheelRace,wheelClass,wheelRestrict].forEach(el=>{ el.style.transition=''; }); });
    finish();
  } else {
    spinBtn.disabled = true;
    ticket.classList.remove('show');
    document.getElementById('resRace').textContent = '…';
    document.getElementById('resClass').textContent = '…';
    document.getElementById('resRestrict').textContent = '…';
    const proms = [];
    if(raceIdx>=0) proms.push(spinWheel(wheelRace, activeRace, raceIdx, segRace));
    if(classIdx>=0) proms.push(spinWheel(wheelClass, activeClass, classIdx, segClass));
    if(restrictIdx>=0) proms.push(spinWheel(wheelRestrict, activeRestrict, restrictIdx, segRestrict));
    Promise.all(proms).then(finish);
  }
}

/* ---------------- voting ---------------- */
let voteUnsub = null;
let myVoteCarKey = null;

function renderVotes(spinDoc, pool, tally){
  tally = tally || {};
  const grid = document.getElementById('voteGrid');
  grid.innerHTML = '';
  if(pool.length===0){ grid.innerHTML = '<div class="empty">No qualifying cars to vote on.</div>'; return; }
  const totalVotes = Object.values(tally).reduce((a,b)=>a+b,0);
  pool.slice().sort((a,b)=>b.pi-a.pi).forEach(c=>{
    const key = carKey(c);
    const count = tally[key] || 0;
    const pct = totalVotes ? Math.round(count/totalVotes*100) : 0;
    const card = renderCard(c, {
      votable: true,
      voted: myVoteCarKey === key,
      voteBar: pct,
      voteCount: count,
      onClick: ()=> castVote(spinDoc, key)
    });
    grid.appendChild(card);
  });
}

function castVote(spinDoc, carKeyVal){
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

/* ---------------- room / sync ---------------- */
const syncDot = document.getElementById('syncDot');
const syncText = document.getElementById('syncText');
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

function connectRoom(roomId){
  if(roomUnsub){ roomUnsub(); roomUnsub = null; }
  if(voteUnsub){ voteUnsub(); voteUnsub = null; }
  currentRoomId = roomId;
  lastRenderedTs = null; firstSnapshot = true;
  localStorage.setItem('hr_room', roomId);
  history.replaceState(null, '', '#' + encodeURIComponent(roomId));

  if(!db){
    syncDot.style.background = '#ff5470';
    syncText.textContent = 'Not connected — add Firebase keys (see README.md) to sync with others';
    return;
  }
  syncDot.style.background = '#3a4150';
  syncText.textContent = 'Connecting to room "' + roomId + '"…';

  roomUnsub = db.collection('rooms').doc(roomId).onSnapshot(doc=>{
    syncDot.style.background = '#5ee06a';
    syncText.textContent = 'Live in room "' + roomId + '"';
    const data = doc.data();
    if(data && data.currentSpin){
      const spin = data.currentSpin;
      if(spin.ts !== lastRenderedTs){
        const isFirst = firstSnapshot;
        lastRenderedTs = spin.ts;
        firstSnapshot = false;
        lastPick = { raceId: spin.raceId, classId: spin.classId, restrictId: spin.restrictId };
        if(!applyingRemote){
          applyingRemote = true;
          myVoteCarKey = null;
          renderSpin(spin, !isFirst);
          subscribeVotes(roomId, spin);
          setTimeout(()=>{ applyingRemote = false; }, isFirst ? 0 : 3400);
        }
      }
    } else {
      firstSnapshot = false;
    }
  }, err=>{
    syncDot.style.background = '#ff5470';
    syncText.textContent = 'Sync error — check Firestore rules (see README.md)';
    console.error(err);
  });
}

roomJoinBtn.addEventListener('click', ()=>{
  const val = (roomInput.value || '').trim().toLowerCase().replace(/[^a-z0-9-]/g,'-').slice(0,24);
  if(!val) return;
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
  const spinDoc = {
    raceId: spin.raceId, classId: spin.classId, restrictId: spin.restrictId,
    carMode, rerolls, roundId, ts: roundId
  };
  if(carMode === 'spec' && evalRes.fullMatches.length>0){
    const pick = evalRes.fullMatches[Math.floor(Math.random()*evalRes.fullMatches.length)];
    spinDoc.specCarKey = carKey(pick);
  }

  lastRenderedTs = spinDoc.ts;
  applyingRemote = true;
  myVoteCarKey = null;
  renderSpin(spinDoc, true);
  if(currentRoomId) subscribeVotes(currentRoomId, spinDoc);
  setTimeout(()=>{ applyingRemote = false; }, 3400);

  if(db && currentRoomId){
    try{
      await db.collection('rooms').doc(currentRoomId).set({ currentSpin: spinDoc }, { merge:true });
    }catch(e){
      syncDot.style.background = '#ff5470';
      syncText.textContent = 'Could not sync this spin';
      console.error(e);
    }
  }
});

/* ---------------- boot ---------------- */
refreshWheels();
const initialRoom = decodeURIComponent(location.hash.replace('#','')) || localStorage.getItem('hr_room') || 'main';
roomInput.value = initialRoom;
connectRoom(initialRoom);
