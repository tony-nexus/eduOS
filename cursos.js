/**
 * /js/ui/charts.js
 * Componentes de gráfico reutilizáveis (mini-chart e fin-chart).
 */

/**
 * Renderiza um gráfico de barras financeiro.
 * @param {string} containerId - ID do elemento container
 * @param {string[]} labels - Labels dos meses/períodos
 * @param {number[]} values - Valores numéricos
 */
export function renderFinChart(containerId, labels, values) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const max = Math.max(...values, 1);
  container.innerHTML = `
    <div class="fin-chart">
      ${labels.map((m, i) => `
        <div class="fin-bar-group">
          <div class="fin-bar-stack">
            <div class="fin-bar" style="background:var(--accent);opacity:0.85;height:${Math.round(values[i] / max * 72)}px"></div>
          </div>
          <span class="fin-bar-label">${m}</span>
        </div>
      `).join('')}
    </div>`;
}

/**
 * Renderiza um mini gráfico de barras inline.
 * @param {string} containerId
 * @param {number[]} values
 * @param {string[]} labels
 */
export function renderMiniChart(containerId, values, labels) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const max = Math.max(...values, 1);
  container.innerHTML = `
    <div class="mini-chart">
      ${values.map((v, i) => `
        <div class="mini-bar-wrap">
          <div class="mini-bar" style="height:${Math.round(v / max * 68)}px"></div>
          ${labels?.[i] ? `<span class="mini-bar-label">${labels[i]}</span>` : ''}
        </div>
      `).join('')}
    </div>`;
}
