/* ============================================================
   ATELIER NÉVE — Firebase config
   ------------------------------------------------------------
   1. Создайте проект на https://console.firebase.google.com
   2. Project settings → ваше веб-приложение → скопируйте firebaseConfig
   3. Вставьте значения ниже вместо "ВАШ_..."
   4. Firestore Database → Create database (режим production)
   5. Authentication → Sign-in method → включите Email/Password
   6. Authentication → Sign-in method → включите также Phone (телефон)
   7. Authentication → Users → Add user: admin@gmail.com + пароль
   8. Firestore → Rules → вставьте содержимое firestore.rules
   ------------------------------------------------------------
   ЗАЩИТА ОТ НАКРУТКИ (капча + SMS + IP):
   9.  App Check → зарегистрируйте сайт в reCAPTCHA v3
       (https://www.google.com/recaptcha/admin), вставьте site key в
       APPCHECK_SITE_KEY ниже. В App Check сначала режим «Monitor»,
       затем, убедившись что всё работает — «Enforce» для Firestore.
   10. SMS-подтверждение (Phone Auth):
       • для ТЕСТА без карты и без реальных SMS — Authentication →
         Sign-in method → Phone → «Phone numbers for testing»:
         добавьте выдуманный номер + код (напр. +77001112233 / 123456).
       • для РЕАЛЬНЫХ SMS нужен план Blaze (привязать карту). Первые
         10 SMS/день бесплатно, далее ~$0.01–0.1 за SMS. Phone Auth сам
         ограничивает по IP (≈150 запросов/IP в час) — отдельный
         IP-лимит на сервере не нужен.
   ============================================================ */
window.ATELIER_CONFIG = {
  // Почта администратора (вход в кабинет). Должна совпадать с правилами Firestore.
  adminEmail: "admin@gmail.com",
  // Рабочее окно и шаг
  workStart: 9,      // открытие, час
  workEnd: 19,       // закрытие, час (запись не позже)
  stepMin: 15,       // шаг старта, минут
  slotMin: 120,      // длительность записи, минут (фиксировано)
  maxPerDay: 10      // максимум записей в день на один телефон
};

// reCAPTCHA v3 site key для App Check (см. п.9). Пусто/«ВАШ_» — App Check выключен.

window.firebaseConfig = {
};

window.FB = { ready:false, db:null, auth:null, error:null };
(function(){
  try{
    if(!window.firebase || !window.firebase.initializeApp){ window.FB.error = "sdk"; return; }
    if(String(window.firebaseConfig.apiKey).indexOf("ВАШ_") === 0){ window.FB.error = "config"; return; }
    firebase.initializeApp(window.firebaseConfig);
    // App Check (капча) — включается, только если задан reCAPTCHA v3 ключ
    if(firebase.appCheck && window.APPCHECK_SITE_KEY && String(window.APPCHECK_SITE_KEY).indexOf("ВАШ_") !== 0){
      try{ firebase.appCheck().activate(window.APPCHECK_SITE_KEY, true); }catch(e){}
    }
    window.FB.db = firebase.firestore();
    window.FB.auth = (firebase.auth) ? firebase.auth() : null; // email — в кабинете, phone — на сайте
    window.FB.ready = true;
  }catch(e){ window.FB.error = (e && e.message) || "init"; }
})();
