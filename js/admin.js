/* ============================================================
   ATELIER NÉVE — админ-кабинет
   Мастера (отдельные расписания) · услуги/цены · фикс 2 ч ·
   шаг 15 мин · drag&drop · запрет действий в прошлом.
   Слоты: slots/{date}_{masterId}_{min}
   ============================================================ */
(function(){
  'use strict';
  var CFG=window.ATELIER_CONFIG||{};
  var ADMIN=CFG.adminEmail||'admin@gmail.com';
  var W_START=(CFG.workStart||9)*60, W_END=(CFG.workEnd||19)*60;
  var STEP=CFG.stepMin||15, DUR=CFG.slotMin||120;
  var ROW=60, PPM=ROW/60;
  var DOW=['Пн','Вт','Ср','Чт','Пт','Сб','Вс'];
  var MON=['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];
  var DEF_SERVICES=[{name:'Маникюр',price:'от 5 000 ₸'},{name:'Педикюр',price:'от 7 000 ₸'},{name:'Комплексы',price:'от 11 000 ₸'},{name:'Дизайн',price:'от 1 000 ₸'}];
  var DEF_MASTERS=[{name:'Мастер 1'}];

  var $=function(id){return document.getElementById(id);};
  function pad(n){return (n<10?'0':'')+n;}
  function hhmm(m){return pad(Math.floor(m/60))+':'+pad(m%60);}
  function ymd(d){return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());}
  function mondayOf(d){var x=new Date(d);var w=(x.getDay()+6)%7;x.setDate(x.getDate()-w);x.setHours(0,0,0,0);return x;}
  function cellsOf(s){var a=[];for(var m=s;m<s+DUR;m+=STEP)a.push(m);return a;}
  function digits(p){return (p||'').replace(/\D/g,'');}
  function todayStr(){return ymd(new Date());}
  function isPast(dateStr){return dateStr<todayStr();}
  function phoneFmt(v){
    v=(v||'');if(v.indexOf('+7')===0)v=v.slice(2);
    var d=v.replace(/\D/g,'');
    if(d.length===11&&(d[0]==='7'||d[0]==='8'))d=d.slice(1);else if(d.length&&d[0]==='8')d=d.slice(1);
    d=d.slice(0,10);
    var o='+7';if(d.length>=1)o+=' ('+d.slice(0,3);if(d.length>=3)o+=')';if(d.length>=4)o+=' '+d.slice(3,6);if(d.length>=7)o+='-'+d.slice(6,8);if(d.length>=9)o+='-'+d.slice(8,10);return o;
  }
  function maskPhone(input){
    if(!input)return;
    input.addEventListener('input',function(){input.value=phoneFmt(input.value);});
    input.addEventListener('focus',function(){if(!input.value)input.value='+7 (';});
    input.addEventListener('blur',function(){if(input.value==='+7 ('||input.value==='+7')input.value='';});
  }

  var loginSec=$('login'), app=$('app');
  var auth=window.FB&&window.FB.auth, db=window.FB&&window.FB.db;

  if(!window.FB||window.FB.error){
    $('loginMsg').textContent=(window.FB&&window.FB.error==='config')?'Firebase не настроен: впишите данные в js/firebase-config.js.':'Firebase SDK не загрузился.';
    $('loginMsg').className='msg msg--err';
  }

  /* ---- auth ---- */
  $('loginForm').addEventListener('submit',function(e){
    e.preventDefault();if(!auth)return;
    var email=$('email').value.trim(),pass=$('pass').value,msg=$('loginMsg'),btn=$('loginBtn');
    msg.textContent='Входим…';msg.className='msg';btn.disabled=true;
    auth.signInWithEmailAndPassword(email,pass).then(function(){msg.textContent='';btn.disabled=false;})
    .catch(function(err){btn.disabled=false;msg.className='msg msg--err';msg.textContent=(['auth/invalid-credential','auth/wrong-password','auth/user-not-found'].indexOf(err.code)>=0)?'Неверная почта или пароль.':('Ошибка входа: '+err.code);});
  });
  if(auth){auth.onAuthStateChanged(function(user){
    if(user&&user.email===ADMIN){loginSec.style.display='none';app.classList.add('on');loadCatalog();}
    else if(user){auth.signOut();var m=$('loginMsg');m.className='msg msg--err';m.textContent='Эта почта не администратор.';loginSec.style.display='grid';app.classList.remove('on');}
    else{loginSec.style.display='grid';app.classList.remove('on');}
  });}
  $('logout').addEventListener('click',function(){if(auth)auth.signOut();});

  /* ---- каталог: мастера + услуги ---- */
  var masters=[], services=[], currentMasterId=null;

  function loadCatalog(){
    if(!db)return;
    Promise.all([
      db.collection('masters').get(),
      db.collection('services').get()
    ]).then(function(res){
      masters=[];res[0].forEach(function(d){var m=d.data();m.id=d.id;masters.push(m);});
      services=[];res[1].forEach(function(d){var s=d.data();s.id=d.id;services.push(s);});
      masters.sort(function(a,b){return (a.order||0)-(b.order||0);});
      services.sort(function(a,b){return (a.order||0)-(b.order||0);});
      var seed=[];
      if(!masters.length) seed.push(seedCollection('masters',DEF_MASTERS));
      if(!services.length) seed.push(seedCollection('services',DEF_SERVICES));
      if(seed.length){Promise.all(seed).then(loadCatalog);return;}
      if(!currentMasterId||!masters.some(function(m){return m.id===currentMasterId;}))currentMasterId=masters[0]?masters[0].id:null;
      renderMastersBar();
      render();
    }).catch(function(e){$('emptyMsg').textContent='Ошибка загрузки настроек: '+(e.code||e.message);});
  }
  function seedCollection(col,arr){
    var batch=db.batch();
    arr.forEach(function(it,i){var ref=db.collection(col).doc();batch.set(ref,Object.assign({order:i},it));});
    return batch.commit();
  }
  function renderMastersBar(){
    var bar=$('mastersBar');
    if(!masters.length){bar.innerHTML='<span class="empty-m">Добавьте мастера в «Настройки».</span>';return;}
    bar.innerHTML='';
    masters.forEach(function(m){
      var b=document.createElement('button');b.className='mtab'+(m.id===currentMasterId?' on':'');b.textContent=m.name;
      b.addEventListener('click',function(){currentMasterId=m.id;renderMastersBar();render();});
      bar.appendChild(b);
    });
  }
  function masterName(id){var m=masters.filter(function(x){return x.id===id;})[0];return m?m.name:'—';}
  function fillServiceSelect(sel,selName){
    sel.innerHTML='';services.forEach(function(s){var o=document.createElement('option');o.value=s.name;o.textContent=s.name;if(s.name===selName)o.selected=true;sel.appendChild(o);});
  }
  function fillMasterSelect(sel,selId){
    sel.innerHTML='';masters.forEach(function(m){var o=document.createElement('option');o.value=m.id;o.textContent=m.name;if(m.id===selId)o.selected=true;sel.appendChild(o);});
  }

  /* ---- week ---- */
  var weekStart=mondayOf(new Date()), days=[], byId={};
  $('prevW').addEventListener('click',function(){weekStart.setDate(weekStart.getDate()-7);render();});
  $('nextW').addEventListener('click',function(){weekStart.setDate(weekStart.getDate()+7);render();});
  $('todayBtn').addEventListener('click',function(){weekStart=mondayOf(new Date());render();});

  function render(){
    if(!db)return;
    if(!currentMasterId){$('calHead').innerHTML='';$('calBody').innerHTML='';$('range').textContent='—';$('emptyMsg').textContent='Нет мастеров. Добавьте в «Настройки».';return;}
    days=[];for(var i=0;i<7;i++){var d=new Date(weekStart);d.setDate(d.getDate()+i);days.push(d);}
    var a=ymd(days[0]),b=ymd(days[6]);
    $('range').textContent=days[0].getDate()+' '+MON[days[0].getMonth()]+' – '+days[6].getDate()+' '+MON[days[6].getMonth()]+' · '+masterName(currentMasterId);
    var tS=todayStr();
    var head='<div class="corner"></div>';
    days.forEach(function(d){var ds=ymd(d);head+='<div class="dh'+(ds===tS?' today':'')+(ds<tS?' past':'')+'"><small>'+DOW[(d.getDay()+6)%7]+'</small><b>'+d.getDate()+'</b></div>';});
    $('calHead').innerHTML=head;
    var hours=[];for(var h=W_START;h<W_END;h+=60)hours.push(h);
    var times='<div class="cal__times">'+hours.map(function(h){return '<div class="t" style="height:'+ROW+'px">'+hhmm(h)+'</div>';}).join('')+'</div>';
    var cols='';
    days.forEach(function(d,idx){var ds=ymd(d);cols+='<div class="cal__col'+(ds<tS?' past':'')+'" data-day="'+idx+'" data-date="'+ds+'">'+hours.map(function(){return '<div class="hline" style="height:'+ROW+'px"></div>';}).join('')+'</div>';});
    $('calBody').innerHTML=times+cols;

    byId={};$('emptyMsg').textContent='Загрузка…';
    db.collection('bookings').where('date','>=',a).where('date','<=',b).get().then(function(snap){
      var cnt=0;
      snap.forEach(function(doc){
        var bk=doc.data();if(bk.status==='cancelled')return;if(bk.masterId!==currentMasterId)return;bk.id=doc.id;byId[doc.id]=bk;
        var di=days.findIndex(function(d){return ymd(d)===bk.date;});if(di<0)return;
        var col=document.querySelector('.cal__col[data-day="'+di+'"]');if(!col)return;
        var dur=bk.duration||DUR, past=isPast(bk.date);
        var ev=document.createElement('div');ev.className='ev'+(past?' past':'');ev.dataset.id=bk.id;
        ev.style.top=((bk.start-W_START)*PPM+1)+'px';ev.style.height=(dur*PPM-3)+'px';
        ev.innerHTML='<b>'+hhmm(bk.start)+' '+(bk.name||'')+'</b><span>'+(bk.service||'')+'</span>';
        attachEvent(ev);col.appendChild(ev);cnt++;
      });
      $('emptyMsg').textContent=cnt?'':'У этого мастера на неделе записей нет.';
    }).catch(function(e){$('emptyMsg').textContent='Ошибка загрузки (проверьте правила Firestore): '+(e.code||e.message);});
  }

  /* ---- availability ---- */
  function occupiedFor(dateStr,masterId,excludeId){
    return db.collection('slots').where('date','==',dateStr).where('masterId','==',masterId).get().then(function(snap){
      var occ=new Set();snap.forEach(function(d){var s=d.data();if(s.bookingId!==excludeId)occ.add(s.min);});return occ;
    });
  }
  function fillTimes(sel,occ,selMin){
    sel.innerHTML='';var any=false;
    for(var s=W_START;s+DUR<=W_END;s+=STEP){
      var fits=cellsOf(s).every(function(m){return !occ.has(m);});
      var o=document.createElement('option');o.value=s;o.textContent=hhmm(s)+' – '+hhmm(s+DUR)+(fits?'':' — занято');
      if(!fits)o.disabled=true;if(s===selMin)o.selected=true;sel.appendChild(o);if(fits)any=true;
    }
    if(!any){var o2=document.createElement('option');o2.value='';o2.disabled=true;o2.selected=true;o2.textContent='Нет свободного окна';sel.insertBefore(o2,sel.firstChild);}
    return any;
  }
  function slotRef(dateStr,masterId,min){return db.collection('slots').doc(dateStr+'_'+masterId+'_'+min);}
  function reserve(tx,dateStr,masterId,start,bookingId){
    var cells=cellsOf(start);
    var refs=cells.map(function(m){return slotRef(dateStr,masterId,m);});
    return Promise.all(refs.map(function(r){return tx.get(r);})).then(function(snaps){
      snaps.forEach(function(s){if(s.exists&&s.data().bookingId!==bookingId)throw new Error('TAKEN');});
      return {cells:cells,refs:refs};
    });
  }

  /* ---- detail / edit / cancel ---- */
  var ov=$('ov'), curId=null;
  function openDetail(id){
    var bk=byId[id];if(!bk)return;curId=id;
    var past=isPast(bk.date);
    $('ovName').textContent=bk.name||'Без имени';
    $('ovPhone').textContent=(bk.phone||'—')+' · 2 часа'+(bk.source==='admin'?' · вручную':'')+(past?' · прошедшая (только просмотр)':'');
    fillServiceSelect($('ovService'),bk.service);
    fillMasterSelect($('ovMaster'),bk.masterId);
    $('ovComment').value=bk.comment||'';
    $('ovDate').value=bk.date;$('ovDate').min=todayStr();$('ovMsg').textContent='';
    reloadOvTimes(bk.start);
    // прошлое — только просмотр
    ['ovService','ovMaster','ovComment','ovDate','ovTime'].forEach(function(f){$(f).disabled=past;});
    $('ovSave').style.display=past?'none':'';
    $('ovCancel').style.display=past?'none':'';
    ov.classList.add('on');ov.setAttribute('aria-hidden','false');
  }
  function reloadOvTimes(selMin){
    $('ovTime').innerHTML='<option>загрузка…</option>';
    occupiedFor($('ovDate').value,$('ovMaster').value,curId).then(function(occ){fillTimes($('ovTime'),occ,selMin);});
  }
  $('ovDate').addEventListener('change',function(){reloadOvTimes(null);});
  $('ovMaster').addEventListener('change',function(){reloadOvTimes(null);});
  function closeOv(){ov.classList.remove('on');ov.setAttribute('aria-hidden','true');curId=null;}
  ov.querySelectorAll('[data-ov-close]').forEach(function(c){c.addEventListener('click',closeOv);});
  document.addEventListener('keydown',function(e){if(e.key==='Escape'){closeOv();closeAdd();closeSet();}});

  $('ovSave').addEventListener('click',function(){
    if(!curId)return;var bk=byId[curId];
    if(isPast(bk.date)){setMsg($('ovMsg'),'Прошедшую запись менять нельзя.','err');return;}
    var nd=$('ovDate').value,ns=parseInt($('ovTime').value,10),nm=$('ovMaster').value,nsrv=$('ovService').value,ncom=$('ovComment').value.trim();
    if(!nd||isNaN(ns)){setMsg($('ovMsg'),'Выберите дату и время.','err');return;}
    if(isPast(nd)){setMsg($('ovMsg'),'Нельзя перенести в прошлое.','err');return;}
    var moved=(nd!==bk.date||ns!==bk.start||nm!==bk.masterId);
    setMsg($('ovMsg'),'Сохраняем…','');
    if(!moved){
      db.collection('bookings').doc(curId).update({service:nsrv,comment:ncom}).then(function(){closeOv();render();})
      .catch(function(e){setMsg($('ovMsg'),'Ошибка: '+(e.code||e.message),'err');});return;
    }
    moveBooking(curId,bk,nd,ns,nm,{service:nsrv,comment:ncom}).then(function(){closeOv();render();})
    .catch(function(err){setMsg($('ovMsg'),err.message==='TAKEN'?'Новое время занято у этого мастера.':'Ошибка: '+(err.code||err.message),'err');});
  });

  $('ovCancel').addEventListener('click',function(){
    if(!curId)return;var bk=byId[curId];
    if(isPast(bk.date)){setMsg($('ovMsg'),'Прошедшую запись удалять нельзя.','err');return;}
    if(!confirm('Отменить запись '+(bk.name||'')+' на '+bk.date+' '+hhmm(bk.start)+'?'))return;
    var batch=db.batch();
    batch.delete(db.collection('bookings').doc(curId));
    cellsOf(bk.start).forEach(function(m){batch.delete(slotRef(bk.date,bk.masterId,m));});
    if(bk.phone) batch.delete(db.collection('limits').doc(bk.date+'_'+digits(bk.phone)));
    batch.commit().then(function(){closeOv();render();}).catch(function(e){setMsg($('ovMsg'),'Ошибка отмены: '+(e.code||e.message),'err');});
  });

  function moveBooking(id,bk,nd,ns,nm,extra){
    var oldCells=cellsOf(bk.start), oldMaster=bk.masterId, oldDate=bk.date;
    return db.runTransaction(function(tx){
      return reserve(tx,nd,nm,ns,id).then(function(r){
        oldCells.forEach(function(m){tx.delete(slotRef(oldDate,oldMaster,m));});
        r.refs.forEach(function(ref,i){tx.set(ref,{date:nd,masterId:nm,min:r.cells[i],bookingId:id});});
        var upd={date:nd,start:ns,end:ns+DUR,duration:DUR,masterId:nm};
        if(extra){if(extra.service!==undefined)upd.service=extra.service;if(extra.comment!==undefined)upd.comment=extra.comment;}
        tx.update(db.collection('bookings').doc(id),upd);
      });
    });
  }

  /* ---- manual add ---- */
  var addOv=$('addOv');
  function openAdd(){
    if(!masters.length){alert('Сначала добавьте мастера в «Настройки».');return;}
    $('adName').value='';$('adPhone').value='';$('adComment').value='';
    fillServiceSelect($('adService'),null);
    fillMasterSelect($('adMaster'),currentMasterId);
    $('adDate').value=todayStr();$('adDate').min=todayStr();$('adMsg').textContent='';
    reloadAddTimes();addOv.classList.add('on');addOv.setAttribute('aria-hidden','false');
  }
  function closeAdd(){addOv.classList.remove('on');addOv.setAttribute('aria-hidden','true');}
  function reloadAddTimes(){
    $('adTime').innerHTML='<option>загрузка…</option>';
    occupiedFor($('adDate').value,$('adMaster').value,null).then(function(occ){fillTimes($('adTime'),occ,null);});
  }
  maskPhone($('adPhone'));
  $('addBtn').addEventListener('click',openAdd);
  addOv.querySelectorAll('[data-add-close]').forEach(function(c){c.addEventListener('click',closeAdd);});
  $('adDate').addEventListener('change',reloadAddTimes);
  $('adMaster').addEventListener('change',reloadAddTimes);
  $('adSave').addEventListener('click',function(){
    var name=$('adName').value.trim(),phone=$('adPhone').value.trim(),service=$('adService').value,comment=$('adComment').value.trim();
    var dateStr=$('adDate').value,S=parseInt($('adTime').value,10),mId=$('adMaster').value;
    if(!name){setMsg($('adMsg'),'Введите имя.','err');return;}
    if(!dateStr||isNaN(S)){setMsg($('adMsg'),'Выберите дату и время.','err');return;}
    if(isPast(dateStr)){setMsg($('adMsg'),'Нельзя создать запись в прошлом.','err');return;}
    setMsg($('adMsg'),'Создаём…','');
    var bRef=db.collection('bookings').doc();
    db.runTransaction(function(tx){
      return reserve(tx,dateStr,mId,S,bRef.id).then(function(r){
        tx.set(bRef,{name:name,phone:phone,service:service,comment:comment,date:dateStr,start:S,end:S+DUR,duration:DUR,masterId:mId,status:'active',source:'admin',createdAt:firebase.firestore.FieldValue.serverTimestamp()});
        r.refs.forEach(function(ref,i){tx.set(ref,{date:dateStr,masterId:mId,min:r.cells[i],bookingId:bRef.id});});
      });
    }).then(function(){closeAdd();render();})
    .catch(function(err){setMsg($('adMsg'),err.message==='TAKEN'?'Это время занято у мастера.':'Ошибка: '+(err.code||err.message),'err');});
  });

  function setMsg(el,t,type){el.textContent=t;el.className='msg'+(type?' msg--'+type:'');}

  /* ---- настройки (мастера/услуги) ---- */
  var setOv=$('setOv');
  function rowMaster(m){
    var row=document.createElement('div');row.className='set-row';row.dataset.id=m?m.id:'';
    var inp=document.createElement('input');inp.value=m?m.name:'';inp.placeholder='Имя мастера';inp.className='mname';
    var del=document.createElement('button');del.type='button';del.className='del';del.textContent='×';del.title='Удалить';
    del.addEventListener('click',function(){row.remove();});
    row.appendChild(inp);row.appendChild(del);return row;
  }
  function rowService(s){
    var row=document.createElement('div');row.className='set-row';row.dataset.id=s?s.id:'';
    var inp=document.createElement('input');inp.value=s?s.name:'';inp.placeholder='Название услуги';inp.className='sname';
    var pr=document.createElement('input');pr.value=s?(s.price||''):'';pr.placeholder='цена';pr.className='price sprice';
    var del=document.createElement('button');del.type='button';del.className='del';del.textContent='×';del.title='Удалить';
    del.addEventListener('click',function(){row.remove();});
    row.appendChild(inp);row.appendChild(pr);row.appendChild(del);return row;
  }
  function openSet(){
    var mb=$('setMasters');mb.innerHTML='';masters.forEach(function(m){mb.appendChild(rowMaster(m));});
    var sb=$('setServices');sb.innerHTML='';services.forEach(function(s){sb.appendChild(rowService(s));});
    $('setMsg').textContent='';setOv.classList.add('on');setOv.setAttribute('aria-hidden','false');
  }
  function closeSet(){setOv.classList.remove('on');setOv.setAttribute('aria-hidden','true');}
  $('setBtn').addEventListener('click',openSet);
  setOv.querySelectorAll('[data-set-close]').forEach(function(c){c.addEventListener('click',closeSet);});
  $('setAddMaster').addEventListener('click',function(){$('setMasters').appendChild(rowMaster(null));});
  $('setAddService').addEventListener('click',function(){$('setServices').appendChild(rowService(null));});

  $('setSave').addEventListener('click',function(){
    var mRows=Array.prototype.slice.call($('setMasters').querySelectorAll('.set-row'));
    var sRows=Array.prototype.slice.call($('setServices').querySelectorAll('.set-row'));
    var newM=mRows.map(function(r){return {id:r.dataset.id||null,name:r.querySelector('.mname').value.trim()};}).filter(function(x){return x.name;});
    var newS=sRows.map(function(r){return {id:r.dataset.id||null,name:r.querySelector('.sname').value.trim(),price:r.querySelector('.sprice').value.trim()};}).filter(function(x){return x.name;});
    if(!newM.length){setMsg($('setMsg'),'Нужен хотя бы один мастер.','err');return;}
    if(!newS.length){setMsg($('setMsg'),'Нужна хотя бы одна услуга.','err');return;}
    setMsg($('setMsg'),'Сохраняем…','');
    var batch=db.batch();
    var keepM={},keepS={};
    newM.forEach(function(m,i){var ref=m.id?db.collection('masters').doc(m.id):db.collection('masters').doc();keepM[ref.id]=1;batch.set(ref,{name:m.name,order:i});});
    newS.forEach(function(s,i){var ref=s.id?db.collection('services').doc(s.id):db.collection('services').doc();keepS[ref.id]=1;batch.set(ref,{name:s.name,price:s.price,order:i});});
    masters.forEach(function(m){if(!keepM[m.id])batch.delete(db.collection('masters').doc(m.id));});
    services.forEach(function(s){if(!keepS[s.id])batch.delete(db.collection('services').doc(s.id));});
    batch.commit().then(function(){closeSet();loadCatalog();})
    .catch(function(e){setMsg($('setMsg'),'Ошибка сохранения: '+(e.code||e.message),'err');});
  });

  /* ---- клик / двойной клик (arm) / drag ---- */
  var drag=null, ghost=null;
  var HOLD_MS=300;
  function attachEvent(ev){
    var holdTimer=null,sx=0,sy=0;
    function cancelHold(){if(holdTimer){clearTimeout(holdTimer);holdTimer=null;}ev.classList.remove('pending-hold');}
    // двойной клик — открыть карточку
    ev.addEventListener('dblclick',function(e){e.preventDefault();openDetail(ev.dataset.id);});
    // нажать и удерживать — перетащить
    ev.addEventListener('pointerdown',function(e){
      if(e.button!==undefined&&e.button!==0)return;
      var bk=byId[ev.dataset.id];if(!bk||isPast(bk.date))return;
      sx=e.clientX;sy=e.clientY;ev.classList.add('pending-hold');
      holdTimer=setTimeout(function(){holdTimer=null;ev.classList.remove('pending-hold');beginDrag(ev,sx,sy);},HOLD_MS);
    });
    ev.addEventListener('pointermove',function(e){if(holdTimer&&(Math.abs(e.clientX-sx)>8||Math.abs(e.clientY-sy)>8))cancelHold();});
    ev.addEventListener('pointerup',cancelHold);
    ev.addEventListener('pointercancel',cancelHold);
    ev.addEventListener('pointerleave',cancelHold);
  }
  function beginDrag(ev,sx,sy){
    var bk=byId[ev.dataset.id];if(!bk||isPast(bk.date))return;
    var r=ev.getBoundingClientRect();
    drag={el:ev,id:ev.dataset.id,offX:sx-r.left,offY:sy-r.top,targetDate:null,targetStart:null};
    ev.classList.add('dragging');
    ev.style.position='fixed';ev.style.width=r.width+'px';ev.style.zIndex=9999;
    ev.style.left=(sx-drag.offX)+'px';ev.style.top=(sy-drag.offY)+'px';
    ghost=document.createElement('div');ghost.className='drop-ghost';ghost.style.display='none';
    document.body.addEventListener('pointermove',onMove);
    document.body.addEventListener('pointerup',onUp,{once:true});
  }
  function clearArmed(){document.querySelectorAll('.ev.armed').forEach(function(x){x.classList.remove('armed');});}
  function onMove(e){
    if(!drag)return;
    drag.el.style.left=(e.clientX-drag.offX)+'px';drag.el.style.top=(e.clientY-drag.offY)+'px';
    document.querySelectorAll('.cal__col').forEach(function(c){c.classList.remove('drop');});
    var col=null;
    document.querySelectorAll('.cal__col').forEach(function(c){var r=c.getBoundingClientRect();if(e.clientX>=r.left&&e.clientX<=r.right&&e.clientY>=r.top&&e.clientY<=r.bottom)col=c;});
    if(!col||col.classList.contains('past')){if(ghost)ghost.style.display='none';drag.targetDate=null;return;}
    col.classList.add('drop');
    var cr=col.getBoundingClientRect();
    var y=e.clientY-drag.offY-cr.top;
    var startMin=W_START+Math.round((y/PPM)/STEP)*STEP;
    if(startMin<W_START)startMin=W_START;if(startMin+DUR>W_END)startMin=W_END-DUR;
    drag.targetDate=col.dataset.date;drag.targetStart=startMin;
    if(ghost.parentNode!==col)col.appendChild(ghost);
    ghost.style.display='block';ghost.style.top=((startMin-W_START)*PPM)+'px';ghost.style.height=(DUR*PPM)+'px';
  }
  function onUp(){
    document.body.removeEventListener('pointermove',onMove);
    document.querySelectorAll('.cal__col').forEach(function(c){c.classList.remove('drop');});
    if(ghost&&ghost.parentNode)ghost.parentNode.removeChild(ghost);ghost=null;
    var d=drag;drag=null;if(!d)return;
    d.el._dragged=true;d.el.classList.remove('dragging','armed');
    if(d.targetDate==null||isPast(d.targetDate)){render();return;}
    var bk=byId[d.id];
    if(bk&&d.targetDate===bk.date&&d.targetStart===bk.start){render();return;}
    moveBooking(d.id,bk,d.targetDate,d.targetStart,bk.masterId,null).then(function(){render();})
    .catch(function(err){alert(err.message==='TAKEN'?'Это время уже занято.':'Ошибка переноса: '+(err.code||err.message));render();});
  }
  document.addEventListener('pointerdown',function(e){if(!e.target.closest('.ev'))clearArmed();});
})();
