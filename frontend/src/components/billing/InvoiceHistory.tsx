/**
 * Invoice History Component
 * Displays paginated table of past invoices with download links
 */

import React, { useState } from 'react';
import { useInvoices } from '../../hooks/useBilling';
import '../../styles/billing.css';

interface InvoiceHistoryProps {
  limit?: number;
}

const InvoiceHistory: React.FC<InvoiceHistoryProps> = ({ limit = 10 }) => {
  const { invoices, hasMore, loading, error, loadMore } = useInvoices(limit);
  const [sortField, setSortField] = useState<'date' | 'amount'>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [filterStatus, setFilterStatus] = useState<string>('all');

  // Format currency
  const formatCurrency = (cents: number, currency: string = 'usd') => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency.toUpperCase(),
    }).format(cents / 100);
  };

  // Format date
  const formatDate = (timestamp: number) => {
    return new Date(timestamp * 1000).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  // Get status badge class
  const getStatusClass = (status: string) => {
    switch (status) {
      case 'paid':
        return 'status-badge-paid';
      case 'open':
        return 'status-badge-open';
      case 'draft':
        return 'status-badge-draft';
      case 'void':
        return 'status-badge-void';
      case 'uncollectible':
        return 'status-badge-uncollectible';
      default:
        return 'status-badge-default';
    }
  };

  // Filter and sort invoices
  const filteredInvoices = invoices
    .filter((invoice) => filterStatus === 'all' || invoice.status === filterStatus)
    .sort((a, b) => {
      let comparison = 0;

      if (sortField === 'date') {
        comparison = a.created - b.created;
      } else if (sortField === 'amount') {
        comparison = a.amount_due - b.amount_due;
      }

      return sortOrder === 'asc' ? comparison : -comparison;
    });

  // Handle sort
  const handleSort = (field: 'date' | 'amount') => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
  };

  if (loading && invoices.length === 0) {
    return (
      <div className="invoice-history">
        <div className="loading-skeleton">
          <div className="skeleton-table"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="invoice-history">
        <div className="error-state">
          <h3>Failed to load invoices</h3>
          <p>{error.message}</p>
        </div>
      </div>
    );
  }

  if (invoices.length === 0) {
    return (
      <div className="invoice-history">
        <div className="empty-state">
          <h3>No Invoices Yet</h3>
          <p>Your invoice history will appear here once you have a paid subscription.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="invoice-history">
      <div className="invoice-header">
        <h2>Invoice History</h2>
        <div className="invoice-filters">
          <select
            className="filter-select"
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            aria-label="Filter invoices by status"
          >
            <option value="all">All Statuses</option>
            <option value="paid">Paid</option>
            <option value="open">Open</option>
            <option value="draft">Draft</option>
            <option value="void">Void</option>
          </select>
        </div>
      </div>

      <div className="invoice-table-wrapper">
        <table className="invoice-table">
          <thead>
            <tr>
              <th>Invoice Number</th>
              <th
                className={`sortable ${sortField === 'date' ? 'sorted' : ''}`}
                onClick={() => handleSort('date')}
                aria-label="Sort by date"
              >
                Date
                {sortField === 'date' && (
                  <span className="sort-arrow">{sortOrder === 'asc' ? '↑' : '↓'}</span>
                )}
              </th>
              <th
                className={`sortable ${sortField === 'amount' ? 'sorted' : ''}`}
                onClick={() => handleSort('amount')}
                aria-label="Sort by amount"
              >
                Amount
                {sortField === 'amount' && (
                  <span className="sort-arrow">{sortOrder === 'asc' ? '↑' : '↓'}</span>
                )}
              </th>
              <th>Status</th>
              <th>Billing Period</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredInvoices.map((invoice) => (
              <tr key={invoice.id}>
                <td>
                  <code>{invoice.number || invoice.id.substring(0, 12)}</code>
                </td>
                <td>{formatDate(invoice.created)}</td>
                <td className="amount-cell">
                  {formatCurrency(invoice.amount_due, invoice.currency)}
                </td>
                <td>
                  <span className={`status-badge ${getStatusClass(invoice.status)}`}>
                    {invoice.status}
                  </span>
                </td>
                <td className="period-cell">
                  {formatDate(invoice.period_start)} - {formatDate(invoice.period_end)}
                </td>
                <td className="actions-cell">
                  {invoice.hosted_invoice_url && (
                    <a
                      href={invoice.hosted_invoice_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn-link"
                      aria-label="View invoice"
                    >
                      View
                    </a>
                  )}
                  {invoice.invoice_pdf && (
                    <a
                      href={invoice.invoice_pdf}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn-link"
                      aria-label="Download PDF"
                    >
                      PDF
                    </a>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {hasMore && (
        <div className="invoice-pagination">
          <button
            className="btn btn-secondary"
            onClick={loadMore}
            disabled={loading}
            aria-label="Load more invoices"
          >
            {loading ? 'Loading...' : 'Load More'}
          </button>
        </div>
      )}

      <div className="invoice-footer">
        <p className="invoice-count">
          Showing {filteredInvoices.length} of {invoices.length} invoices
        </p>
      </div>
    </div>
  );
};

export default InvoiceHistory;
