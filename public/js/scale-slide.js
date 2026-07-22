/* Масштабує .slide-wrapper (канва 1920x1080) під розмір вікна — спільне для
   4 сторінок (layout.html/entry.html/head-cabinet.html/doctor-cabinet.html),
   раніше кожна мала цей самий inline-скрипт окремо. */
function scaleSlide() {
  const w = document.querySelector('.slide-wrapper');
  const s = Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
  w.style.transform = `scale(${s})`;
}
window.addEventListener('load', scaleSlide);
window.addEventListener('resize', scaleSlide);
