import { csv2json } from './json';

/**
 * Converts CSV to SQL insert statements.
 */
export const csv2sql = (csv: string, table = 'schema.table'): string => {
  const data = csv2json(csv);
  if (data.length === 0) return '';

  return data
    .map((row) => {
      const columns = Object.keys(row)
        .map((col) => `"${col}"`)
        .join(', ');

      const values = Object.values(row)
        .map((val) => `"${val}"`)
        .join(', ');

      return `INSERT INTO ${table} (${columns}) VALUES (${values});`;
    })
    .join('\n');
};
