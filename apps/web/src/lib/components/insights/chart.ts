/**
 * Chart.js — explicit controller / element registration.
 *
 * Importing from `chart.js` (rather than `chart.js/auto`) keeps the
 * bundle to only the pieces the Insight Builder uses. If we later add
 * other chart types, register them here.
 */

import {
  Chart,
  ArcElement,
  BarElement,
  LineElement,
  PointElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend,
  Title,
  PieController,
  BarController,
  LineController,
  Filler,
} from "chart.js";

Chart.register(
  ArcElement,
  BarElement,
  LineElement,
  PointElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend,
  Title,
  PieController,
  BarController,
  LineController,
  Filler,
);

export { Chart };
