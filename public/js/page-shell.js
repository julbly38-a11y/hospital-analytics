/* Рендерить структурний "перший шар" (логотип, лінії, KPI-блок, роки) з
   LAYOUT_CONFIG у контейнер .slide. Спільна частина (логотип/лінії/KPI-рядок/
   фільтр років) винесена в utils.js:renderHeaderBlock() — використовується і
   тут, і в entry.js; тут лишається лише специфічний для layout.html підвал. */

function renderShell(root, config) {
  config = config || window.LAYOUT_CONFIG;
  if (!root || !config) return;

  renderHeaderBlock(root, config.kpi, config.yearsBack);

  // Смуга "Для працівників": форма логіну (стан "залогінено" з черговими
  // лікарями замість форми — наступний шар, тут лише неавторизований стан).
  root.insertAdjacentHTML('beforeend', `
    <div class="work-band">
      <span class="wb-title">Для працівників:</span>
      <span class="wb-login">LOGIN:</span>
      <span class="wb-pass">PASSWORDS:</span>
    </div>
    <div class="staff-fields">
      <input class="f-login" type="text" placeholder="введіть логін" autocomplete="off">
      <input class="f-pass" type="password" placeholder="введіть пароль" autocomplete="off">
      <span class="f-btn">Увійти</span>
      <span class="f-forgot">Забув пароль?</span>
      <span class="f-error"></span>
    </div>
  `);
}
