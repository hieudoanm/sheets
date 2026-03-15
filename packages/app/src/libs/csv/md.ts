import { csv2json } from './json';

/**
 * Converts CSV to MD table format.
 */
export const csv2md = (csv: string): string => {
  const data = csv2json(csv);
  if (data.length === 0) return '';

  const headers = Object.keys(data[0]);

  // Calculate column widths based on max header/value length
  const columnWidths = headers.map((header) =>
    Math.max(header.length, ...data.map((row) => (row[header] ?? '').length))
  );

  const formatRow = (values: string[]) =>
    `| ${values.map((val, i) => val.padEnd(columnWidths[i], ' ')).join(' | ')} |`;

  const headerRow = formatRow(headers);
  const dividerRow = `| ${columnWidths.map((len) => '-'.repeat(len)).join(' | ')} |`;
  const bodyRows = data.map((row) =>
    formatRow(headers.map((h) => row[h] ?? ''))
  );

  return [headerRow, dividerRow, ...bodyRows].join('\n');
};
