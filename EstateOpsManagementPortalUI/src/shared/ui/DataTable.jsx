import { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { flexRender, getCoreRowModel, useReactTable } from '@tanstack/react-table';
import { ChevronDown, ChevronUp, ChevronsUpDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import Card from './Card.jsx';

const ALIGN = { end: 'text-end' };

/**
 * Shared table: server-side sorting (manual), column chooser, optional row selection, real
 * <th scope> headers with sort buttons and aria-sort, so it is keyboard and screen-reader operable.
 * Column defs: `header` (string, also the chooser label), `meta: { sortField, align }`.
 */
export default function DataTable({
  columns,
  data,
  getRowId,
  label,
  sort,
  onSortChange,
  selectable = false,
  onSelectionChange,
  toolbarStart,
  rowClassName,
  initialColumnVisibility = {},
}) {
  const { t } = useTranslation();
  const [columnVisibility, setColumnVisibility] = useState(initialColumnVisibility);
  const [rowSelection, setRowSelection] = useState({});

  const table = useReactTable({
    data,
    columns,
    getRowId,
    state: { columnVisibility, rowSelection },
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    enableRowSelection: selectable,
    getCoreRowModel: getCoreRowModel(),
  });

  useEffect(() => {
    onSelectionChange?.(Object.keys(rowSelection));
  }, [rowSelection, onSelectionChange]);

  const hideable = table.getAllLeafColumns().filter((c) => c.getCanHide());
  const selected = Object.keys(rowSelection).length;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <p aria-live="polite" className="text-sm text-content-muted">
          {selected > 0 ? t('table.selected', { count: selected }) : toolbarStart}
        </p>
        <details className="relative">
          <summary className="cursor-pointer rounded-xl border border-border bg-surface px-3.5 py-2 text-sm font-medium shadow-sm">
            {t('table.columns')}
          </summary>
          <fieldset className="absolute end-0 z-10 mt-2 w-52 rounded-xl border border-border bg-surface p-3 shadow-token">
            <legend className="sr-only">{t('table.columns')}</legend>
            {hideable.map((column) => (
              <label key={column.id} className="flex items-center gap-2 py-1 text-sm">
                <input
                  type="checkbox"
                  checked={column.getIsVisible()}
                  onChange={column.getToggleVisibilityHandler()}
                />
                {column.columnDef.header}
              </label>
            ))}
          </fieldset>
        </details>
      </div>
      <Card padded={false} className="overflow-hidden">
        <div className="relative overflow-x-auto">
          <table className="w-full border-collapse text-sm" aria-label={label}>
            <thead className="bg-surface-muted text-start text-xs uppercase tracking-wide text-content-muted">
              <tr>
                {selectable && (
                  <th scope="col" className="w-10 p-3">
                    <input
                      type="checkbox"
                      aria-label={t('table.selectAll')}
                      checked={table.getIsAllRowsSelected()}
                      onChange={table.getToggleAllRowsSelectedHandler()}
                    />
                  </th>
                )}
                {table.getVisibleLeafColumns().map((column) => (
                  <HeaderCell
                    key={column.id}
                    column={column}
                    sort={sort}
                    onSortChange={onSortChange}
                  />
                ))}
              </tr>
            </thead>
            <tbody>
              {table.getRowModel().rows.map((row) => (
                <tr
                  key={row.id}
                  aria-selected={selectable ? row.getIsSelected() : undefined}
                  className={`border-t border-border transition hover:bg-primary-soft/40 ${rowClassName?.(row.original) ?? ''}`}
                >
                  {selectable && (
                    <td className="p-3">
                      <input
                        type="checkbox"
                        aria-label={t('table.selectRow')}
                        checked={row.getIsSelected()}
                        onChange={row.getToggleSelectedHandler()}
                      />
                    </td>
                  )}
                  {row.getVisibleCells().map((cell) => (
                    <td
                      key={cell.id}
                      className={`px-2.5 py-3 ${ALIGN[cell.column.columnDef.meta?.align] ?? ''}`}
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function HeaderCell({ column, sort, onSortChange }) {
  const { header, meta } = column.columnDef;
  const field = meta?.sortField;
  const active = field && sort?.field === field;
  const Icon = !active ? ChevronsUpDown : sort.dir === 'asc' ? ChevronUp : ChevronDown;
  const ariaSort = active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined;
  return (
    <th
      scope="col"
      aria-sort={ariaSort}
      className={`whitespace-nowrap px-2.5 py-3 font-semibold ${ALIGN[meta?.align] ?? ''}`}
    >
      {field ? (
        <button
          type="button"
          className="inline-flex items-center gap-1 font-semibold uppercase tracking-wide"
          onClick={() =>
            onSortChange({ field, dir: active && sort.dir === 'asc' ? 'desc' : 'asc' })
          }
        >
          {header}
          <Icon aria-hidden="true" className="size-3.5" />
        </button>
      ) : (
        <span className={meta?.srOnly ? 'sr-only' : ''}>{header}</span>
      )}
    </th>
  );
}

HeaderCell.propTypes = {
  column: PropTypes.shape({ columnDef: PropTypes.object.isRequired }).isRequired,
  sort: PropTypes.shape({ field: PropTypes.string, dir: PropTypes.string }),
  onSortChange: PropTypes.func,
};

DataTable.propTypes = {
  columns: PropTypes.arrayOf(PropTypes.object).isRequired,
  data: PropTypes.arrayOf(PropTypes.object).isRequired,
  getRowId: PropTypes.func.isRequired,
  label: PropTypes.string.isRequired,
  sort: PropTypes.shape({ field: PropTypes.string, dir: PropTypes.string }),
  onSortChange: PropTypes.func,
  selectable: PropTypes.bool,
  onSelectionChange: PropTypes.func,
  toolbarStart: PropTypes.node,
  rowClassName: PropTypes.func,
  initialColumnVisibility: PropTypes.object,
};
