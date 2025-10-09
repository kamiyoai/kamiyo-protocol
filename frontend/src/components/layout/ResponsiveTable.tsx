/**
 * ResponsiveTable Component
 * Adapts table layout for different screen sizes
 */

import React from 'react';

interface Column<T> {
  key: keyof T | string;
  label: string;
  render?: (value: any, row: T) => React.ReactNode;
  sortable?: boolean;
}

interface ResponsiveTableProps<T> {
  data: T[];
  columns: Column<T>[];
  onSort?: (key: string) => void;
  sortKey?: string;
  sortOrder?: 'asc' | 'desc';
}

export function ResponsiveTable<T extends Record<string, any>>({
  data,
  columns,
  onSort,
  sortKey,
  sortOrder,
}: ResponsiveTableProps<T>) {
  const getValue = (row: T, key: keyof T | string): any => {
    if (typeof key === 'string' && key.includes('.')) {
      // Handle nested keys like 'user.name'
      return key.split('.').reduce((obj, k) => obj?.[k], row);
    }
    return row[key];
  };

  return (
    <div className="responsive-table">
      <table>
        <thead className="hide-mobile">
          <tr>
            {columns.map((column) => (
              <th key={String(column.key)}>
                {column.sortable && onSort ? (
                  <button
                    onClick={() => onSort(String(column.key))}
                    className="sort-btn"
                  >
                    {column.label}
                    {sortKey === column.key && (
                      <span>{sortOrder === 'asc' ? ' ↑' : ' ↓'}</span>
                    )}
                  </button>
                ) : (
                  column.label
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {columns.map((column) => {
                const value = getValue(row, column.key);
                const renderedValue = column.render
                  ? column.render(value, row)
                  : value;

                return (
                  <td key={String(column.key)} data-label={column.label}>
                    {renderedValue}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>

      {data.length === 0 && (
        <div className="table-empty">
          <p>No data available</p>
        </div>
      )}
    </div>
  );
}

export default ResponsiveTable;
