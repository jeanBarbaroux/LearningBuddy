// SVG charts of the Statistics page (v1 StatisticsActivityHeatmapData, StatisticsPieChartData,
// StatisticsTimelineLineChart). Colours are CSS variables so that they follow the theme.
import type { ReactElement } from 'react';
import type { LevelCategory, LevelCounts, LevelTimelinePoint, PresentationPoint, ActivityDay, OutcomeCounts, TimelinePeriod } from '../../../core/statistics/statistics';
import { LEVEL_CATEGORIES } from '../../../core/statistics/statistics';
import type { RatingOutcome } from '../../../core/model';
import { formatNumber, formatShortDate, formatDayMonth } from '../../../shared/i18n/i18n';
import type { TextKey } from '../../../shared/i18n/texts';
import { language, t, tf } from '../../lib/i18n';

// Level categories: label and colour shared by the pie chart and the stacked area chart.
export const LEVEL_COLORS: Readonly<Record<LevelCategory, string>> = {
  unseen: 'var(--chart-unseen)',
  level0: 'var(--error)',
  level1: 'var(--warning)',
  level2: 'var(--accent-hover)',
  level3: 'var(--info)',
  level4: 'var(--accent)',
  level5Plus: 'var(--success)',
};

export function levelLabel(category: LevelCategory): string {
  switch (category) {
    case 'unseen':
      return t('StatisticsUnseenCards');
    case 'level5Plus':
      return tf('StatisticsCardLevel', '5+');
    default:
      return tf('StatisticsCardLevel', category.slice('level'.length));
  }
}

function percent(value: number): string {
  const text = formatNumber(language(), value, 1);
  return language() === 'en' ? `${text}%` : `${text} %`;
}

// Heatmap ----------------------------------------------------------------------------------------

export function activityHeatmap(weeks: readonly (readonly ActivityDay[])[]): ReactElement {
  const cell = 11;
  const gap = 3;
  return (
    <div className="stack">
      <div className="chart-scroll">
        <svg viewBox={`0 0 ${weeks.length * (cell + gap)} ${7 * (cell + gap)}`} className="heatmap" role="img" aria-label={t('StatisticsActivityHeading')}>
          {weeks.map((week, column) => week.map((day, row) => (
            <rect key={`${day.day}-${row}`} x={column * (cell + gap)} y={row * (cell + gap)} width={cell} height={cell} rx={2} style={{ fill: `var(--heatmap-${day.level})` }}>
              <title>{tf('StatisticsActivityDayTooltip', formatShortDate(language(), day.day), day.count)}</title>
            </rect>
          )))}
        </svg>
      </div>
      <div className="row legend small muted">
        {t('StatisticsActivityLess')}
        {[0, 1, 2, 3, 4].map((level) => <span className="swatch" style={{ background: `var(--heatmap-${level})` }} key={level} />)}
        {t('StatisticsActivityMore')}
      </div>
    </div>
  );
}

// Pie chart --------------------------------------------------------------------------------------

export function levelPieChart(counts: LevelCounts): ReactElement {
  const total = LEVEL_CATEGORIES.reduce((sum, category) => sum + counts[category], 0);
  const nonEmpty = LEVEL_CATEGORIES.filter((category) => counts[category] > 0);
  let angle = 0;
  const slices = nonEmpty.map((category) => {
    const value = counts[category];
    const label = `${levelLabel(category)}: ${value} (${percent((value / total) * 100)})`;
    if (nonEmpty.length === 1) {
      return (
        <circle key={category} cx={50} cy={50} r={48} style={{ fill: LEVEL_COLORS[category] }}>
          <title>{label}</title>
        </circle>
      );
    }

    const sweep = (value / total) * Math.PI * 2;
    const start = point(angle);
    const end = point(angle + sweep);
    angle += sweep;
    return (
      <path key={category} d={`M50 50 L${start.x} ${start.y} A48 48 0 ${sweep > Math.PI ? 1 : 0} 1 ${end.x} ${end.y} Z`} style={{ fill: LEVEL_COLORS[category], stroke: 'var(--surface)', strokeWidth: 0.6 }}>
        <title>{label}</title>
      </path>
    );
  });

  return (
    <div className="row pie-layout">
      <svg viewBox="0 0 100 100" className="pie" role="img" aria-label={t('StatisticsCardDistributionHeading')}>{slices}</svg>
      <ul className="legend-list">
        {LEVEL_CATEGORIES.map((category) => (
          <li key={category}>
            <span className="swatch" style={{ background: LEVEL_COLORS[category] }} />
            {`${levelLabel(category)} : ${counts[category]}${total > 0 ? ` (${percent((counts[category] / total) * 100)})` : ''}`}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Point of the circle of radius 48 at `angle`, starting at 12 o'clock and turning clockwise. */
function point(angle: number): { x: number; y: number } {
  return { x: 50 + 48 * Math.sin(angle), y: 50 - 48 * Math.cos(angle) };
}

// Outcome bars -----------------------------------------------------------------------------------

const OUTCOMES: readonly { outcome: RatingOutcome; label: TextKey; color: string }[] = [
  { outcome: 'again', label: 'ReviewAgainCount', color: 'var(--error)' },
  { outcome: 'hard', label: 'ReviewHardCount', color: 'var(--warning)' },
  { outcome: 'good', label: 'ReviewGoodCount', color: 'var(--success)' },
  { outcome: 'easy', label: 'ReviewEasyCount', color: 'var(--info)' },
];

export function outcomeBars(counts: OutcomeCounts): ReactElement {
  const maximum = Math.max(...OUTCOMES.map(({ outcome }) => counts[outcome]));
  return (
    <div className="bars">
      {OUTCOMES.map(({ outcome, label, color }) => {
        const value = counts[outcome];
        return (
          <div className="bar-row" aria-label={tf('StatisticsOutcomeAccessibleValue', t(label), value)} key={outcome}>
            <span className="bar-label">{t(label)}</span>
            <span className="bar-track"><span className="bar" style={{ width: `${maximum === 0 ? 0 : (value / maximum) * 100}%`, background: color }} /></span>
            <span className="bar-value">{value}</span>
          </div>
        );
      })}
    </div>
  );
}

// Line chart -------------------------------------------------------------------------------------

const WIDTH = 720;
const HEIGHT = 232;
const MARGIN = { left: 46, right: 12, top: 14, bottom: 42 };

export function periodLabel(period: TimelinePeriod, daily: boolean): string {
  return daily || period.start === period.end
    ? formatShortDate(language(), period.start)
    : `${formatDayMonth(language(), period.start)} – ${formatDayMonth(language(), period.end)}`;
}

/** Questions presented per period; the y axis is rounded up to an even maximum. */
export function presentationLineChart(points: readonly PresentationPoint[], daily: boolean): ReactElement {
  const maxPresented = Math.max(0, ...points.map((item) => item.presented));
  const yMax = Math.max(2, Math.floor((maxPresented + 1) / 2) * 2);
  const coordinates = points.map((item, index) => ({ x: xAt(index, points.length), y: yAt(item.presented, yMax), item }));
  const line = coordinates.map(({ x, y }, index) => `${index === 0 ? 'M' : 'L'}${x} ${y}`).join(' ');
  const baseline = yAt(0, yMax);
  const labels = points.map((item) => periodLabel(item.period, daily));

  return (
    <div className="chart-scroll">
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="line-chart" role="img">
        {chartFrame(yMax, labels)}
        {coordinates.length > 0 && (
          <>
            <path d={`${line} L${coordinates.at(-1)!.x} ${baseline} L${coordinates[0]!.x} ${baseline} Z`} style={{ fill: 'var(--chart-series)', opacity: 0.12 }} />
            <path d={line} style={{ fill: 'none', stroke: 'var(--chart-series)', strokeWidth: 2.5, strokeLinecap: 'round', strokeLinejoin: 'round' }} />
          </>
        )}
        {coordinates.map(({ x, y, item }, index) => {
          const label = `${periodLabel(item.period, daily)}, ${item.presented} ${t('StatisticsPresentationsLabel')}`;
          return (
            <g className="point" key={index}>
              <circle cx={x} cy={y} r={4.5} style={{ fill: 'var(--surface)' }} />
              <circle cx={x} cy={y} r={3} style={{ fill: 'var(--chart-series)' }} />
              <rect x={x - bandWidth(points.length) / 2} y={MARGIN.top} width={bandWidth(points.length)} height={HEIGHT - MARGIN.top - MARGIN.bottom} style={{ fill: 'transparent' }}>
                <title>{label}</title>
              </rect>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/** Cards per level category at the end of each period, stacked from unseen (bottom) to 5+ (top). */
export function levelStackedAreaChart(points: readonly LevelTimelinePoint[], daily: boolean): ReactElement {
  const totals = points.map((item) => LEVEL_CATEGORIES.reduce((sum, category) => sum + item.counts[category], 0));
  const yMax = Math.max(1, ...totals);
  const labels = points.map((item) => periodLabel(item.period, daily));
  const lower = points.map(() => 0);
  const areas: ReactElement[] = [];

  for (const category of LEVEL_CATEGORIES) {
    const upper = points.map((item, index) => lower[index]! + item.counts[category]);
    if (points.length > 0 && upper.some((value, index) => value !== lower[index])) {
      const top = upper.map((value, index) => `${index === 0 ? 'M' : 'L'}${xAt(index, points.length)} ${yAt(value, yMax)}`).join(' ');
      const bottom = lower.map((value, index) => ({ x: xAt(index, points.length), y: yAt(value, yMax) })).reverse()
        .map(({ x, y }) => `L${x} ${y}`).join(' ');
      areas.push(<path key={category} d={`${top} ${bottom} Z`} style={{ fill: LEVEL_COLORS[category], opacity: 0.85 }} />);
    }

    upper.forEach((value, index) => {
      lower[index] = value;
    });
  }

  return (
    <div className="stack">
      <div className="chart-scroll">
        <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="line-chart" role="img">
          {chartFrame(yMax, labels)}
          {areas}
          {points.map((item, index) => {
            const details = [periodLabel(item.period, daily), ...LEVEL_CATEGORIES.map((category) => `${levelLabel(category)}: ${item.counts[category]}`)];
            const x = xAt(index, points.length);
            return (
              <rect key={index} x={x - bandWidth(points.length) / 2} y={MARGIN.top} width={bandWidth(points.length)} height={HEIGHT - MARGIN.top - MARGIN.bottom} style={{ fill: 'transparent' }}>
                <title>{details.join('\n')}</title>
              </rect>
            );
          })}
        </svg>
      </div>
      <div className="row legend small">
        {LEVEL_CATEGORIES.map((category) => (
          <span className="row legend-item" key={category}>
            <span className="swatch" style={{ background: LEVEL_COLORS[category] }} />{levelLabel(category)}
          </span>
        ))}
      </div>
    </div>
  );
}

function chartFrame(yMax: number, labels: readonly string[]): ReactElement {
  const ticks = Array.from({ length: 5 }, (_, step) => {
    const value = (yMax * step) / 4;
    const y = yAt(value, yMax);
    return (
      <g key={step}>
        <line x1={MARGIN.left} x2={WIDTH - MARGIN.right} y1={y} y2={y} style={{ stroke: 'var(--chart-grid)', strokeWidth: 0.7 }} />
        <text x={MARGIN.left - 6} y={y + 4} textAnchor="end" className="axis-label">{formatNumber(language(), value, 1)}</text>
      </g>
    );
  });

  // At most about eight period labels, so that they never overlap; the last period is always labelled.
  const every = Math.max(1, Math.ceil(labels.length / 8));
  const last = labels.length - 1;
  const periodLabels = labels.map((text, index) => {
    const regular = index % every === 0 && last - index >= every;
    if (!regular && index !== last) {
      return null;
    }

    return <text key={index} x={xAt(index, labels.length)} y={HEIGHT - MARGIN.bottom + 18} textAnchor="middle" className="axis-label">{text}</text>;
  });
  return <g>{ticks}{periodLabels}</g>;
}

function xAt(index: number, count: number): number {
  const width = WIDTH - MARGIN.left - MARGIN.right;
  return count <= 1 ? MARGIN.left + width / 2 : MARGIN.left + (width * index) / (count - 1);
}

function yAt(value: number, yMax: number): number {
  const height = HEIGHT - MARGIN.top - MARGIN.bottom;
  return MARGIN.top + height - (height * value) / yMax;
}

function bandWidth(count: number): number {
  return Math.max(8, (WIDTH - MARGIN.left - MARGIN.right) / Math.max(1, count));
}