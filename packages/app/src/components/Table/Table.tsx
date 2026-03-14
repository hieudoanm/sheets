import { DELIMITER } from '@sheets/constants/app';
import { csv2json } from '@sheets/libs/csv/json';
import { FC } from 'react';

const copy = (text: string) => {
	if (!navigator?.clipboard) return alert('Incompatible');
	navigator.clipboard.writeText(text);
	alert(`Copy "${text}" to Clipboard`);
};

export const Table: FC<{ csv: string }> = ({ csv = '' }) => {
	const data: Record<string, string>[] = csv2json(csv, {
		delimiter: DELIMITER,
	});

	return (
		<div className="flex flex-col gap-y-4 md:gap-y-8">
			<div className="w-full overflow-auto rounded-lg border border-neutral-800">
				<table id="csv-html-table" className="bg-base-300 w-full">
					{data[0] ? (
						<thead>
							<tr>
								{Object.keys(data[0]).map((key: string, index: number) => {
									return (
										<th key={`${key}-${index}`} align="left">
											<p
												title={key}
												className="truncate px-2 py-1 md:px-4 md:py-2">
												{key}
											</p>
										</th>
									);
								})}
							</tr>
						</thead>
					) : (
						<></>
					)}
					<tbody>
						{data.map((item: Record<string, string>) => {
							return (
								<tr
									key={`row-${JSON.stringify(item)}`}
									className="border-t border-neutral-800">
									{Object.values(item).map((value: string, index: number) => {
										return (
											<td key={`${value}-${index}`}>
												<p
													title={value}
													className="truncate px-2 py-1 md:px-4 md:py-2">
													{value}
												</p>
											</td>
										);
									})}
								</tr>
							);
						})}
					</tbody>
				</table>
			</div>
			<button
				type="button"
				className="btn btn-primary"
				onClick={() => {
					const csvHtmlTable: string =
						document.getElementById('csv-html-table')?.outerHTML ?? '';
					copy(csvHtmlTable);
				}}>
				Copy
			</button>
		</div>
	);
};
