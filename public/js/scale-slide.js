/* Масштабує .slide-wrapper (канва 1920x1080) під розмір вікна — спільне для
   4 сторінок (layout.html/entry.html/head-cabinet.html/doctor-cabinet.html),
   раніше кожна мала цей самий inline-скрипт окремо. */
// Мобільна версія (layout.css: @media max-width:768px) переводить канву в
// звичайний document flow (position:static, 100% width) — той самий
// transform:scale() тут зламав би це (масштабує 1920px-канву, а не реальну
// 100%-ширину), тому нижче цієї межі просто нічого не масштабуємо.
const MOBILE_BREAKPOINT = 768;
function scaleSlide() {
  const w = document.querySelector('.slide-wrapper');
  if (window.innerWidth <= MOBILE_BREAKPOINT) { w.style.transform = 'none'; return; }
  const s = Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
  w.style.transform = `scale(${s})`;
}
window.addEventListener('load', scaleSlide);
window.addEventListener('resize', scaleSlide);
