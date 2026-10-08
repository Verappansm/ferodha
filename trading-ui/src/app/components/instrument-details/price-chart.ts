import { InjectionToken } from '@angular/core';
import Chart from 'chart.js/auto';

/** One line of the price chart: a label per point and its closing price. */
export interface PriceSeries {
  labels: string[];
  closes: number[];
  colours: { line: string; fill: string; grid: string; text: string };
}

/** What the page needs from a drawn chart. */
export interface DrawnChart {
  destroy(): void;
}

export type ChartFactory = (canvas: HTMLCanvasElement, series: PriceSeries) => DrawnChart;

/**
 * Draws the closing-price line with chart.js. Behind a token so the page's
 * tests never need a canvas, and imported only by the lazily loaded
 * instrument page, so chart.js is not in the app's first download.
 */
export const CHART_FACTORY = new InjectionToken<ChartFactory>('CHART_FACTORY', {
  providedIn: 'root',
  factory: () => drawPriceChart,
});

function drawPriceChart(canvas: HTMLCanvasElement, series: PriceSeries): DrawnChart {
  return new Chart(canvas, {
    type: 'line',
    data: {
      labels: series.labels,
      datasets: [
        {
          label: 'Close',
          data: series.closes,
          borderColor: series.colours.line,
          backgroundColor: series.colours.fill,
          borderWidth: 2,
          pointRadius: 0,
          fill: true,
          tension: 0.2,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      interaction: { intersect: false, mode: 'index' },
      plugins: { legend: { display: false } },
      scales: {
        x: {
          ticks: { maxTicksLimit: 8, color: series.colours.text },
          grid: { display: false },
          border: { color: series.colours.grid },
        },
        y: {
          position: 'right',
          ticks: { color: series.colours.text },
          grid: { color: series.colours.grid },
          border: { display: false },
        },
      },
    },
  });
}
