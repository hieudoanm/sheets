'use client';

import { NextPage } from 'next';
import { FC, useCallback, useEffect, useRef, useState } from 'react';
import {
  FiUpload,
  FiPlus,
  FiSave,
  FiDownload,
  FiSearch,
  FiDatabase,
  FiChevronUp,
  FiChevronDown,
  FiCopy,
  FiCheck,
  FiX,
} from 'react-icons/fi';

// ─── Types ────────────────────────────────────────────────────────────────────

interface TableMeta {
  name: string;
  rowCount: number;
}

interface QueryResult {
  columns: string[];
  rows: (string | number | null | Uint8Array)[][];
}

type SqlJsStatic = {
  Database: new (data?: ArrayLike<number> | Buffer | null) => SqlDatabase;
};

type SqlDatabase = {
  exec: (sql: string) => {
    columns: string[];
    values: (string | number | null | Uint8Array)[][];
  }[];
  run: (sql: string, params?: any[]) => void;
  export: () => Uint8Array;
  close: () => void;
};

type ExportFormat = 'csv' | 'json' | 'md' | 'sql';

// ─── Constants ────────────────────────────────────────────────────────────────

const PAGE_SIZE = 100;
const SQLS_CDN =
  'https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.2/sql-wasm.js';
const WASM_CDN =
  'https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.2/sql-wasm.wasm';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const formatBytes = (n: number): string => {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
};

const formatNumber = (n: number): string => n.toLocaleString();

const opfsAvailable = async (): Promise<boolean> => {
  try {
    await navigator.storage.getDirectory();
    return true;
  } catch {
    return false;
  }
};

const saveToOPFS = async (
  filename: string,
  data: Uint8Array
): Promise<void> => {
  const root = await navigator.storage.getDirectory();
  const fh = await root.getFileHandle(filename, { create: true });
  const writable = await (fh as any).createWritable();
  await writable.write(data);
  await writable.close();
};

const loadFromOPFS = async (filename: string): Promise<Uint8Array | null> => {
  try {
    const root = await navigator.storage.getDirectory();
    const fh = await root.getFileHandle(filename);
    const file = await (fh as any).getFile();
    return new Uint8Array(await file.arrayBuffer());
  } catch {
    return null;
  }
};

const listOPFSFiles = async (): Promise<string[]> => {
  try {
    const root = await navigator.storage.getDirectory();
    const files: string[] = [];
    for await (const [name] of (root as any).entries()) {
      if (/\.(db|sqlite|sqlite3)$/i.test(name)) files.push(name);
    }
    return files;
  } catch {
    return [];
  }
};

// ─── Export converters ────────────────────────────────────────────────────────

type CellVal = string | number | null | Uint8Array;

const cellToString = (v: CellVal): string => {
  if (v === null) return '';
  if (v instanceof Uint8Array) return `[BLOB ${v.length}B]`;
  return String(v);
};

const convertToCSV = (columns: string[], rows: CellVal[][]): string => {
  const escape = (s: string) =>
    s.includes(',') || s.includes('"') || s.includes('\n')
      ? `"${s.replace(/"/g, '""')}"`
      : s;
  const header = columns.map(escape).join(',');
  const body = rows
    .map((r) => r.map((v) => escape(cellToString(v))).join(','))
    .join('\n');
  return header + '\n' + body;
};

const convertToJSON = (columns: string[], rows: CellVal[][]): string => {
  const data = rows.map((r) => {
    const obj: Record<string, CellVal> = {};
    columns.forEach((c, i) => {
      obj[c] =
        r[i] instanceof Uint8Array
          ? `[BLOB ${(r[i] as Uint8Array).length}B]`
          : r[i];
    });
    return obj;
  });
  return JSON.stringify(data, null, 2);
};

const convertToMarkdown = (columns: string[], rows: CellVal[][]): string => {
  const header = `| ${columns.join(' | ')} |`;
  const sep = `| ${columns.map(() => '---').join(' | ')} |`;
  const body = rows
    .map(
      (r) =>
        `| ${r.map((v) => cellToString(v).replace(/\|/g, '\\|')).join(' | ')} |`
    )
    .join('\n');
  return [header, sep, body].join('\n');
};

const convertToSQL = (
  tableName: string,
  columns: string[],
  rows: CellVal[][]
): string => {
  if (rows.length === 0) return `-- No rows in "${tableName}"`;
  const cols = columns.map((c) => `"${c}"`).join(', ');
  const sqlVal = (v: CellVal): string => {
    if (v === null) return 'NULL';
    if (v instanceof Uint8Array) return 'NULL';
    if (typeof v === 'number') return String(v);
    return `'${String(v).replace(/'/g, "''")}'`;
  };
  return rows
    .map(
      (r) =>
        `INSERT INTO "${tableName}" (${cols}) VALUES (${r.map(sqlVal).join(', ')});`
    )
    .join('\n');
};

const getExportContent = (
  format: ExportFormat,
  tableName: string,
  columns: string[],
  rows: CellVal[][]
): string => {
  switch (format) {
    case 'csv':
      return convertToCSV(columns, rows);
    case 'json':
      return convertToJSON(columns, rows);
    case 'md':
      return convertToMarkdown(columns, rows);
    case 'sql':
      return convertToSQL(tableName, columns, rows);
  }
};

const EXPORT_FORMATS: {
  label: string;
  value: ExportFormat;
  ext: string;
  mime: string;
}[] = [
  { label: 'CSV', value: 'csv', ext: 'csv', mime: 'text/csv' },
  { label: 'JSON', value: 'json', ext: 'json', mime: 'application/json' },
  { label: 'Markdown', value: 'md', ext: 'md', mime: 'text/markdown' },
  { label: 'SQL INSERT', value: 'sql', ext: 'sql', mime: 'text/plain' },
];

// ─── Export Modal ─────────────────────────────────────────────────────────────

const ExportModal: FC<{
  tableName: string;
  columns: string[];
  rows: CellVal[][];
  onClose: () => void;
}> = ({ tableName, columns, rows, onClose }) => {
  const [format, setFormat] = useState<ExportFormat>('csv');
  const [copied, setCopied] = useState(false);

  const content = getExportContent(format, tableName, columns, rows);
  const fmt = EXPORT_FORMATS.find((f) => f.value === format)!;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const blob = new Blob([content], { type: fmt.mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${tableName}.${fmt.ext}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="bg-base-100 border-base-300 flex max-h-[80vh] w-full max-w-2xl flex-col rounded-2xl border shadow-2xl">
        {/* Modal header */}
        <div className="border-base-300 flex flex-shrink-0 items-center justify-between border-b px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="text-base-content font-bold tracking-tight">
              Export <span className="text-primary font-mono">{tableName}</span>
            </span>
            <span className="text-base-content/30 font-mono text-xs">
              {formatNumber(rows.length)} rows · {columns.length} cols
            </span>
          </div>
          <button className="btn btn-ghost btn-sm btn-circle" onClick={onClose}>
            <FiX className="h-4 w-4" />
          </button>
        </div>

        {/* Format tabs */}
        <div className="flex flex-shrink-0 gap-1 px-5 pt-4">
          {EXPORT_FORMATS.map((f) => (
            <button
              key={f.value}
              onClick={() => setFormat(f.value)}
              className={`btn btn-sm rounded-lg transition-all ${
                format === f.value
                  ? 'btn-primary'
                  : 'btn-ghost text-base-content/50 hover:text-base-content'
              }`}>
              {f.label}
            </button>
          ))}
        </div>

        {/* Preview */}
        <div className="min-h-0 flex-1 overflow-auto px-5 py-3">
          <textarea
            readOnly
            className="bg-base-200 border-base-300 h-64 w-full resize-none rounded-lg border p-3 font-mono text-xs leading-relaxed focus:outline-none"
            value={content}
          />
        </div>

        {/* Actions */}
        <div className="border-base-300 flex flex-shrink-0 items-center gap-2 border-t px-5 py-4">
          <button className="btn btn-ghost btn-sm gap-2" onClick={handleCopy}>
            {copied ? (
              <>
                <FiCheck className="text-success h-3.5 w-3.5" />
                <span className="text-success">Copied!</span>
              </>
            ) : (
              <>
                <FiCopy className="h-3.5 w-3.5" />
                Copy
              </>
            )}
          </button>
          <button
            className="btn btn-primary btn-sm ml-auto gap-2"
            onClick={handleDownload}>
            <FiDownload className="h-3.5 w-3.5" />
            Download .{fmt.ext}
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── Cell renderer ────────────────────────────────────────────────────────────

const CellValue = ({ value }: { value: CellVal }) => {
  if (value === null)
    return <span className="text-base-content/30 text-xs italic">NULL</span>;
  if (value instanceof Uint8Array)
    return (
      <span className="text-warning/70 text-xs italic">
        [BLOB {value.length}B]
      </span>
    );
  if (typeof value === 'number')
    return <span className="text-primary font-mono">{value}</span>;
  const s = String(value);
  const lower = s.toLowerCase();
  if (s === '1' || lower === 'true')
    return <span className="text-success font-mono text-xs">{s}</span>;
  if (s === '0' || lower === 'false')
    return <span className="text-error font-mono text-xs">{s}</span>;
  return (
    <span className="font-mono text-xs">
      {s.length > 80 ? s.slice(0, 80) + '…' : s}
    </span>
  );
};

// ─── Icons ────────────────────────────────────────────────────────────────────

const TableIcon = ({ className }: { className?: string }) => (
  <svg
    className={className}
    viewBox="0 0 14 14"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.2">
    <rect x="1" y="1" width="12" height="12" rx="1.5" />
    <line x1="1" y1="5" x2="13" y2="5" />
    <line x1="5" y1="5" x2="5" y2="13" />
  </svg>
);

const DatabaseLargeIcon = () => (
  <svg
    className="h-20 w-20"
    viewBox="0 0 48 48"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.2">
    <ellipse cx="24" cy="12" rx="16" ry="5.5" />
    <path d="M8 12v8c0 3.038 7.163 5.5 16 5.5S40 23.038 40 20v-8" />
    <path d="M8 20v8c0 3.038 7.163 5.5 16 5.5S40 31.038 40 28v-8" />
    <path d="M8 28v8c0 3.038 7.163 5.5 16 5.5S40 39.038 40 36v-8" />
  </svg>
);

const SortIcon = ({ active, dir }: { active: boolean; dir: number }) => {
  if (!active)
    return (
      <ChevronsUpDownIcon className="text-base-content/20 h-3 w-3 opacity-0 transition-opacity group-hover:opacity-100" />
    );
  return dir === 1 ? (
    <FiChevronUp className="text-primary h-3 w-3" />
  ) : (
    <FiChevronDown className="text-primary h-3 w-3" />
  );
};

const ChevronsUpDownIcon: FC<{ className: string }> = ({ className }) => (
  <svg
    className={className}
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5">
    <path
      d="M5 6l3-3 3 3M5 10l3 3 3-3"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

// ─── Main page ────────────────────────────────────────────────────────────────

const AppPage: NextPage = () => {
  const [sqlJs, setSqlJs] = useState<SqlJsStatic | null>(null);
  const [dbInstance, setDbInstance] = useState<SqlDatabase | null>(null);
  const [dbFileName, setDbFileName] = useState<string | null>(null);
  const [tables, setTables] = useState<TableMeta[]>([]);
  const [activeTable, setActiveTable] = useState<string | null>(null);
  const [queryResult, setQueryResult] = useState<QueryResult>({
    columns: [],
    rows: [],
  });
  const [filteredRows, setFilteredRows] = useState<QueryResult['rows']>([]);
  const [sortCol, setSortCol] = useState<number | null>(null);
  const [sortDir, setSortDir] = useState<1 | -1>(1);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState('');
  const [status, setStatus] = useState('Ready · No database loaded');
  const [isDragging, setIsDragging] = useState(false);
  const [opfsFiles, setOpfsFiles] = useState<string[]>([]);
  const [showExport, setShowExport] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const dbRef = useRef<SqlDatabase | null>(null);

  useEffect(() => {
    dbRef.current = dbInstance;
  }, [dbInstance]);

  // ── Load sql.js WASM ──
  const loadSqlJs = useCallback(async (): Promise<SqlJsStatic> => {
    if (sqlJs) return sqlJs;
    return new Promise((resolve, reject) => {
      if ((window as any).initSqlJs) {
        (window as any)
          .initSqlJs({ locateFile: () => WASM_CDN })
          .then((s: SqlJsStatic) => {
            setSqlJs(s);
            resolve(s);
          });
        return;
      }
      const script = document.createElement('script');
      script.src = SQLS_CDN;
      script.onload = () => {
        (window as any)
          .initSqlJs({ locateFile: () => WASM_CDN })
          .then((s: SqlJsStatic) => {
            setSqlJs(s);
            resolve(s);
          });
      };
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }, [sqlJs]);

  useEffect(() => {
    listOPFSFiles().then(setOpfsFiles);
  }, []);

  // ── Filter + sort rows ──
  useEffect(() => {
    let rows = [...queryResult.rows];
    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter((r) =>
        r.some((v) =>
          String(v ?? '')
            .toLowerCase()
            .includes(q)
        )
      );
    }
    if (sortCol !== null) {
      rows.sort((a, b) => {
        const av = a[sortCol],
          bv = b[sortCol];
        if (av === null && bv === null) return 0;
        if (av === null) return 1;
        if (bv === null) return -1;
        if (av instanceof Uint8Array || bv instanceof Uint8Array) return 0;
        return av < bv ? -sortDir : av > bv ? sortDir : 0;
      });
    }
    setFilteredRows(rows);
    setPage(0);
  }, [queryResult, search, sortCol, sortDir]);

  // ── Open database from buffer ──
  const openDb = useCallback(
    async (buffer: Uint8Array, filename: string) => {
      setLoading(true);
      setLoadingMsg('Initialising SQLite WASM engine…');
      try {
        const SQL = await loadSqlJs();
        setLoadingMsg('Parsing database…');
        if (dbRef.current) {
          try {
            dbRef.current.close();
          } catch {}
        }

        const instance = new SQL.Database(buffer);
        const res = instance.exec(
          "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
        );
        const names: string[] = res.length
          ? res[0].values.map((r) => String(r[0]))
          : [];
        const metas: TableMeta[] = names.map((name) => {
          try {
            const r = instance.exec(`SELECT COUNT(*) FROM "${name}"`);
            return { name, rowCount: Number(r[0].values[0][0]) };
          } catch {
            return { name, rowCount: 0 };
          }
        });

        setDbInstance(instance);
        setDbFileName(filename);
        setTables(metas);
        setStatus(
          `Opened "${filename}" · ${metas.length} table${metas.length !== 1 ? 's' : ''}`
        );

        if (metas.length > 0) {
          selectTableWithInstance(instance, metas[0].name);
        } else {
          setActiveTable(null);
          setQueryResult({ columns: [], rows: [] });
        }
        listOPFSFiles().then(setOpfsFiles);
      } catch (e: any) {
        setStatus('Error: ' + e.message);
      } finally {
        setLoading(false);
      }
    },
    [loadSqlJs]
  );

  // ── Select table ──
  const selectTableWithInstance = (instance: SqlDatabase, name: string) => {
    try {
      const res = instance.exec(`SELECT * FROM "${name}" LIMIT 10000`);
      const result: QueryResult = res.length
        ? { columns: res[0].columns, rows: res[0].values }
        : { columns: [], rows: [] };
      setQueryResult(result);
      setActiveTable(name);
      setSortCol(null);
      setSortDir(1);
      setSearch('');
      setPage(0);
      setStatus(
        `"${name}" · ${formatNumber(result.rows.length)} rows · ${result.columns.length} columns`
      );
    } catch (e: any) {
      setStatus('Query error: ' + e.message);
    }
  };

  const selectTable = (name: string) => {
    if (!dbInstance) return;
    selectTableWithInstance(dbInstance, name);
  };

  // ── New demo database ──
  const createNewDb = async () => {
    setLoading(true);
    setLoadingMsg('Creating database…');
    try {
      const SQL = await loadSqlJs();
      if (dbRef.current) {
        try {
          dbRef.current.close();
        } catch {}
      }

      const instance = new SQL.Database();

      instance.run(
        'CREATE TABLE customers (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, email TEXT, country TEXT, plan TEXT, mrr REAL, active INTEGER, joined TEXT)'
      );
      const customers: [
        string,
        string,
        string,
        string,
        number,
        number,
        string,
      ][] = [
        [
          'Alice Tan',
          'alice@acme.io',
          'Singapore',
          'Enterprise',
          499,
          1,
          '2023-01-15',
        ],
        ['Bob Nguyen', 'bob@ng.io', 'Vietnam', 'Pro', 99, 1, '2023-03-20'],
        [
          'Cara Smith',
          'cara@uk.co',
          'United Kingdom',
          'Enterprise',
          499,
          1,
          '2023-05-11',
        ],
        [
          'David Park',
          'd.park@kr.co',
          'South Korea',
          'Pro',
          99,
          0,
          '2023-06-01',
        ],
        ['Elena Rossi', 'elena@it.it', 'Italy', 'Free', 0, 1, '2023-07-14'],
        ['Feng Li', 'feng@cn.co', 'China', 'Enterprise', 499, 1, '2023-08-22'],
        ['Gina Müller', 'gina@de.co', 'Germany', 'Pro', 99, 1, '2023-09-05'],
        ['Hiro Sato', 'hiro@jp.co', 'Japan', 'Free', 0, 0, '2023-10-18'],
        ['Irina Popov', 'irina@ru.co', 'Russia', 'Pro', 99, 1, '2023-11-30'],
        [
          'Jorge Lima',
          'jorge@br.co',
          'Brazil',
          'Enterprise',
          499,
          1,
          '2024-01-09',
        ],
      ];
      customers.forEach(([n, e, c, p, m, a, j]) =>
        instance.run(
          'INSERT INTO customers (name, email, country, plan, mrr, active, joined) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [n, e, c, p, m, a, j]
        )
      );

      instance.run(
        'CREATE TABLE orders (order_id INTEGER PRIMARY KEY, customer_id INTEGER, product TEXT, amount REAL, status TEXT, created_at TEXT)'
      );
      const orders: [number, number, string, number, string, string][] = [
        [1001, 1, 'Enterprise Plan', 499, 'paid', '2024-01-15'],
        [1002, 3, 'Enterprise Plan', 499, 'paid', '2024-01-16'],
        [1003, 2, 'Pro Plan', 99, 'paid', '2024-01-20'],
        [1004, 6, 'Enterprise Plan', 499, 'paid', '2024-01-22'],
        [1005, 4, 'Pro Plan', 99, 'cancelled', '2024-02-01'],
        [1006, 7, 'Pro Plan', 99, 'paid', '2024-02-10'],
        [1007, 10, 'Enterprise Plan', 499, 'paid', '2024-02-14'],
        [1008, 9, 'Pro Plan', 99, 'paid', '2024-02-20'],
        [1009, 5, 'Free Tier', 0, 'active', '2024-03-01'],
        [1010, 8, 'Free Tier', 0, 'active', '2024-03-05'],
      ];
      orders.forEach(([oid, cid, prod, amt, st, ca]) =>
        instance.run('INSERT INTO orders VALUES (?, ?, ?, ?, ?, ?)', [
          oid,
          cid,
          prod,
          amt,
          st,
          ca,
        ])
      );

      instance.run(
        'CREATE TABLE products (id INTEGER PRIMARY KEY, name TEXT, price REAL, category TEXT, sku TEXT)'
      );
      const products: [string, number, string, string][] = [
        ['Free Tier', 0, 'Subscription', 'FREE-001'],
        ['Pro Plan', 99, 'Subscription', 'PRO-001'],
        ['Enterprise', 499, 'Subscription', 'ENT-001'],
        ['API Add-on', 29, 'Add-on', 'API-001'],
        ['Storage 50GB', 19, 'Add-on', 'STR-050'],
        ['Storage 500GB', 79, 'Add-on', 'STR-500'],
      ];
      products.forEach(([n, p, c, s]) =>
        instance.run(
          'INSERT INTO products (name, price, category, sku) VALUES (?, ?, ?, ?)',
          [n, p, c, s]
        )
      );

      const metas: TableMeta[] = ['customers', 'orders', 'products'].map(
        (name) => {
          const r = instance.exec(`SELECT COUNT(*) FROM "${name}"`);
          return { name, rowCount: Number(r[0].values[0][0]) };
        }
      );

      setDbInstance(instance);
      setDbFileName('demo_database.db');
      setTables(metas);
      selectTableWithInstance(instance, 'customers');
      setStatus('Created demo database · 3 tables');
    } catch (e: any) {
      setStatus('Error: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  // ── File open ──
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const buf = new Uint8Array(ev.target!.result as ArrayBuffer);
      openDb(buf, file.name);
    };
    reader.readAsArrayBuffer(file);
    e.target.value = '';
  };

  // ── Drag & drop ──
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };
  const handleDragLeave = () => setIsDragging(false);
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const buf = new Uint8Array(ev.target!.result as ArrayBuffer);
      openDb(buf, file.name);
    };
    reader.readAsArrayBuffer(file);
  };

  // ── Save to OPFS ──
  const handleSave = async () => {
    if (!dbInstance || !dbFileName) return;
    if (!(await opfsAvailable())) {
      alert('OPFS is not available. Use Chrome or Edge.');
      return;
    }
    try {
      const data = dbInstance.export();
      await saveToOPFS(dbFileName, data);
      setStatus(
        `Saved to OPFS · "${dbFileName}" · ${formatBytes(data.length)}`
      );
      listOPFSFiles().then(setOpfsFiles);
    } catch (e: any) {
      setStatus('OPFS save error: ' + e.message);
    }
  };

  // ── Load from OPFS ──
  const handleLoadOpfs = async (filename: string) => {
    const buf = await loadFromOPFS(filename);
    if (buf) openDb(buf, filename);
  };

  // ── Export .db ──
  const handleExport = () => {
    if (!dbInstance) return;
    const data = dbInstance.export();
    const blob = new Blob([data.buffer as ArrayBuffer], {
      type: 'application/octet-stream',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = dbFileName ?? 'export.db';
    a.click();
    URL.revokeObjectURL(url);
    setStatus(`Exported "${dbFileName}" · ${formatBytes(data.length)}`);
  };

  // ── Sort ──
  const handleSort = (colIdx: number) => {
    if (sortCol === colIdx) setSortDir((d) => (d === 1 ? -1 : 1));
    else {
      setSortCol(colIdx);
      setSortDir(1);
    }
  };

  // ── Pagination ──
  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const pageRows = filteredRows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div
      data-theme="luxury"
      className="bg-base-100 flex h-screen flex-col overflow-hidden font-sans"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}>
      {/* ── Export Modal ── */}
      {showExport && activeTable && (
        <ExportModal
          tableName={activeTable}
          columns={queryResult.columns}
          rows={filteredRows}
          onClose={() => setShowExport(false)}
        />
      )}

      {/* ── Drag overlay ── */}
      {isDragging && (
        <div className="bg-base-100/80 pointer-events-none fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm">
          <div className="border-primary rounded-2xl border-2 border-dashed p-16 text-center">
            <p className="text-primary text-xl font-semibold tracking-widest uppercase">
              Drop .db file
            </p>
          </div>
        </div>
      )}

      {/* ── Topbar ── */}
      <header className="navbar bg-base-200 border-base-300 min-h-[52px] flex-shrink-0 gap-3 border-b px-4">
        <div className="navbar-start gap-3">
          <span className="text-base-content text-base font-bold tracking-tight">
            Sheets
          </span>
          <div className="divider divider-horizontal mx-0 h-5 self-center" />
          <button
            className="btn btn-primary btn-sm gap-2"
            onClick={() => fileInputRef.current?.click()}>
            <FiUpload className="h-3.5 w-3.5" />
            Open .db
          </button>
          <button
            className="btn btn-ghost btn-sm gap-2"
            onClick={createNewDb}
            disabled={loading}>
            <FiPlus className="h-3.5 w-3.5" />
            New DB
          </button>
        </div>

        <div className="navbar-center">
          {dbFileName && (
            <div className="badge badge-outline badge-primary gap-2 px-3 py-3 font-mono text-xs">
              <span className="bg-success inline-block h-2 w-2 animate-pulse rounded-full" />
              {dbFileName}
            </div>
          )}
        </div>

        <div className="navbar-end gap-2">
          {opfsFiles.length > 0 && (
            <div className="dropdown dropdown-end">
              <label tabIndex={0} className="btn btn-ghost btn-sm gap-2">
                <FiDatabase className="h-3.5 w-3.5" />
                OPFS ({opfsFiles.length})
              </label>
              <ul
                tabIndex={0}
                className="dropdown-content menu bg-base-200 border-base-300 z-50 mt-2 w-52 rounded-xl border p-2 shadow-xl">
                {opfsFiles.map((f) => (
                  <li key={f}>
                    <a
                      className="font-mono text-xs"
                      onClick={() => handleLoadOpfs(f)}>
                      <FiDatabase className="h-3.5 w-3.5" />
                      {f}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <button
            className="btn btn-ghost btn-sm gap-2"
            onClick={handleSave}
            disabled={!dbInstance}>
            <FiSave className="h-3.5 w-3.5" />
            Save to OPFS
          </button>
          <button
            className="btn btn-ghost btn-sm gap-2"
            onClick={handleExport}
            disabled={!dbInstance}>
            <FiDownload className="h-3.5 w-3.5" />
            Export .db
          </button>
        </div>
      </header>

      {/* ── Body ── */}
      <div className="flex flex-1 overflow-hidden">
        {/* ── Sidebar ── */}
        <aside className="bg-base-200 border-base-300 flex w-56 flex-shrink-0 flex-col overflow-hidden border-r">
          <div className="px-3 pt-3 pb-1">
            <p className="text-base-content/30 text-[10px] font-semibold tracking-widest uppercase">
              Tables
            </p>
          </div>
          <div className="flex-1 space-y-0.5 overflow-y-auto px-2 pb-2">
            {tables.length === 0 && (
              <p className="text-base-content/30 px-2 py-3 text-xs italic">
                No tables
              </p>
            )}
            {tables.map((t) => (
              <button
                key={t.name}
                onClick={() => selectTable(t.name)}
                className={`group flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left transition-all ${
                  activeTable === t.name
                    ? 'bg-primary/10 text-primary border-primary/20 border'
                    : 'text-base-content/60 hover:text-base-content hover:bg-base-300 border border-transparent'
                }`}>
                <TableIcon
                  className={`h-3.5 w-3.5 flex-shrink-0 ${activeTable === t.name ? 'text-primary' : 'text-base-content/30'}`}
                />
                <span className="flex-1 truncate text-xs font-medium">
                  {t.name}
                </span>
                <span className="text-base-content/30 font-mono text-[10px] tabular-nums">
                  {formatNumber(t.rowCount)}
                </span>
              </button>
            ))}
          </div>

          {opfsFiles.length > 0 && (
            <>
              <div className="border-base-300 border-t px-3 pt-3 pb-1">
                <p className="text-base-content/30 text-[10px] font-semibold tracking-widest uppercase">
                  Saved (OPFS)
                </p>
              </div>
              <div className="space-y-0.5 px-2 pb-2">
                {opfsFiles.map((f) => (
                  <button
                    key={f}
                    onClick={() => handleLoadOpfs(f)}
                    className="text-base-content/50 hover:text-base-content hover:bg-base-300 flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left transition-all">
                    <FiDatabase className="text-base-content/30 h-3.5 w-3.5 flex-shrink-0" />
                    <span className="truncate font-mono text-xs">{f}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </aside>

        {/* ── Main content ── */}
        <main className="bg-base-100 flex flex-1 flex-col overflow-hidden">
          {!dbInstance && (
            <div className="flex flex-1 flex-col items-center justify-center gap-6 p-8 text-center">
              {loading ? (
                <div className="flex flex-col items-center gap-4">
                  <span className="loading loading-ring loading-lg text-primary" />
                  <p className="text-base-content/50 font-mono text-sm">
                    {loadingMsg}
                  </p>
                </div>
              ) : (
                <>
                  <div className="text-base-content/10">
                    <DatabaseLargeIcon />
                  </div>
                  <div>
                    <h1 className="text-base-content/80 mb-2 text-2xl font-bold tracking-tight">
                      Sheets
                    </h1>
                    <p className="text-base-content/40 max-w-xs text-sm leading-relaxed">
                      Open a{' '}
                      <code className="text-primary bg-primary/10 rounded px-1 text-xs">
                        .db
                      </code>{' '}
                      file or drop it anywhere to browse your SQLite database.
                      Persisted via <span className="text-primary">OPFS</span> —
                      no server needed.
                    </p>
                  </div>
                  <div className="flex gap-3">
                    <button
                      className="btn btn-primary btn-sm gap-2"
                      onClick={() => fileInputRef.current?.click()}>
                      <FiUpload className="h-3.5 w-3.5" />
                      Open file
                    </button>
                    <button
                      className="btn btn-ghost btn-sm gap-2"
                      onClick={createNewDb}>
                      <FiPlus className="h-3.5 w-3.5" />
                      Try demo DB
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {dbInstance && (
            <>
              {/* Table topbar */}
              <div className="border-base-300 bg-base-200/50 flex flex-shrink-0 items-center gap-3 border-b px-4 py-2.5">
                {activeTable ? (
                  <>
                    <span className="text-base-content font-mono text-sm font-semibold">
                      {activeTable}
                    </span>
                    <div className="badge badge-ghost badge-sm text-base-content/40 font-mono">
                      {formatNumber(filteredRows.length)}
                      {search &&
                        ` / ${formatNumber(queryResult.rows.length)}`}{' '}
                      rows
                    </div>
                  </>
                ) : (
                  <span className="text-base-content/40 text-sm italic">
                    Select a table
                  </span>
                )}
                <div className="ml-auto flex items-center gap-2">
                  {loading && (
                    <span className="loading loading-spinner loading-xs text-primary" />
                  )}
                  {/* Export table button */}
                  {activeTable && queryResult.columns.length > 0 && (
                    <button
                      className="btn btn-ghost btn-sm gap-2"
                      onClick={() => setShowExport(true)}>
                      <FiDownload className="h-3.5 w-3.5" />
                      Export table
                    </button>
                  )}
                  <label className="input input-bordered input-sm bg-base-100 flex w-48 items-center gap-2">
                    <FiSearch className="text-base-content/30 h-3.5 w-3.5" />
                    <input
                      type="text"
                      className="grow bg-transparent font-mono text-xs"
                      placeholder="Filter rows…"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                    {search && (
                      <button
                        onClick={() => setSearch('')}
                        className="text-base-content/30 hover:text-base-content">
                        ×
                      </button>
                    )}
                  </label>
                </div>
              </div>

              {/* Table */}
              {activeTable && queryResult.columns.length > 0 ? (
                <div className="flex-1 overflow-auto">
                  <table className="table-xs table-pin-rows table w-full">
                    <thead>
                      <tr className="bg-base-200">
                        <th className="text-base-content/20 w-10 text-center font-mono font-normal">
                          #
                        </th>
                        {queryResult.columns.map((col, i) => (
                          <th
                            key={col}
                            className="hover:text-primary group cursor-pointer whitespace-nowrap transition-colors select-none"
                            onClick={() => handleSort(i)}>
                            <span className="flex items-center gap-1">
                              {col}
                              <SortIcon
                                active={sortCol === i}
                                dir={sortCol === i ? sortDir : 0}
                              />
                            </span>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {pageRows.map((row, ri) => (
                        <tr
                          key={ri}
                          className="hover:bg-base-200/40 border-base-300/40 border-b">
                          <td className="text-base-content/20 text-center font-mono text-[10px] tabular-nums">
                            {page * PAGE_SIZE + ri + 1}
                          </td>
                          {row.map((cell, ci) => (
                            <td key={ci} className="max-w-[200px] truncate">
                              <CellValue value={cell} />
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : activeTable ? (
                <div className="text-base-content/30 flex flex-1 items-center justify-center text-sm italic">
                  No data in this table
                </div>
              ) : (
                <div className="text-base-content/30 flex flex-1 items-center justify-center text-sm italic">
                  Select a table from the sidebar
                </div>
              )}

              {/* Pagination */}
              {activeTable && filteredRows.length > PAGE_SIZE && (
                <div className="border-base-300 bg-base-200/30 flex flex-shrink-0 items-center gap-3 border-t px-4 py-2">
                  <button
                    className="btn btn-ghost btn-xs"
                    disabled={page === 0}
                    onClick={() => setPage((p) => Math.max(0, p - 1))}>
                    ← prev
                  </button>
                  <span className="text-base-content/40 font-mono text-xs tabular-nums">
                    page {page + 1} / {totalPages}
                  </span>
                  <button
                    className="btn btn-ghost btn-xs"
                    disabled={page >= totalPages - 1}
                    onClick={() =>
                      setPage((p) => Math.min(totalPages - 1, p + 1))
                    }>
                    next →
                  </button>
                  <span className="text-base-content/30 ml-auto font-mono text-xs">
                    {formatNumber(filteredRows.length)} total
                  </span>
                </div>
              )}
            </>
          )}
        </main>
      </div>

      {/* ── Statusbar ── */}
      <footer className="bg-base-200 border-base-300 flex flex-shrink-0 items-center gap-3 border-t px-4 py-1.5">
        {dbInstance && (
          <span className="bg-success inline-block h-2 w-2 flex-shrink-0 animate-pulse rounded-full" />
        )}
        <span className="text-base-content/40 truncate font-mono text-[11px]">
          {status}
        </span>
        <span className="text-base-content/20 ml-auto font-mono text-[11px]">
          SQLite WASM · OPFS
        </span>
      </footer>

      <input
        ref={fileInputRef}
        type="file"
        accept=".db,.sqlite,.sqlite3"
        className="hidden"
        onChange={handleFileChange}
      />
    </div>
  );
};

export default AppPage;
