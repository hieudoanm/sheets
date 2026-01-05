import { csv2json } from './json';
import { csv2md } from './md';
import { csv2sql } from './sql';

export enum Format {
  HTML = 'html',
  JSON = 'json',
  MD = 'md',
  SQL = 'sql',
}

/**
 * High-level API: format CSV into various formats.
 */
export const csv = (input: string) => ({
  format: (format: Format): string => {
    switch (format) {
      case Format.JSON:
        return JSON.stringify(csv2json(input), null, 2);
      case Format.MD:
        return csv2md(input);
      case Format.SQL:
        return csv2sql(input);
      default:
        return input;
    }
  },
});
