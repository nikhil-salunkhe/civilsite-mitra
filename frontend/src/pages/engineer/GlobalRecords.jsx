import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../context/AuthContext';
import { toast } from 'react-toastify';
import { PageHeader, SearchInput, Pagination } from '../../components/UI';
import { downloadFile } from '../../utils/download';

const money = (n) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n || 0);
const dateFmt = (d) => (d ? new Date(d).toLocaleDateString('en-IN') : '-');
const kb = (n) => (n ? `${Math.max(1, Math.round(n / 1024))} KB` : '-');

/** Column/page config for every global sidebar module (spec section 38). */
const MODULES = {
  workers: {
    title: 'Workers', subtitle: 'Workers across all of your sites',
    searchPh: 'Search name, mobile or type...',
    columns: [
      { key: 'name', label: 'Worker' },
      { key: 'mobile', label: 'Mobile', render: (v) => v || '-' },
      { key: 'workerType', label: 'Type' },
      { key: 'dailyWage', label: 'Daily Wage', align: 'right', render: (v) => money(v) },
    ],
  },
  materials: {
    title: 'Materials', subtitle: 'Material purchases across all sites',
    searchPh: 'Search material, category or invoice...',
    columns: [
      { key: 'name', label: 'Material' },
      { key: 'category', label: 'Category' },
      { key: 'quantity', label: 'Quantity', render: (v, row) => `${v} ${row.unit || ''}` },
      { key: 'totalAmount', label: 'Total', align: 'right', render: (v) => money(v) },
      { key: 'paidAmount', label: 'Paid', align: 'right', render: (v) => money(v) },
    ],
  },
  vendors: {
    title: 'Vendors', subtitle: 'Vendors across all of your sites',
    searchPh: 'Search vendor, mobile or category...',
    columns: [
      { key: 'name', label: 'Vendor' },
      { key: 'mobile', label: 'Mobile', render: (v) => v || '-' },
      { key: 'materialCategory', label: 'Category', render: (v) => v || '-' },
      { key: 'email', label: 'Email', render: (v) => v || '-' },
    ],
  },
  expenses: {
    title: 'Expenses', subtitle: 'Site expenses across all projects',
    searchPh: 'Search category or description...',
    columns: [
      { key: 'expenseDate', label: 'Date', render: dateFmt },
      { key: 'category', label: 'Category' },
      { key: 'description', label: 'Description', render: (v) => v || '-' },
      { key: 'amount', label: 'Amount', align: 'right', render: (v) => money(v) },
      { key: 'paymentStatus', label: 'Status', render: (v) => v || '-' },
    ],
  },
  activities: {
    title: 'Activities', subtitle: 'Daily site activity log across projects',
    searchPh: 'Search work description...',
    columns: [
      { key: 'date', label: 'Date', render: dateFmt },
      { key: 'workDescription', label: 'Work' },
      { key: 'workersPresent', label: 'Workers', align: 'right', render: (v) => v || 0 },
      { key: 'todayExpense', label: "Day's Expense", align: 'right', render: (v) => money(v) },
    ],
  },
  documents: {
    title: 'Documents', subtitle: 'Bills, invoices, agreements and site photos',
    searchPh: 'Search file name or type...',
    download: true,
    columns: [
      { key: 'originalName', label: 'File' },
      { key: 'fileType', label: 'Type' },
      { key: 'size', label: 'Size', align: 'right', render: kb },
      { key: 'uploadedDate', label: 'Uploaded', render: dateFmt },
    ],
  },
};

/**
 * One generic cross-site list page for the six engineer sidebar modules.
 * Backend: GET /api/engineer/:module (engineer-scoped, paginated).
 * Creating/editing records happens inside each site's dashboard tabs.
 */
export const GlobalRecords = ({ module: moduleName }) => {
  const cfg = MODULES[moduleName];
  const [items, setItems] = useState([]);
  const [siteNames, setSiteNames] = useState({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [siteFilter, setSiteFilter] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({});
  const [busy, setBusy] = useState('');

  useEffect(() => {
    if (!cfg) return;
    setLoading(true);
    api.get(`/engineer/${moduleName}`, {
      params: { page, limit: 10, search: search || undefined, siteId: siteFilter || undefined },
    })
      .then(({ data: r }) => {
        setItems(r.data.items || []);
        setSiteNames(r.data.siteNames || {});
        setPagination(r.data.pagination || {});
      })
      .catch((err) => toast.error(err.response?.data?.message || 'Failed to load'))
      .finally(() => setLoading(false));
  }, [moduleName, page, search, siteFilter]);

  if (!cfg) return <div className="card p-8 text-center text-gray-500">Unknown module.</div>;

  const downloadRow = async (row) => {
    setBusy(row._id);
    try {
      await downloadFile(`/sites/${row.site}/documents/${row._id}/download`, row.originalName || 'document');
      toast.success('Downloaded');
    } catch {
      toast.error('Download failed');
    } finally {
      setBusy('');
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader title={cfg.title} subtitle={cfg.subtitle} />

      <div className="flex flex-col sm:flex-row gap-4">
        <SearchInput
          value={search}
          onChange={(v) => { setPage(1); setSearch(v); }}
          placeholder={cfg.searchPh}
          className="flex-1"
        />
        <select
          value={siteFilter}
          onChange={(e) => { setPage(1); setSiteFilter(e.target.value); }}
          className="select w-full sm:w-64"
        >
          <option value="">All Sites</option>
          {Object.entries(siteNames).map(([id, name]) => (
            <option key={id} value={id}>{name}</option>
          ))}
        </select>
      </div>

      <div className="card">
        {loading ? (
          <div className="flex justify-center py-12"><div className="spinner w-8 h-8"></div></div>
        ) : items.length === 0 ? (
          <div className="text-center py-10 text-gray-500">
            No {cfg.title.toLowerCase()} found{siteFilter || search ? ' for this filter' : ''}.
          </div>
        ) : (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  {cfg.columns.map((c) => (
                    <th key={c.key} className={c.align === 'right' ? 'text-right' : ''}>{c.label}</th>
                  ))}
                  <th>Site</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((row) => (
                  <tr key={row._id} className="hover:bg-gray-50">
                    {cfg.columns.map((c) => (
                      <td key={c.key} className={c.align === 'right' ? 'text-right font-medium' : ''}>
                        {c.render ? c.render(row[c.key], row) : (row[c.key] ?? '-')}
                      </td>
                    ))}
                    <td className="text-gray-600">{siteNames[row.site] || '-'}</td>
                    <td className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        {cfg.download && (
                          <button
                            className="btn btn-secondary btn-sm"
                            disabled={busy === row._id}
                            onClick={() => downloadRow(row)}
                          >
                            {busy === row._id ? '...' : 'Download'}
                          </button>
                        )}
                        <Link to={`/sites/${row.site}`} className="btn btn-secondary btn-sm">Open Site</Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {pagination.totalPages > 1 && (
          <Pagination currentPage={pagination.currentPage} totalPages={pagination.totalPages} onPageChange={setPage} />
        )}
      </div>
    </div>
  );
};