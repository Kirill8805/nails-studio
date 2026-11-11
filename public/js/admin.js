/* ============================================================
   ATELIER NÉVE — админ-кабинет (15-мин старт, фикс 2 ч, drag&drop)
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

  var $=function(id){return document.getElementById(id);};
  function pad(n){return (n<10?'0':'')+n;}
  function hhmm(m){return pad(Math.floor(m/60))+':'+pad(m%60);}
  function ymd(d){return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());}
  function mondayOf(d){var x=new Date(d);var w=(x.getDay()+6)%7;x.setDate(x.getDate()-w);x.setHours(0,0,0,0);return x;}
  function cellsOf(s){var a=[];for(var m=s;m<s+DUR;m+=STEP)a.push(m);return a;}
  function digits(p){return (p||'').replace(/\D/g,'');}

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
    if(user&&user.email===ADMIN){loginSec.style.display='none';app.classList.add('on');render();}
    else if(user){auth.signOut();var m=$('loginMsg');m.className='msg msg--err';m.textContent='Эта почта не администратор.';loginSec.style.display='grid';app.classList.remove('on');}
    else{loginSec.style.display='grid';app.classList.remove('on');}
  });}
  $('logout').addEventListener('click',function(){if(auth)auth.signOut();});

  /* ---- week ---- */
  var weekStart=mondayOf(new Date()), days=[], byId={};
  $('prevW').addEventListener('click',function(){weekStart.setDate(weekStart.getDate()-7);render();});
  $('nextW').addEventListener('click',function(){weekStart.setDate(weekStart.getDate()+7);render();});
  $('todayBtn').addEventListener('click',function(){weekStart=mondayOf(new Date());render();});

  function render(){
    if(!db)return;
    days=[];for(var i=0;i<7;i++){var d=new Date(weekStart);d.setDate(d.getDate()+i);days.push(d);}
    var a=ymd(days[0]),b=ymd(days[6]);
    $('range').textContent=days[0].getDate()+' '+MON[days[0].getMonth()]+' – '+days[6].getDate()+' '+MON[days[6].getMonth()];
    var todayS=ymd(new Date());
    var head='<div class="corner"></div>';
    days.forEach(function(d){head+='<div class="dh'+(ymd(d)===todayS?' today':'')+'"><small>'+DOW[(d.getDay()+6)%7]+'</small><b>'+d.getDate()+'</b></div>';});
    $('calHead').innerHTML=head;
    var hours=[];for(var h=W_START;h<W_END;h+=60)hours.push(h);
    var times='<div class="cal__times">'+hours.map(function(h){return '<div class="t" style="height:'+ROW+'px">'+hhmm(h)+'</div>';}).join('')+'</div>';
    var cols='';
    days.forEach(function(d,idx){cols+='<div class="cal__col" data-day="'+idx+'" data-date="'+ymd(d)+'">'+hours.map(function(){return '<div class="hline" style="height:'+ROW+'px"></div>';}).join('')+'</div>';});
    $('calBody').innerHTML=times+cols;

    byId={};$('emptyMsg').textContent='Загрузка…';
    db.collection('bookings').where('date','>=',a).where('date','<=',b).get().then(function(snap){
      var cnt=0;
      snap.forEach(function(doc){
        var bk=doc.data();if(bk.status==='cancelled')return;bk.id=doc.id;byId[doc.id]=bk;
        var di=days.findIndex(function(d){return ymd(d)===bk.date;});if(di<0)return;
        var col=document.querySelector('.cal__col[data-day="'+di+'"]');if(!col)return;
        var dur=bk.duration||DUR;
        var ev=document.createElement('div');ev.className='ev';ev.dataset.id=bk.id;
        ev.style.top=((bk.start-W_START)*PPM+1)+'px';ev.style.height=(dur*PPM-3)+'px';
        ev.innerHTML='<b>'+hhmm(bk.start)+' '+(bk.name||'')+'</b><span>'+(bk.service||'')+'</span>';
        attachEvent(ev);col.appendChild(ev);cnt++;
      });
      $('emptyMsg').textContent=cnt?'':'На этой неделе записей нет.';
    }).catch(function(e){$('emptyMsg').textContent='Ошибка загрузки (проверьте правила Firestore): '+(e.code||e.message);});
  }

  /* ---- availability ---- */
  function occupiedFor(dateStr,excludeId){
    return db.collection('slots').where('date','==',dateStr).get().then(function(snap){
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
  function reserve(tx,dateStr,start,bookingId){
    var cells=cellsOf(start);
    var refs=cells.map(function(m){return db.collection('slots').doc(dateStr+'_'+m);});
    return Promise.all(refs.map(function(r){return tx.get(r);})).then(function(snaps){
      snaps.forEach(function(s){if(s.exists&&s.data().bookingId!==bookingId)throw new Error('TAKEN');});
      return {cells:cells,refs:refs};
    });
  }

  /* ---- detail / edit / cancel ---- */
  var ov=$('ov'), curId=null;
  function openDetail(id){
    var bk=byId[id];if(!bk)return;curId=id;
    $('ovName').textContent=bk.name||'Без имени';
    $('ovPhone').textContent=(bk.phone||'—')+' · 2 часа'+(bk.source==='admin'?' · добавлено вручную':'');
    $('ovService').value=bk.service||'Маникюр';
    $('ovComment').value=bk.comment||'';
    $('ovDate').value=bk.date;$('ovMsg').textContent='';
    reloadOvTimes(bk.start);
    ov.classList.add('on');ov.setAttribute('aria-hidden','false');
  }
  function reloadOvTimes(selMin){
    $('ovTime').innerHTML='<option>загрузка…</option>';
    occupiedFor($('ovDate').value,curId).then(function(occ){fillTimes($('ovTime'),occ,selMin);});
  }
  $('ovDate').addEventListener('change',function(){reloadOvTimes(null);});
  function closeOv(){ov.classList.remove('on');ov.setAttribute('aria-hidden','true');curId=null;}
  ov.querySelectorAll('[data-ov-close]').forEach(function(c){c.addEventListener('click',closeOv);});
  document.addEventListener('keydown',function(e){if(e.key==='Escape'){closeOv();closeAdd();}});

  $('ovSave').addEventListener('click',function(){
    if(!curId)return;var bk=byId[curId];
    var nd=$('ovDate').value,ns=parseInt($('ovTime').value,10),nsrv=$('ovService').value,ncom=$('ovComment').value.trim();
    if(!nd||isNaN(ns)){setMsg($('ovMsg'),'Выберите дату и время.','err');return;}
    var moved=(nd!==bk.date||ns!==bk.start);
    setMsg($('ovMsg'),'Сохраняем…','');
    if(!moved){
      db.collection('bookings').doc(curId).update({service:nsrv,comment:ncom}).then(function(){closeOv();render();})
      .catch(function(e){setMsg($('ovMsg'),'Ошибка: '+(e.code||e.message),'err');});return;
    }
    moveBooking(curId,bk,nd,ns,{service:nsrv,comment:ncom}).then(function(){closeOv();render();})
    .catch(function(err){setMsg($('ovMsg'),err.message==='TAKEN'?'Новое время занято.':'Ошибка: '+(err.code||err.message),'err');});
  });

  $('ovCancel').addEventListener('click',function(){
    if(!curId)return;var bk=byId[curId];
    if(!confirm('Отменить запись '+(bk.name||'')+' на '+bk.date+' '+hhmm(bk.start)+'?'))return;
    var batch=db.batch();
    batch.delete(db.collection('bookings').doc(curId));
    cellsOf(bk.start).forEach(function(m){batch.delete(db.collection('slots').doc(bk.date+'_'+m));});
    if(bk.phone) batch.delete(db.collection('limits').doc(bk.date+'_'+digits(bk.phone))); // снять дневной лимит
    batch.commit().then(function(){closeOv();render();}).catch(function(e){setMsg($('ovMsg'),'Ошибка отмены: '+(e.code||e.message),'err');});
  });

  function moveBooking(id,bk,nd,ns,extra){
    var oldCells=cellsOf(bk.start);
    return db.runTransaction(function(tx){
      return reserve(tx,nd,ns,id).then(function(r){
        oldCells.forEach(function(m){tx.delete(db.collection('slots').doc(bk.date+'_'+m));});
        r.refs.forEach(function(ref,i){tx.set(ref,{date:nd,min:r.cells[i],bookingId:id});});
        var upd={date:nd,start:ns,end:ns+DUR,duration:DUR};
        if(extra){if(extra.service!==undefined)upd.service=extra.service;if(extra.comment!==undefined)upd.comment=extra.comment;}
        tx.update(db.collection('bookings').doc(id),upd);
      });
    });
  }

  /* ---- manual add ---- */
  var addOv=$('addOv');
  function openAdd(){
    $('adName').value='';$('adPhone').value='';$('adComment').value='';$('adService').value='Маникюр';
    $('adDate').value=ymd(new Date());$('adDate').min=ymd(new Date());$('adMsg').textContent='';
    reloadAddTimes();addOv.classList.add('on');addOv.setAttribute('aria-hidden','false');
  }
  function closeAdd(){addOv.classList.remove('on');addOv.setAttribute('aria-hidden','true');}
  function reloadAddTimes(){
    $('adTime').innerHTML='<option>загрузка…</option>';
    occupiedFor($('adDate').value,null).then(function(occ){fillTimes($('adTime'),occ,null);});
  }
  $('addBtn').addEventListener('click',openAdd);
  addOv.querySelectorAll('[data-add-close]').forEach(function(c){c.addEventListener('click',closeAdd);});
  $('adDate').addEventListener('change',reloadAddTimes);
  $('adSave').addEventListener('click',function(){
    var name=$('adName').value.trim(),phone=$('adPhone').value.trim(),service=$('adService').value,comment=$('adComment').value.trim();
    var dateStr=$('adDate').value,S=parseInt($('adTime').value,10);
    if(!name){setMsg($('adMsg'),'Введите имя.','err');return;}
    if(!dateStr||isNaN(S)){setMsg($('adMsg'),'Выберите дату и время.','err');return;}
    setMsg($('adMsg'),'Создаём…','');
    var bRef=db.collection('bookings').doc();
    db.runTransaction(function(tx){
      return reserve(tx,dateStr,S,bRef.id).then(function(r){
        tx.set(bRef,{name:name,phone:phone,service:service,comment:comment,date:dateStr,start:S,end:S+DUR,duration:DUR,status:'active',source:'admin',createdAt:firebase.firestore.FieldValue.serverTimestamp()});
        r.refs.forEach(function(ref,i){tx.set(ref,{date:dateStr,min:r.cells[i],bookingId:bRef.id});});
      });
    }).then(function(){closeAdd();render();})
    .catch(function(err){setMsg($('adMsg'),err.message==='TAKEN'?'Это время занято.':'Ошибка: '+(err.code||err.message),'err');});
  });

  function setMsg(el,t,type){el.textContent=t;el.className='msg'+(type?' msg--'+type:'');}

  /* ---- клик / двойной клик (arm) / drag ---- */
  
var drag = null, ghost = null;
var holdTimer = null;
var holdStart = null;
var HOLD_MS = 500;

// Подключение событий
function attachEvent(ev) {

  // Двойной клик — открыть карточку
  ev.addEventListener('dblclick', function(e) {
    e.preventDefault();
    e.stopPropagation();

    if (ev._dragged) {
      ev._dragged = false;
      return;
    }

    openDetail(ev.dataset.id);
  });

  // Начало удержания
  ev.addEventListener('pointerdown', function(e) {
    if (e.button !== 0 || drag) return;

    clearTimeout(holdTimer);

    var id = ev.dataset.id;
    var bk = byId[id];
    if (!bk) return;

    holdStart = {
      el: ev,
      id: id,
      x: e.clientX,
      y: e.clientY,
      pointerId: e.pointerId
    };

    // Через 500 мс запускаем перенос
    holdTimer = setTimeout(function() {
      if (!holdStart || holdStart.el !== ev) return;

      var r = ev.getBoundingClientRect();

      drag = {
        el: ev,
        id: id,
        offX: holdStart.x - r.left,
        offY: holdStart.y - r.top,
        targetDate: null,
        targetStart: null
      };

      ev.classList.add('dragging');

      ev.style.position = 'fixed';
      ev.style.width = r.width + 'px';
      ev.style.left = r.left + 'px';
      ev.style.top = r.top + 'px';
      ev.style.zIndex = 9999;

      ghost = document.createElement('div');
      ghost.className = 'drop-ghost';
      ghost.style.display = 'none';

      holdStart = null;
    }, HOLD_MS);
  });

  // Движение указателя
  ev.addEventListener('pointermove', function(e) {
    if (
      holdStart &&
      holdStart.pointerId === e.pointerId
    ) {
      var distance = Math.hypot(
        e.clientX - holdStart.x,
        e.clientY - holdStart.y
      );

      // Если начали двигать раньше 500 мс —
      // отменяем долгое нажатие
      if (distance > 8) {
        clearTimeout(holdTimer);
        holdStart = null;
      }
    }

    if (drag && drag.el === ev) {
      onMove(e);
    }
  });

  // Отпустили кнопку
  ev.addEventListener('pointerup', function(e) {
    clearTimeout(holdTimer);
    holdStart = null;

    if (drag && drag.el === ev) {
      onUp();
    }
  });

  // Отмена нажатия
  ev.addEventListener('pointercancel', function() {
    clearTimeout(holdTimer);
    holdStart = null;

    if (drag) {
      onUp();
    }
  });

  // Не показывать стандартное меню
  ev.addEventListener('contextmenu', function(e) {
    e.preventDefault();
  });
}

// Снять выделение
function clearArmed() {
  document.querySelectorAll('.ev.armed')
    .forEach(function(x) {
      x.classList.remove('armed');
    });
}

// Движение записи
function onMove(e) {
  if (!drag) return;

  drag.el.style.left =
    (e.clientX - drag.offX) + 'px';

  drag.el.style.top =
    (e.clientY - drag.offY) + 'px';

  document.querySelectorAll('.cal__col')
    .forEach(function(c) {
      c.classList.remove('drop');
    });

  var col = null;

  document.querySelectorAll('.cal__col')
    .forEach(function(c) {
      var r = c.getBoundingClientRect();

      if (
        e.clientX >= r.left &&
        e.clientX <= r.right &&
        e.clientY >= r.top &&
        e.clientY <= r.bottom
      ) {
        col = c;
      }
    });

  if (!col) {
    if (ghost) ghost.style.display = 'none';
    drag.targetDate = null;
    return;
  }

  col.classList.add('drop');

  var cr = col.getBoundingClientRect();
  var y = e.clientY - drag.offY - cr.top;

  var startMin =
    W_START + Math.round((y / PPM) / STEP) * STEP;

  if (startMin < W_START) {
    startMin = W_START;
  }

  if (startMin + DUR > W_END) {
    startMin = W_END - DUR;
  }

  drag.targetDate = col.dataset.date;
  drag.targetStart = startMin;

  if (ghost.parentNode !== col) {
    col.appendChild(ghost);
  }

  ghost.style.display = 'block';

  ghost.style.top =
    ((startMin - W_START) * PPM) + 'px';

  ghost.style.height =
    (DUR * PPM) + 'px';
}

// Завершение перетаскивания
function onUp() {
  document.querySelectorAll('.cal__col')
    .forEach(function(c) {
      c.classList.remove('drop');
    });

  if (ghost && ghost.parentNode) {
    ghost.parentNode.removeChild(ghost);
  }

  ghost = null;

  var d = drag;
  drag = null;

  if (!d) return;

  d.el._dragged = true;
  d.el.classList.remove('dragging', 'armed');

  if (d.targetDate == null) {
    render();
    return;
  }

  var bk = byId[d.id];

  if (
    bk &&
    d.targetDate === bk.date &&
    d.targetStart === bk.start
  ) {
    render();
    return;
  }

  moveBooking(
    d.id,
    bk,
    d.targetDate,
    d.targetStart,
    null
  )
  .then(function() {
    render();
  })
  .catch(function(err) {
    alert(
      err.message === 'TAKEN'
        ? 'Это время уже занято.'
        : 'Ошибка переноса: ' +
          (err.code || err.message)
    );

    render();
  });
}

  document.addEventListener('pointerdown',function(e){if(!e.target.closest('.ev'))clearArmed();});
})();
