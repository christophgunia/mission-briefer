import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

export interface Axis {
  id: string;
  label: ReactNode;
}

export interface CellView {
  content: ReactNode;
  muted?: boolean;
  bg?: string;
  title?: string;
}

export type CellKey = `${string}|${string}`;
export const cellKey = (r: string, c: string): CellKey => `${r}|${c}`;
export const splitKey = (k: string) => k.split('|') as [string, string];

interface Props {
  rows: Axis[];
  cols: Axis[];
  cell: (rowId: string, colId: string) => CellView;
  selection: Set<string>;
  onSelectionChange: (s: Set<string>) => void;
  /** Del/Backspace on selection. */
  onClear?: (cells: string[]) => void;
  /** Ctrl+V: pasted TSV block, anchored at top-left selected cell. */
  onPaste?: (anchor: { row: number; col: number }, values: string[][]) => void;
  /** Double click on a cell. */
  onOpen?: (rowId: string, colId: string) => void;
  corner?: ReactNode;
}

/**
 * Spreadsheet-like selection grid: drag rectangles, Ctrl/Cmd to add, Shift to extend,
 * click row/column headers to select whole rows/columns, Delete and paste from Excel.
 */
export function Matrix({ rows, cols, cell, selection, onSelectionChange, onClear, onPaste, onOpen, corner }: Props) {
  const [drag, setDrag] = useState<{ r: number; c: number; base: Set<string> } | null>(null);
  const anchor = useRef<{ r: number; c: number } | null>(null);
  const wrap = useRef<HTMLDivElement>(null);

  const rect = useCallback(
    (r1: number, c1: number, r2: number, c2: number, base: Set<string>) => {
      const s = new Set(base);
      for (let r = Math.min(r1, r2); r <= Math.max(r1, r2); r++)
        for (let c = Math.min(c1, c2); c <= Math.max(c1, c2); c++) s.add(cellKey(rows[r]!.id, cols[c]!.id));
      return s;
    },
    [rows, cols],
  );

  useEffect(() => {
    const up = () => setDrag(null);
    window.addEventListener('mouseup', up);
    return () => window.removeEventListener('mouseup', up);
  }, []);

  const down = (r: number, c: number, e: React.MouseEvent) => {
    wrap.current?.focus();
    const additive = e.ctrlKey || e.metaKey;
    if (e.shiftKey && anchor.current) {
      onSelectionChange(rect(anchor.current.r, anchor.current.c, r, c, additive ? selection : new Set()));
      return;
    }
    const base = additive ? new Set(selection) : new Set<string>();
    anchor.current = { r, c };
    setDrag({ r, c, base });
    onSelectionChange(rect(r, c, r, c, base));
  };
  const enter = (r: number, c: number) => {
    if (drag) onSelectionChange(rect(drag.r, drag.c, r, c, drag.base));
  };
  const selectRow = (r: number, e: React.MouseEvent) =>
    onSelectionChange(rect(r, 0, r, cols.length - 1, e.ctrlKey || e.metaKey ? selection : new Set()));
  const selectCol = (c: number, e: React.MouseEvent) =>
    onSelectionChange(rect(0, c, rows.length - 1, c, e.ctrlKey || e.metaKey ? selection : new Set()));

  const keyDown = (e: React.KeyboardEvent) => {
    if ((e.key === 'Delete' || e.key === 'Backspace') && selection.size && onClear) {
      e.preventDefault();
      onClear([...selection]);
    }
    if (e.key === 'Escape') onSelectionChange(new Set());
    if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
      e.preventDefault();
      onSelectionChange(rect(0, 0, rows.length - 1, cols.length - 1, new Set()));
    }
  };

  const paste = (e: React.ClipboardEvent) => {
    if (!onPaste || !selection.size) return;
    e.preventDefault();
    const text = e.clipboardData.getData('text/plain').replace(/\r/g, '').replace(/\n$/, '');
    const values = text.split('\n').map((line) => line.split('\t'));
    const rowIdx = new Map(rows.map((r, i) => [r.id, i]));
    const colIdx = new Map(cols.map((c, i) => [c.id, i]));
    let row = Infinity;
    let col = Infinity;
    for (const k of selection) {
      const [r, c] = splitKey(k);
      row = Math.min(row, rowIdx.get(r) ?? Infinity);
      col = Math.min(col, colIdx.get(c) ?? Infinity);
    }
    // A single value pasted into a multi-cell selection fills the whole selection.
    if (values.length === 1 && values[0]!.length === 1 && selection.size > 1) {
      const block: string[][] = [];
      for (const k of selection) {
        const [r, c] = splitKey(k);
        const ri = rowIdx.get(r)! - row;
        const ci = colIdx.get(c)! - col;
        (block[ri] ??= [])[ci] = values[0]![0]!;
      }
      onPaste({ row, col }, block);
    } else onPaste({ row, col }, values);
  };

  return (
    <div className="matrix-wrap" tabIndex={0} ref={wrap} onKeyDown={keyDown} onPaste={paste} style={{ outline: 'none' }}>
      <table className="matrix">
        <thead>
          <tr>
            <th
              style={{ left: 0, zIndex: 3, minWidth: 180 }}
              onClick={() => onSelectionChange(rect(0, 0, rows.length - 1, cols.length - 1, new Set()))}
            >
              {corner}
            </th>
            {cols.map((c, ci) => (
              <th key={c.id} onClick={(e) => selectCol(ci, e)}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, ri) => (
            <tr key={r.id}>
              <th onClick={(e) => selectRow(ri, e)}>{r.label}</th>
              {cols.map((c, ci) => {
                const v = cell(r.id, c.id);
                const sel = selection.has(cellKey(r.id, c.id));
                return (
                  <td
                    key={c.id}
                    className={`${sel ? 'sel' : ''} ${v.muted ? 'muted' : ''}`}
                    style={v.bg ? { background: v.bg } : undefined}
                    title={v.title}
                    onMouseDown={(e) => down(ri, ci, e)}
                    onMouseEnter={() => enter(ri, ci)}
                    onDoubleClick={() => onOpen?.(r.id, c.id)}
                  >
                    {v.content}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
