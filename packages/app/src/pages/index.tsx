import { Table } from '@csv/components/Table/Table';
import { INITIAL_CSV } from '@csv/constants/app';
import { csv, Format } from '@csv/libs/csv/csv';
import { NextPage } from 'next';
import { ChangeEvent, useState } from 'react';

const HomePage: NextPage = () => {
  const [{ input = INITIAL_CSV, output = '', format = Format.SQL }, setState] =
    useState<{
      input: string;
      output: string;
      format: Format;
    }>({
      input: INITIAL_CSV,
      output: csv(INITIAL_CSV).format(Format.SQL),
      format: Format.SQL,
    });

  return (
    <div className="divide-base-300 flex h-screen w-screen flex-col divide-y">
      <nav className="bg-base-300 px-4 py-2 shadow-2xl md:px-8 md:py-4">
        <div className="flex items-center justify-between">
          <div className="text-xl font-black">CSV</div>
          <div>
            <select
              id="format"
              name="format"
              className="select select-sm"
              value={format}
              onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                setState((previous) => {
                  const selectedFormat = event.target.value as Format;
                  const output = csv(input).format(selectedFormat);
                  return { ...previous, format: selectedFormat, output };
                })
              }>
              {[
                { label: 'HTML', value: 'html' },
                { label: 'JSON', value: 'json' },
                { label: 'MD', value: 'md' },
                { label: 'SQL', value: 'sql' },
              ].map(({ label, value }) => {
                return (
                  <option key={value} value={value}>
                    {label}
                  </option>
                );
              })}
            </select>
          </div>
        </div>
      </nav>
      <main className="h-full grow p-4 md:p-8">
        <div className="grid h-full w-full grid-cols-1 gap-4 md:grid-cols-2 md:gap-8">
          <div className="col-span-1">
            <textarea
              id="input"
              name="input"
              placeholder="Input"
              className="border-base-300 bg-base-300 h-full w-full resize-none truncate overflow-x-auto rounded-lg border p-2 shadow-2xl md:p-4"
              value={input}
              onChange={(event) => {
                const selectedInput = event.target.value;
                setState((previous) => {
                  const output = csv(selectedInput).format(format as Format);
                  return { ...previous, input: selectedInput, output };
                });
              }}></textarea>
          </div>
          <div className="col-span-1">
            {format === 'html' ? (
              <Table csv={input} />
            ) : (
              <textarea
                id="output"
                name="output"
                placeholder="Output"
                className="border-base-300 bg-base-300 h-full w-full resize-none truncate overflow-x-auto rounded-lg border p-2 shadow-2xl md:p-4"
                value={output}></textarea>
            )}
          </div>
        </div>
      </main>
      <footer className="bg-base-300 px-4 py-2 shadow-2xl md:px-8 md:py-4">
        <p className="text-center">&copy; CSV {new Date().getFullYear()}</p>
      </footer>
    </div>
  );
};

export default HomePage;
