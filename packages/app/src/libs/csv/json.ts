export type Options = {
	delimiter?: string;
	quote?: string;
};

const defaultOptions: Required<Options> = {
	delimiter: ',',
	quote: '"',
};

/**
 * Converts a CSV string into an array of objects.
 */
export const csv2json = <T extends Record<string, string>>(
	input: string,
	options: Options = defaultOptions
): T[] => {
	const { delimiter, quote } = { ...defaultOptions, ...options };

	// Split into lines and trim trailing newlines
	const lines = input
		.split('\n')
		.map((line) => line.trim())
		.filter(Boolean);

	if (lines.length === 0) return [];

	// Extract header row
	const rawHeader = lines[0];
	const headers = rawHeader
		.split(delimiter)
		.map((h) => h.replace(new RegExp(quote, 'g'), '').trim());

	// Parse each row into an object
	return lines.slice(1).map((row) => {
		const cells = row.split(delimiter);
		const record = {} as Record<string, string>;

		headers.forEach((header, idx) => {
			const rawValue = cells[idx] ?? '';
			const cleaned = rawValue.replace(new RegExp(quote, 'g'), '').trim();
			record[header] = cleaned;
		});

		return record as T;
	});
};
