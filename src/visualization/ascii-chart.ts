import type { VisualizationData } from '../utils/types.js';

const BLOCKS = ['', '▏', '▎', '▍', '▌', '▋', '▊', '▉', '█'];
const MAX_BAR_WIDTH = 40;
const MAX_LABEL_WIDTH = 20;

export function renderBarChart(data: VisualizationData): string {
  if (data.values.length === 0) {
    return 'No data to visualize';
  }

  const lines: string[] = [];

  if (data.title) {
    lines.push(data.title);
    lines.push('─'.repeat(Math.min(data.title.length, 60)));
  }

  const maxValue = Math.max(...data.values);
  const scale = maxValue > 0 ? MAX_BAR_WIDTH / maxValue : 1;

  for (let i = 0; i < data.labels.length; i++) {
    const label = truncateString(data.labels[i], MAX_LABEL_WIDTH).padEnd(MAX_LABEL_WIDTH);
    const value = data.values[i];
    const bar = renderBar(value, scale);
    const valueStr = formatNumber(value);

    lines.push(`${label} ${bar} ${valueStr}`);
  }

  return lines.join('\n');
}

function renderBar(value: number, scale: number): string {
  const scaledValue = value * scale;
  const fullBlocks = Math.floor(scaledValue);
  const remainder = scaledValue - fullBlocks;
  const partialBlock = Math.floor(remainder * 8);

  let bar = '█'.repeat(fullBlocks);
  if (partialBlock > 0 && fullBlocks < MAX_BAR_WIDTH) {
    bar += BLOCKS[partialBlock];
  }

  return bar;
}

function truncateString(str: string, maxWidth: number): string {
  if (str.length <= maxWidth) {
    return str;
  }
  return str.slice(0, maxWidth - 1) + '…';
}

function formatNumber(num: number): string {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + 'M';
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(1) + 'K';
  }
  if (Number.isInteger(num)) {
    return num.toString();
  }
  return num.toFixed(2);
}
