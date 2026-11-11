/* ============================================================
   ATELIER NÉVE — онлайн-запись (Firestore + Phone Auth)
   Защита: App Check (капча) · SMS-подтверждение номера при первой
   записи с устройства · лимит maxPerDay/день на номер · IP-лимит
   обеспечивает сам Phone Auth на стороне Google.
   Ячейки по 15 минут: slots/{date}_{min}. Длительность фиксирована.
   ============================================================ */
(function(){
  'use strict';
  var CFG = window.ATELIER_CONFIG || {};
  var ADMIN=CFG.adminEmail||'admin@gmail.com';
  var W_START=(CFG.workStart||9)*60, W_END=(CFG.workEnd||19)*60;
  var STEP=CFG.stepMin||15, DUR=CFG.slotMin||120, MAXDAY=CFG.maxPerDay||1;
  var LS_KEY='atelier_neve_bookings';

  var dateInp=document.getElementById('bdate'), timeSel=document.getElementById('btime'),
      hint=document.getElementById('slotHint'), form=document.getElementById('bookForm'),
      submit=document.getElementById('bookSubmit');
  var smsStep=document.getElementById('smsStep'), smsCode=document.getElementById('smsCode'),
      smsMsg=document.getElementById('smsMsg'), smsConfirm=document.getElementById('smsConfirm'),
      smsResend=document.getElementById('smsResend'), smsPhoneEl=document.getElementById('smsPhone');

  function pad(n){return (n<10?'0':'')+n;}
  function hhmm(m){return pad(Math.floor(m/60))+':'+pad(m%60);}
  function fmtDateRu(s){var p=s.split('-');return p[2]+'.'+p[1]+'.'+p[0];}
  function cellsOf(s){var a=[];for(var m=s;m<s+DUR;m+=STEP)a.push(m);return a;}
  function digits(p){return (p||'').replace(/\D/g,'');}
  function fbReady(){return window.FB&&window.FB.ready&&window.FB.db;}
  function setHint(msg,type){hint.textContent=msg||'';hint.className='slot-hint'+(type?' slot-hint--'+type:'');}
  function setSms(msg,type){if(smsMsg){smsMsg.textContent=msg||'';smsMsg.className='slot-hint'+(type?' slot-hint--'+type:'');}}

  // Телефон Казахстана → формат E.164 (+7XXXXXXXXXX)
  function toE164(p){
    var d=digits(p);
    if(d.length===11&&d[0]==='8') return '+7'+d.slice(1);
    if(d.length===11&&d[0]==='7') return '+'+d;
    if(d.length===10) return '+7'+d;
    return '+'+d;
  }

  var now=new Date();
  var todayStr=now.getFullYear()+'-'+pad(now.getMonth()+1)+'-'+pad(now.getDate());
  if(dateInp){dateInp.min=todayStr;var mx=new Date(now.getTime()+60*86400000);dateInp.max=mx.getFullYear()+'-'+pad(mx.getMonth()+1)+'-'+pad(mx.getDate());}

  var occupied=new Set();

  function rebuildTimes(){
    if(!timeSel)return;
    var nowMin=(dateInp.value===todayStr)?(now.getHours()*60+now.getMinutes()):-1;
    timeSel.innerHTML='';var any=false;
    for(var s=W_START;s+DUR<=W_END;s+=STEP){
      var fits=cellsOf(s).every(function(m){return !occupied.has(m);});
      var past=(s<=nowMin);
      var o=document.createElement('option');o.value=s;o.textContent=hhmm(s)+' – '+hhmm(s+DUR);
      if(!fits){o.disabled=true;o.textContent+=' — занято';}
      else if(past){o.disabled=true;o.textContent+=' — прошло';}
      else any=true;
      timeSel.appendChild(o);
    }
    var ph=document.createElement('option');ph.value='';ph.disabled=true;ph.selected=true;
    ph.textContent=any?'Выберите время':'Нет свободного окна';
    timeSel.insertBefore(ph,timeSel.firstChild);
    if(!any&&dateInp.value)setHint('На эту дату нет свободного времени — выберите другой день.','warn');else setHint('');
  }

  function loadAvailability(){
    if(!dateInp||!dateInp.value){timeSel.innerHTML='<option value="" disabled selected>Сначала выберите дату</option>';return;}
    if(!fbReady()){occupied=new Set();rebuildTimes();setHint('⚠ Онлайн-запись заработает после подключения Firebase (firebase-config.js).','warn');return;}
    setHint('Загружаем свободное время…');
    window.FB.db.collection('slots').where('date','==',dateInp.value).get().then(function(snap){
      occupied=new Set();snap.forEach(function(d){occupied.add(d.data().min);});rebuildTimes();
    }).catch(function(){occupied=new Set();rebuildTimes();setHint('Не удалось загрузить время.','warn');});
  }
  if(dateInp)dateInp.addEventListener('change',loadAvailability);
  document.querySelectorAll('[data-book]').forEach(function(b){b.addEventListener('click',function(){setTimeout(function(){if(dateInp&&!dateInp.value)dateInp.value=todayStr;resetSmsStep();loadAvailability();},60);});});

  /* ---- Мои записи (localStorage) ---- */
  function readMine(){try{return JSON.parse(localStorage.getItem(LS_KEY)||'[]');}catch(e){return [];}}
  function saveMine(l){try{localStorage.setItem(LS_KEY,JSON.stringify(l));}catch(e){}}
  function addMine(r){var l=readMine();l.push(r);saveMine(l);}
  function renderMine(){
    var box=document.getElementById('myList');if(!box)return;
    var nowT=new Date();var list=readMine().filter(function(r){return new Date(r.date+'T'+hhmm(r.end)+':00')>=nowT;}).sort(function(a,b){return (a.date+pad(a.start))<(b.date+pad(b.start))?-1:1;});
    if(!list.length){box.innerHTML='<p class="my-empty">Пока нет предстоящих записей. Запишитесь — и визит появится здесь.</p>';return;}
    box.innerHTML=list.map(function(r){return '<div class="my-item"><div class="my-when"><b>'+fmtDateRu(r.date)+'</b><span>'+hhmm(r.start)+' – '+hhmm(r.end)+'</span></div><div class="my-srv">'+(r.service||'')+'</div></div>';}).join('')+'<p class="my-note">Нужно отменить или перенести? Напишите нам — поможем.</p>';
  }
  var myModal=document.getElementById('myModal');
  function openMy(){renderMine();if(window.ATELIER&&window.ATELIER.closeMenu)window.ATELIER.closeMenu();myModal.classList.add('open');myModal.setAttribute('aria-hidden','false');if(window.ATELIER&&window.ATELIER.lock)window.ATELIER.lock();}
  function closeMy(){myModal.classList.remove('open');myModal.setAttribute('aria-hidden','true');if(window.ATELIER&&window.ATELIER.unlock)window.ATELIER.unlock();}
  var myLink=document.getElementById('myBookingsLink');
  if(myLink)myLink.addEventListener('click',function(e){e.preventDefault();openMy();});
  if(myModal)myModal.querySelectorAll('[data-my-close]').forEach(function(c){c.addEventListener('click',closeMy);});
  document.addEventListener('keydown',function(e){if(e.key==='Escape'&&myModal&&myModal.classList.contains('open'))closeMy();});

  /* ---- SMS-проверка номера ---- */
  var recaptcha=null, confirmation=null, pending=null;

  function resetSmsStep(){
    confirmation=null;pending=null;
    if(smsStep)smsStep.hidden=true;
    if(smsCode)smsCode.value='';
    setSms('');
    if(submit){submit.hidden=false;submit.disabled=false;submit.textContent='Записаться';}
    if(smsResend)smsResend.hidden=true;
  }
  function ensureRecaptcha(){
    if(recaptcha)return recaptcha;
    recaptcha=new firebase.auth.RecaptchaVerifier('recaptcha-container',{size:'invisible'});
    return recaptcha;
  }
  function sendCode(e164){
    setHint('Отправляем код подтверждения…');
    submit.disabled=true;
    return window.FB.auth.signInWithPhoneNumber(e164,ensureRecaptcha()).then(function(res){
      confirmation=res;
      submit.hidden=true;setHint('');
      if(smsPhoneEl)smsPhoneEl.textContent=e164;
      smsStep.hidden=false;if(smsResend)smsResend.hidden=false;
      setSms('');if(smsCode){smsCode.value='';smsCode.focus();}
    }).catch(function(err){
      submit.disabled=false;submit.hidden=false;
      try{if(recaptcha&&recaptcha.clear)recaptcha.clear();}catch(e){}recaptcha=null;
      var m='Не удалось отправить SMS. Попробуйте ещё раз.';
      if(err&&err.code==='auth/invalid-phone-number')m='Проверьте номер телефона.';
      else if(err&&err.code==='auth/too-many-requests')m='Слишком много попыток. Повторите позже.';
      else if(err&&err.code==='auth/billing-not-enabled')m='SMS-проверка не включена (нужен план Blaze или тестовый номер).';
      setHint(m,'warn');
    });
  }

  if(smsConfirm)smsConfirm.addEventListener('click',function(){
    if(!confirmation){setSms('Сначала запросите код.','warn');return;}
    var code=digits(smsCode.value);
    if(code.length<6){setSms('Введите 6-значный код из SMS.','warn');return;}
    smsConfirm.disabled=true;setSms('Проверяем код…');
    confirmation.confirm(code).then(function(){
      smsConfirm.disabled=false;
      finalizeBooking();
    }).catch(function(err){
      smsConfirm.disabled=false;
      setSms(err&&err.code==='auth/invalid-verification-code'?'Неверный код. Проверьте SMS.':'Ошибка проверки кода. Попробуйте ещё раз.','warn');
    });
  });
  if(smsResend)smsResend.addEventListener('click',function(){
    if(!pending)return;
    try{if(recaptcha&&recaptcha.clear)recaptcha.clear();}catch(e){}recaptcha=null;
    smsStep.hidden=true;sendCode(pending.e164);
  });

  /* ---- запись ---- */
  function finalizeBooking(){
    if(!pending)return;
    var p=pending;
    submit.disabled=true;
    setHint('Записываем…');
    var db=window.FB.db,cells=cellsOf(p.S);
    var refs=cells.map(function(m){return db.collection('slots').doc(p.dateStr+'_'+m);});
    var limitRef=db.collection('limits').doc(p.dateStr+'_'+digits(p.phone));
    var bRef=db.collection('bookings').doc();

    db.runTransaction(function(tx){
      return tx.get(limitRef).then(function(lim){
        var cnt=(lim.exists&&lim.data().count)?lim.data().count:0;
        if(cnt>=MAXDAY) throw new Error('DAYLIMIT');
        return Promise.all(refs.map(function(r){return tx.get(r);})).then(function(snaps){
          if(snaps.some(function(s){return s.exists;})) throw new Error('TAKEN');
          tx.set(bRef,{name:p.name,phone:p.phone,service:p.service,comment:p.comment,date:p.dateStr,start:p.S,end:p.S+DUR,duration:DUR,status:'active',createdAt:firebase.firestore.FieldValue.serverTimestamp()});
          refs.forEach(function(r,i){tx.set(r,{date:p.dateStr,min:cells[i],bookingId:bRef.id});});
          tx.set(limitRef,{date:p.dateStr,phone:digits(p.phone),count:cnt+1});
        });
      });
    }).then(function(){
      addMine({id:bRef.id,date:p.dateStr,start:p.S,end:p.S+DUR,duration:DUR,service:p.service,name:p.name});
      resetSmsStep();form.reset();setHint('');
      if(window.ATELIER&&window.ATELIER.closeModal)window.ATELIER.closeModal();
      if(window.ATELIER&&window.ATELIER.showToast)window.ATELIER.showToast('Запись оформлена на <b>'+fmtDateRu(p.dateStr)+', '+hhmm(p.S)+'</b> ✦');
    }).catch(function(err){
      submit.disabled=false;
      if(err&&err.message==='TAKEN'){resetSmsStep();setHint('Это время только что заняли. Выберите другое.','warn');loadAvailability();}
      else if(err&&err.message==='DAYLIMIT'){resetSmsStep();setHint('На этот день с этим номером уже есть запись. Выберите другой день.','warn');}
      else setHint('Ошибка записи. Попробуйте ещё раз.','warn');
    });
  }

  if(form)form.addEventListener('submit',function(e){
    e.preventDefault();
    var name=(document.getElementById('name').value||'').trim();
    var phone=(document.getElementById('phone').value||'').trim();
    var service=document.getElementById('service').value||'';
    var comment=(document.getElementById('comment').value||'').trim();
    var dateStr=dateInp.value,S=parseInt(timeSel.value,10);
    if(!name){setHint('Введите имя.','warn');return;}
    if(!dateStr||isNaN(S)){setHint('Выберите дату и время.','warn');return;}
    if(digits(phone).length<10){setHint('Укажите корректный телефон — на него придёт SMS с кодом.','warn');return;}
    if(!fbReady()||!window.FB.auth){setHint('Онлайн-запись пока не подключена. Настройте Firebase в firebase-config.js.','warn');return;}

    var e164=toE164(phone);
    pending={name:name,phone:phone,service:service,comment:comment,dateStr:dateStr,S:S,e164:e164};

    // предпроверка дневного лимита до отправки SMS
    submit.disabled=true;setHint('Проверяем…');
    window.FB.db.collection('limits').doc(dateStr+'_'+digits(phone)).get().then(function(lim){
      var cnt=(lim.exists&&lim.data().count)?lim.data().count:0;
      if(cnt>=MAXDAY){submit.disabled=false;setHint('На этот день с этим номером уже есть запись. Выберите другой день.','warn');return;}
      var cu=window.FB.auth.currentUser;
      var verified=cu&&((cu.phoneNumber&&digits(cu.phoneNumber)===digits(e164))||cu.email===ADMIN);
      if(verified){finalizeBooking();}else{sendCode(e164);}
    }).catch(function(){
      submit.disabled=false;
      var cu=window.FB.auth.currentUser;
      var verified=cu&&((cu.phoneNumber&&digits(cu.phoneNumber)===digits(e164))||cu.email===ADMIN);
      if(verified){finalizeBooking();}else{sendCode(e164);}
    });
  });
})();
