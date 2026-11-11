/* ============================================================
   ATELIER NÉVE — онлайн-запись (Firestore + Phone Auth)
   Мастера (отдельные расписания) · услуги из настроек ·
   капча (App Check) · SMS при первой записи · лимит/день ·
   IP-лимит обеспечивает Phone Auth. Слоты: slots/{date}_{masterId}_{min}
   ============================================================ */
(function(){
  'use strict';
  var CFG = window.ATELIER_CONFIG || {};
  var ADMIN=CFG.adminEmail||'admin@gmail.com';
  var W_START=(CFG.workStart||9)*60, W_END=(CFG.workEnd||19)*60;
  var STEP=CFG.stepMin||15, DUR=CFG.slotMin||120, MAXDAY=CFG.maxPerDay||1;
  var LS_KEY='atelier_neve_bookings';

  var dateInp=document.getElementById('bdate'), timeSel=document.getElementById('btime'),
      srvSel=document.getElementById('service'), masterSel=document.getElementById('bmaster'),
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
  var statusEl=document.getElementById('bookStatus');
  function setStatus(msg,type){if(statusEl){statusEl.textContent=msg||'';statusEl.className='slot-hint'+(type?' slot-hint--'+type:'');statusEl.style.textAlign='center';statusEl.style.margin='10px 0 0';}}
  var LS_PROFILE='atelier_neve_profile';
  function loadProfile(){try{return JSON.parse(localStorage.getItem(LS_PROFILE)||'{}');}catch(e){return {};}}
  function saveProfile(n,p){try{localStorage.setItem(LS_PROFILE,JSON.stringify({name:n,phone:p}));}catch(e){}}
  function prefillForm(){
    var prof=loadProfile();
    var nameInp=document.getElementById('name');
    if(nameInp&&!nameInp.value&&prof.name)nameInp.value=prof.name;
    var phoneInp=document.getElementById('phone');
    if(phoneInp&&!phoneInp.value){
      var cu=window.FB&&window.FB.auth&&window.FB.auth.currentUser;
      if(cu&&cu.phoneNumber)phoneInp.value=phoneFmt(cu.phoneNumber);
      else if(prof.phone)phoneInp.value=phoneFmt(prof.phone);
    }
  }
  function toE164(p){var d=digits(p);if(d.length===11&&d[0]==='8')return '+7'+d.slice(1);if(d.length===11&&d[0]==='7')return '+'+d;if(d.length===10)return '+7'+d;return '+'+d;}
  function phoneErrMsg(err){
    var c=(err&&err.code)||'';
    var map={
      'auth/operation-not-allowed':'Вход по телефону не включён в Firebase (Authentication → Sign-in method → Phone).',
      'auth/unauthorized-domain':'Домен не разрешён. Откройте сайт через localhost (а не 127.0.0.1) или добавьте адрес в Authentication → Settings → Authorized domains.',
      'auth/billing-not-enabled':'Нужен план Blaze или тестовый номер (Authentication → Phone → Phone numbers for testing).',
      'auth/invalid-phone-number':'Проверьте номер телефона.',
      'auth/too-many-requests':'Слишком много попыток. Повторите позже.',
      'auth/captcha-check-failed':'Проверка reCAPTCHA не прошла (домен не разрешён или App Check мешает).',
      'auth/invalid-app-credential':'Проблема с reCAPTCHA/App Check. Проверьте домен и настройки App Check (на время теста — Monitor).',
      'auth/argument-error':'Проблема с reCAPTCHA. Проверьте, что домен разрешён и App Check не в режиме Enforce.',
      'auth/internal-error':'Внутренняя ошибка Firebase — часто домен не разрешён или Phone не включён.'
    };
    var base=map[c]||'Не удалось отправить код.';
    return base+(c?' ['+c+']':'');
  }
  function phoneFmt(v){
    v=(v||'');
    if(v.indexOf('+7')===0)v=v.slice(2);          // снимаем наш фиксированный «+7»
    var d=v.replace(/\D/g,'');
    if(d.length===11&&(d[0]==='7'||d[0]==='8'))d=d.slice(1); // вставили полный номер с кодом страны
    else if(d.length&&d[0]==='8')d=d.slice(1);
    d=d.slice(0,10);
    var o='+7';
    if(d.length>=1)o+=' ('+d.slice(0,3);
    if(d.length>=3)o+=')';
    if(d.length>=4)o+=' '+d.slice(3,6);
    if(d.length>=7)o+='-'+d.slice(6,8);
    if(d.length>=9)o+='-'+d.slice(8,10);
    return o;
  }
  function maskPhone(input){
    if(!input)return;
    input.addEventListener('input',function(){input.value=phoneFmt(input.value);});
    input.addEventListener('focus',function(){if(!input.value)input.value='+7 (';});
    input.addEventListener('blur',function(){if(input.value==='+7 ('||input.value==='+7')input.value='';});
  }

  var now=new Date();
  var todayStr=now.getFullYear()+'-'+pad(now.getMonth()+1)+'-'+pad(now.getDate());
  if(dateInp){dateInp.min=todayStr;var mx=new Date(now.getTime()+60*86400000);dateInp.max=mx.getFullYear()+'-'+pad(mx.getMonth()+1)+'-'+pad(mx.getDate());}

  var occupied=new Set(), mastersMap={};

  /* ---- каталог: услуги + мастера ---- */
  function loadCatalog(){
    if(!fbReady())return;
    window.FB.db.collection('services').get().then(function(snap){
      var arr=[];snap.forEach(function(d){var s=d.data();s.id=d.id;arr.push(s);});
      arr.sort(function(a,b){return (a.order||0)-(b.order||0);});
      if(arr.length&&srvSel){srvSel.innerHTML='<option value="" disabled selected>Выберите услугу</option>';
        arr.forEach(function(s){var o=document.createElement('option');o.value=s.name;o.textContent=s.name+(s.price?' — '+s.price:'');srvSel.appendChild(o);});}
    }).catch(function(){});
    window.FB.db.collection('masters').get().then(function(snap){
      var arr=[];snap.forEach(function(d){var m=d.data();m.id=d.id;arr.push(m);});
      arr.sort(function(a,b){return (a.order||0)-(b.order||0);});
      mastersMap={};arr.forEach(function(m){mastersMap[m.id]=m.name;});
      if(masterSel){
        masterSel.innerHTML='<option value="" disabled selected>Выберите мастера</option>';
        arr.forEach(function(m){var o=document.createElement('option');o.value=m.id;o.textContent=m.name;masterSel.appendChild(o);});
        if(arr.length===1){masterSel.value=arr[0].id;}
      }
    }).catch(function(){});
  }
  loadCatalog();
  maskPhone(document.getElementById('phone'));
  prefillForm();
  // вход сохраняется между визитами (токен не тухнет)
  try{ if(window.FB&&window.FB.auth&&window.FB.auth.setPersistence){window.FB.auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL).catch(function(){});} }catch(e){}

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
    if(!any&&dateInp.value&&masterSel.value)setHint('У этого мастера на эту дату нет свободного времени — выберите другой день или мастера.','warn');else setHint('');
  }

  function loadAvailability(){
    if(!timeSel)return;
    if(!masterSel.value){timeSel.innerHTML='<option value="" disabled selected>Сначала выберите мастера</option>';return;}
    if(!dateInp||!dateInp.value){timeSel.innerHTML='<option value="" disabled selected>Выберите дату</option>';return;}
    if(!fbReady()){occupied=new Set();rebuildTimes();setHint('⚠ Онлайн-запись заработает после подключения Firebase (firebase-config.js).','warn');return;}
    setHint('Загружаем свободное время…');
    window.FB.db.collection('slots').where('date','==',dateInp.value).where('masterId','==',masterSel.value).get().then(function(snap){
      occupied=new Set();snap.forEach(function(d){occupied.add(d.data().min);});rebuildTimes();
    }).catch(function(){occupied=new Set();rebuildTimes();setHint('Не удалось загрузить время.','warn');});
  }
  if(dateInp)dateInp.addEventListener('change',loadAvailability);
  if(masterSel)masterSel.addEventListener('change',loadAvailability);
  document.querySelectorAll('[data-book]').forEach(function(b){b.addEventListener('click',function(){setTimeout(function(){resetSmsStep();prefillForm();loadAvailability();},60);});});

  /* ---- Личный кабинет (вход по SMS, записи из базы) ---- */
  function readMine(){try{return JSON.parse(localStorage.getItem(LS_KEY)||'[]');}catch(e){return [];}}
  function saveMine(l){try{localStorage.setItem(LS_KEY,JSON.stringify(l));}catch(e){}}
  function addMine(r){var l=readMine();l.push(r);saveMine(l);}

  var myModal=document.getElementById('myModal');
  var myLogin=document.getElementById('myLogin'), myView=document.getElementById('myView'),
      myList=document.getElementById('myList'), myPhone=document.getElementById('myPhone'),
      myCodeWrap=document.getElementById('myCodeWrap'), myCode=document.getElementById('myCode'),
      myMsg=document.getElementById('myMsg'), myLoginBtn=document.getElementById('myLoginBtn'),
      myLogout=document.getElementById('myLogout');
  var myRecaptcha=null, myConfirm=null;
  maskPhone(myPhone);
  function setMy(m,t){if(myMsg){myMsg.textContent=m||'';myMsg.className='slot-hint'+(t?' slot-hint--'+t:'');}}
  function currentClient(){var cu=window.FB&&window.FB.auth&&window.FB.auth.currentUser;return (cu&&cu.phoneNumber)?cu:null;}

  function showCabinet(){
    if(!myModal)return;
    var cu=currentClient();
    if(cu){myLogin.hidden=true;myView.hidden=false;renderDb(cu.uid);}
    else{myView.hidden=true;myLogin.hidden=false;if(myCodeWrap)myCodeWrap.hidden=true;if(myLoginBtn)myLoginBtn.textContent='Получить код';myConfirm=null;setMy('');}
  }
  function renderDb(uid){
    if(!myList)return;
    myList.innerHTML='<p class="my-empty">Загружаем записи…</p>';
    if(!fbReady()){renderMineLS();return;}
    window.FB.db.collection('bookings').where('uid','==',uid).get().then(function(snap){
      var nowT=new Date(),list=[];
      snap.forEach(function(d){var b=d.data();if(b.status==='cancelled')return;var endM=b.end||((b.start||0)+DUR);if(new Date(b.date+'T'+hhmm(endM)+':00')<nowT)return;list.push(b);});
      list.sort(function(a,b){return (a.date+pad(a.start))<(b.date+pad(b.start))?-1:1;});
      if(!list.length){myList.innerHTML='<p class="my-empty">Пока нет предстоящих записей. Запишитесь — и визит появится здесь.</p>';return;}
      myList.innerHTML=list.map(function(r){return '<div class="my-item"><div class="my-when"><b>'+fmtDateRu(r.date)+'</b><span>'+hhmm(r.start)+' – '+hhmm(r.end||r.start+DUR)+'</span></div><div class="my-srv">'+(r.service||'')+'<div class="my-master">'+(mastersMap[r.masterId]||'')+'</div></div></div>';}).join('')+'<p class="my-note">Нужно отменить или перенести? Напишите нам — поможем.</p>';
    }).catch(function(){renderMineLS();});
  }
  function renderMineLS(){
    if(!myList)return;
    var nowT=new Date();var list=readMine().filter(function(r){return new Date(r.date+'T'+hhmm(r.end)+':00')>=nowT;}).sort(function(a,b){return (a.date+pad(a.start))<(b.date+pad(b.start))?-1:1;});
    if(!list.length){myList.innerHTML='<p class="my-empty">Пока нет предстоящих записей.</p>';return;}
    myList.innerHTML=list.map(function(r){return '<div class="my-item"><div class="my-when"><b>'+fmtDateRu(r.date)+'</b><span>'+hhmm(r.start)+' – '+hhmm(r.end)+'</span></div><div class="my-srv">'+(r.service||'')+'</div></div>';}).join('');
  }
  function ensureMyRecaptcha(){if(myRecaptcha)return myRecaptcha;myRecaptcha=new firebase.auth.RecaptchaVerifier('my-recaptcha',{size:'invisible'});return myRecaptcha;}
  if(myLoginBtn)myLoginBtn.addEventListener('click',function(){
    if(!fbReady()||!window.FB.auth){setMy('Вход пока не подключён.','warn');return;}
    if(!myConfirm){
      var ph=(myPhone.value||'').trim();
      if(digits(ph).length<10){setMy('Введите корректный номер телефона.','warn');return;}
      myLoginBtn.disabled=true;setMy('Отправляем код…');
      window.FB.auth.signInWithPhoneNumber(toE164(ph),ensureMyRecaptcha()).then(function(res){
        myConfirm=res;myLoginBtn.disabled=false;myCodeWrap.hidden=false;myLoginBtn.textContent='Войти';setMy('');myCode.focus();
      }).catch(function(err){
        myLoginBtn.disabled=false;try{if(myRecaptcha&&myRecaptcha.clear)myRecaptcha.clear();}catch(e){}myRecaptcha=null;
        setMy(phoneErrMsg(err),'warn');
      });
    } else {
      var code=digits(myCode.value);if(code.length<6){setMy('Введите 6-значный код.','warn');return;}
      myLoginBtn.disabled=true;setMy('Проверяем…');
      myConfirm.confirm(code).then(function(){myLoginBtn.disabled=false;myConfirm=null;showCabinet();})
      .catch(function(){myLoginBtn.disabled=false;setMy('Неверный код. Проверьте SMS.','warn');});
    }
  });
  if(myLogout)myLogout.addEventListener('click',function(){if(window.FB&&window.FB.auth)window.FB.auth.signOut().then(showCabinet,showCabinet);});

  function openMy(){showCabinet();if(window.ATELIER&&window.ATELIER.closeMenu)window.ATELIER.closeMenu();myModal.classList.add('open');myModal.setAttribute('aria-hidden','false');if(window.ATELIER&&window.ATELIER.lock)window.ATELIER.lock();}
  function closeMy(){myModal.classList.remove('open');myModal.setAttribute('aria-hidden','true');if(window.ATELIER&&window.ATELIER.unlock)window.ATELIER.unlock();}
  var myLink=document.getElementById('myBookingsLink');
  if(myLink)myLink.addEventListener('click',function(e){e.preventDefault();openMy();});
  if(myModal)myModal.querySelectorAll('[data-my-close]').forEach(function(c){c.addEventListener('click',closeMy);});
  document.addEventListener('keydown',function(e){if(e.key==='Escape'&&myModal&&myModal.classList.contains('open'))closeMy();});
  if(window.FB&&window.FB.auth&&window.FB.auth.onAuthStateChanged)window.FB.auth.onAuthStateChanged(function(){prefillForm();if(myModal&&myModal.classList.contains('open'))showCabinet();});

  /* ---- SMS-проверка ---- */
  var recaptcha=null, confirmation=null, pending=null;
  function resetSmsStep(){
    confirmation=null;pending=null;
    if(smsStep)smsStep.hidden=true;if(smsCode)smsCode.value='';setSms('');
    if(submit){submit.hidden=false;submit.disabled=false;submit.textContent='Записаться';}
    if(smsResend)smsResend.hidden=true;
  }
  function ensureRecaptcha(){if(recaptcha)return recaptcha;recaptcha=new firebase.auth.RecaptchaVerifier('recaptcha-container',{size:'invisible'});return recaptcha;}
  function sendCode(e164){
    setStatus('Отправляем код подтверждения…');submit.disabled=true;
    return window.FB.auth.signInWithPhoneNumber(e164,ensureRecaptcha()).then(function(res){
      confirmation=res;submit.hidden=true;setStatus('');
      if(smsPhoneEl)smsPhoneEl.textContent=e164;
      smsStep.hidden=false;if(smsResend)smsResend.hidden=false;
      setSms('');if(smsCode){smsCode.value='';smsCode.focus();}
    }).catch(function(err){
      submit.disabled=false;submit.hidden=false;
      try{if(recaptcha&&recaptcha.clear)recaptcha.clear();}catch(e){}recaptcha=null;
      setStatus(phoneErrMsg(err),'warn');
    });
  }
  if(smsConfirm)smsConfirm.addEventListener('click',function(){
    if(!confirmation){setSms('Сначала запросите код.','warn');return;}
    var code=digits(smsCode.value);if(code.length<6){setSms('Введите 6-значный код из SMS.','warn');return;}
    smsConfirm.disabled=true;setSms('Проверяем код…');
    confirmation.confirm(code).then(function(){smsConfirm.disabled=false;finalizeBooking();})
    .catch(function(err){smsConfirm.disabled=false;setSms(err&&err.code==='auth/invalid-verification-code'?'Неверный код. Проверьте SMS.':'Ошибка проверки кода. Попробуйте ещё раз.','warn');});
  });
  if(smsResend)smsResend.addEventListener('click',function(){
    if(!pending)return;try{if(recaptcha&&recaptcha.clear)recaptcha.clear();}catch(e){}recaptcha=null;
    smsStep.hidden=true;sendCode(pending.e164);
  });

  /* ---- запись ---- */
  function finalizeBooking(){
    if(!pending)return;var p=pending;
    submit.disabled=true;setStatus('Записываем…');
    var db=window.FB.db,cells=cellsOf(p.S);
    var refs=cells.map(function(m){return db.collection('slots').doc(p.dateStr+'_'+p.masterId+'_'+m);});
    var limitRef=db.collection('limits').doc(p.dateStr+'_'+digits(p.phone));
    var bRef=db.collection('bookings').doc();
    var uid=(window.FB.auth.currentUser&&window.FB.auth.currentUser.uid)||null;

    db.runTransaction(function(tx){
      return tx.get(limitRef).then(function(lim){
        var cnt=(lim.exists&&lim.data().count)?lim.data().count:0;
        if(cnt>=MAXDAY) throw new Error('DAYLIMIT');
        return Promise.all(refs.map(function(r){return tx.get(r);})).then(function(snaps){
          if(snaps.some(function(s){return s.exists;})) throw new Error('TAKEN');
          tx.set(bRef,{name:p.name,phone:p.phone,service:p.service,comment:p.comment,date:p.dateStr,start:p.S,end:p.S+DUR,duration:DUR,masterId:p.masterId,uid:uid,status:'active',createdAt:firebase.firestore.FieldValue.serverTimestamp()});
          refs.forEach(function(r,i){tx.set(r,{date:p.dateStr,masterId:p.masterId,min:cells[i],bookingId:bRef.id});});
          tx.set(limitRef,{date:p.dateStr,phone:digits(p.phone),count:cnt+1});
        });
      });
    }).then(function(){
      addMine({id:bRef.id,date:p.dateStr,start:p.S,end:p.S+DUR,duration:DUR,service:p.service,name:p.name});
      saveProfile(p.name,p.phone);
      resetSmsStep();form.reset();setHint('');setStatus('');loadCatalog();
      if(window.ATELIER&&window.ATELIER.closeModal)window.ATELIER.closeModal();
      if(window.ATELIER&&window.ATELIER.showToast)window.ATELIER.showToast('Запись оформлена на <b>'+fmtDateRu(p.dateStr)+', '+hhmm(p.S)+'</b> ✦');
    }).catch(function(err){
      submit.disabled=false;
      if(err&&err.message==='TAKEN'){resetSmsStep();setStatus('Это время только что заняли. Выберите другое.','warn');loadAvailability();}
      else if(err&&err.message==='DAYLIMIT'){resetSmsStep();setStatus('На этот день с этим номером уже есть запись. Выберите другой день.','warn');}
      else setStatus('Ошибка записи. Попробуйте ещё раз.','warn');
    });
  }

  if(form)form.addEventListener('submit',function(e){
    e.preventDefault();
    var name=(document.getElementById('name').value||'').trim();
    var phone=(document.getElementById('phone').value||'').trim();
    var service=srvSel.value||'';
    var masterId=masterSel.value||'';
    var comment=(document.getElementById('comment').value||'').trim();
    var dateStr=dateInp.value,S=parseInt(timeSel.value,10);
    if(!name){setStatus('Введите имя.','warn');return;}
    if(!service){setStatus('Выберите услугу.','warn');return;}
    if(!masterId){setStatus('Выберите мастера.','warn');return;}
    if(!dateStr||isNaN(S)){setStatus('Выберите дату и время.','warn');return;}
    if(digits(phone).length<10){setStatus('Укажите корректный телефон — на него придёт SMS с кодом.','warn');return;}
    if(!fbReady()||!window.FB.auth){setStatus('Онлайн-запись пока не подключена. Настройте Firebase в firebase-config.js.','warn');return;}

    var e164=toE164(phone);
    pending={name:name,phone:phone,service:service,comment:comment,masterId:masterId,dateStr:dateStr,S:S,e164:e164};
    submit.disabled=true;setStatus('Проверяем…');
    window.FB.db.collection('limits').doc(dateStr+'_'+digits(phone)).get().then(function(lim){
      var cnt=(lim.exists&&lim.data().count)?lim.data().count:0;
      if(cnt>=MAXDAY){submit.disabled=false;setStatus('На этот день с этим номером уже есть запись. Выберите другой день.','warn');return;}
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
