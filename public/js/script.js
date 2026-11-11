/* ============================================================
   ATELIER NÉVE — scripts
   ============================================================ */
(function(){
  'use strict';
  var WA_PHONE = '77474711659'; // WhatsApp студии

  /* ---- scroll lock (shared by menu & modal) ---- */
  var lockCount = 0, savedY = 0;
  function lock(){
    if(lockCount === 0){ savedY = window.scrollY || window.pageYOffset; document.body.style.top = '-' + savedY + 'px'; document.body.classList.add('is-locked'); }
    lockCount++;
  }
  function unlock(){
    lockCount = Math.max(0, lockCount - 1);
    if(lockCount === 0){
      var html = document.documentElement;
      var prev = html.style.scrollBehavior;
      html.style.scrollBehavior = 'auto';           // без плавного прыжка
      document.body.classList.remove('is-locked');
      document.body.style.top = '';
      window.scrollTo(0, savedY);
      html.style.scrollBehavior = prev;
    }
  }

  /* ---- header shadow ---- */
  var header = document.getElementById('header');
  var onScroll = function(){ header.classList.toggle('scrolled', window.scrollY > 20); };
  window.addEventListener('scroll', onScroll, { passive:true });
  onScroll();

  /* ---- mobile menu ---- */
  var burger = document.getElementById('burger');
  function openMenu(){ document.body.classList.add('nav-open'); lock(); }
  function closeMenu(){ if(!document.body.classList.contains('nav-open')) return; document.body.classList.remove('nav-open'); unlock(); }
  if(burger){
    burger.addEventListener('click', function(){ document.body.classList.contains('nav-open') ? closeMenu() : openMenu(); });
    document.querySelectorAll('#menu a').forEach(function(a){ a.addEventListener('click', closeMenu); });
  }

  /* ---- reveal ---- */
  var reveals = document.querySelectorAll('.reveal');
  if('IntersectionObserver' in window){
    var io = new IntersectionObserver(function(e){ e.forEach(function(x){ if(x.isIntersecting){ x.target.classList.add('in'); io.unobserve(x.target); } }); }, { threshold:.14, rootMargin:'0px 0px -8% 0px' });
    reveals.forEach(function(el){ io.observe(el); });
  } else { reveals.forEach(function(el){ el.classList.add('in'); }); }

  /* ---- booking modal ---- */
  var modal = document.getElementById('modal');
  function openModal(){ closeMenu(); modal.classList.add('open'); modal.setAttribute('aria-hidden','false'); lock(); }
  function closeModal(){ if(!modal.classList.contains('open')) return; modal.classList.remove('open'); modal.setAttribute('aria-hidden','true'); unlock(); }
  document.querySelectorAll('[data-book]').forEach(function(b){ b.addEventListener('click', function(e){ e.preventDefault(); openModal(); }); });
  modal.querySelectorAll('[data-close]').forEach(function(c){ c.addEventListener('click', closeModal); });
  document.addEventListener('keydown', function(e){ if(e.key === 'Escape') closeModal(); });

  /* ---- phone mask ---- */
  var phone = document.getElementById('phone');
  if(phone){
    phone.addEventListener('input', function(e){
      var v = e.target.value.replace(/\D/g,'').slice(0,11);
      if(v[0] === '8') v = '7' + v.slice(1);
      if(v && v[0] !== '7') v = '7' + v;
      var out = '';
      if(v.length) out = '+7';
      if(v.length > 1) out += ' (' + v.slice(1,4);
      if(v.length >= 5) out += ') ' + v.slice(4,7);
      if(v.length >= 8) out += '-' + v.slice(7,9);
      if(v.length >= 10) out += '-' + v.slice(9,11);
      e.target.value = out;
    });
  }

  /* ---- toast + API for booking.js ---- */
  var toast = document.getElementById('toast'), toastT;
  function showToast(msg){
    if(msg) toast.innerHTML = msg;
    toast.classList.add('show');
    clearTimeout(toastT);
    toastT = setTimeout(function(){ toast.classList.remove('show'); }, 4200);
  }
  window.ATELIER = window.ATELIER || {};
  window.ATELIER.closeModal = closeModal;
  window.ATELIER.openModal = openModal;
  window.ATELIER.showToast = showToast;
  window.ATELIER.closeMenu = closeMenu;
  window.ATELIER.lock = lock;
  window.ATELIER.unlock = unlock;

  /* ---- portfolio lightbox ---- */
  var lb = document.getElementById('lightbox');
  var items = Array.prototype.slice.call(document.querySelectorAll('#masonry .masonry__item'));
  if(lb && items.length){
    var lbImg = document.getElementById('lbImg');
    var lbCount = document.getElementById('lbCount');
    var cur = 0;
    var srcs = items.map(function(it){ return it.getAttribute('data-full'); });
    function show(i){
      cur = (i + srcs.length) % srcs.length;
      lbImg.src = srcs[cur];
      if(lbCount) lbCount.textContent = (cur + 1) + ' / ' + srcs.length;
    }
    function openLb(i){ show(i); lb.classList.add('open'); lb.setAttribute('aria-hidden','false'); lock(); }
    function closeLb(){ if(!lb.classList.contains('open')) return; lb.classList.remove('open'); lb.setAttribute('aria-hidden','true'); unlock(); }
    items.forEach(function(it, i){ it.addEventListener('click', function(){ openLb(i); }); });
    lb.querySelectorAll('[data-lb-close]').forEach(function(c){ c.addEventListener('click', closeLb); });
    lb.querySelector('[data-lb-prev]').addEventListener('click', function(e){ e.stopPropagation(); show(cur - 1); });
    lb.querySelector('[data-lb-next]').addEventListener('click', function(e){ e.stopPropagation(); show(cur + 1); });
    document.addEventListener('keydown', function(e){
      if(!lb.classList.contains('open')) return;
      if(e.key === 'Escape') closeLb();
      else if(e.key === 'ArrowLeft') show(cur - 1);
      else if(e.key === 'ArrowRight') show(cur + 1);
    });
    // свайп по фото на телефоне
    var lx = 0;
    lb.addEventListener('touchstart', function(e){ lx = e.touches[0].clientX; }, { passive:true });
    lb.addEventListener('touchend', function(e){
      var dx = e.changedTouches[0].clientX - lx;
      if(Math.abs(dx) > 50) show(cur + (dx < 0 ? 1 : -1));
    }, { passive:true });
  }
})();
