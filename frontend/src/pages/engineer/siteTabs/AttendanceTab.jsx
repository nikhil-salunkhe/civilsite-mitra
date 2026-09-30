import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../../../context/AuthContext';
import { toast } from 'react-toastify';
import { money, dateFmt, Modal, Field, FieldInput, TabToolbar, num } from './shared';

const STATUSES = ['Present', 'Half Day', 'Absent', 'Leave'];

const STATUS_CLS = {
  Present: 'badge badge-success',
  'Half Day': 'badge badge-warning',
  Absent: 'badge badge-danger',
  Leave: 'badge badge-secondary',
};

const today = () => new Date().toISOString().slice(0, 10);

/**
 * Attendance tab.
 *
 * Earnings come from the backend (`earnedAmount` is computed server-side from the
 * worker's daily wage: Present = 1x, Half Day = 0.5x, Absent/Leave = 0). This tab
 * never recomputes wages so the register, the summary and the financial service can
 * never disagree with each other.
 */
export default function AttendanceTab({ siteId, onChanged }) {
  const [rows, setRows] = useState([]);
  const [workers, setWorkers] = useState([]);
  const [totals, setTotals] = useState(null);
  const [loading, setLoading] = useState(true);

  const [filters, setFilters] = useState({ from: '', to: '', workerId: '', status: '' });
  const [page, setPage] = useState(1);
  const [pageInfo, setPageInfo] = useState(null);
  const PAGE_SIZE = 50;
  const [single, setSingle] = useState(null); // single-entry modal form
  const [bulk, setBulk] = useState(null); // bulk entry list
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    if (!siteId) return;
    setLoading(true);

    const params = {};
    if (filters.from) params.from = filters.from;
    if (filters.to) params.to = filters.to;
    if (filters.workerId) params.workerId = filters.workerId;
    if (filters.status) params.status = filters.status;
    params.page = page;
    params.limit = PAGE_SIZE;

    Promise.all([
      api.get(`/sites/${siteId}/attendance`, { params }),
      api.get(`/sites/${siteId}/attendance/summary`, {
        params: {
          from: filters.from || undefined,
          to: filters.to || undefined,
          workerId: filters.workerId || undefined,
        },
      }),
    ])
      .then(([listRes, sumRes]) => {
        setRows(listRes.data?.data?.attendance || []);
        setPageInfo(listRes.data?.data?.pagination || null);
        const data = sumRes.data?.data || {};
        setTotals(data.totals || null);
      })
      .catch((err) => toast.error(err.response?.data?.message || 'Failed to load attendance'))
      .finally(() => setLoading(false));
  }, [siteId, filters.from, filters.to, filters.workerId, filters.status, page]);

  useEffect(() => {
    load();
  }, [load]);

  // Workers are needed by both the bulk marking modal and the dropdowns.
  useEffect(() => {
    if (!siteId) return;
    api
      .get(`/sites/${siteId}/workers`)
      .then(({ data }) => {
        const d = data?.data;
        setWorkers(Array.isArray(d) ? d : d?.workers || []);
      })
      .catch(() => {});
  }, [siteId]);

  // Any filter change invalidates the current page number.
  const setFilter = (k) => (v) => {
    setPage(1);
    setFilters((f) => ({ ...f, [k]: v }));
  };

  const clearFilters = () => {
    setPage(1);
    setFilters({ from: '', to: '', workerId: '', status: '' });
  };

  const workerName = (r) => r.worker?.name || (workers.find((w) => w._id === r.worker)?.name ?? '—');

  const summaryCards = [
    { label: 'Present Days', value: num(totals?.presentDays), cls: 'text-success-600' },
    { label: 'Half Days', value: num(totals?.halfDays), cls: 'text-warning-600' },
    { label: 'Absent', value: num(totals?.absentDays), cls: 'text-danger-600' },
    { label: 'Leave', value: num(totals?.leaveDays), cls: 'text-gray-600' },
    { label: 'Workers Marked', value: num(totals?.workerCount) },
    { label: 'Total Earned', value: money(totals?.totalEarned), cls: 'text-primary-700' },
  ];

  const submitSingle = async (e) => {
    e.preventDefault();
    if (!single.worker) return toast.error('Please select a worker');
    setSaving(true);
    try {
      const body = {
        worker: single.worker,
        date: single.date,
        status: single.status,
        workHours: single.workHours === '' ? undefined : Number(single.workHours),
        notes: single.notes || '',
      };
      if (single._id) await api.put(`/sites/${siteId}/attendance/${single._id}`, body);
      else await api.post(`/sites/${siteId}/attendance`, body);
      toast.success(single._id ? 'Attendance updated' : 'Attendance marked successfully');
      setSingle(null);
      load();
      if (onChanged) onChanged();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save attendance');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (row) => {
    if (!window.confirm('Delete this attendance record?')) return;
    try {
      await api.delete(`/sites/${siteId}/attendance/${row._id}`);
      toast.success('Attendance record deleted');
      load();
      if (onChanged) onChanged();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Delete failed');
    }
  };

  const openSingle = (row) =>
    setSingle(
      row
        ? {
            _id: row._id,
            worker: row.worker?._id || row.worker,
            date: String(row.date || '').slice(0, 10),
            status: row.status || 'Present',
            workHours: row.workHours ?? 8,
            notes: row.notes || '',
          }
        : { worker: '', date: today(), status: 'Present', workHours: 8, notes: '' }
    );

  // ---------------------------------------------------------------------------
  // Bulk daily marking - the real-world entry path: mark the whole crew at once.
  // Inactive workers are excluded from the default list.
  // ---------------------------------------------------------------------------
  const openBulk = () => {
    const active = workers.filter((w) => String(w.status || 'ACTIVE').toUpperCase() !== 'INACTIVE');
    if (active.length === 0) {
      toast.error('No workers available. Add a worker first.');
      return;
    }
    setBulk({
      date: today(),
      entries: active.map((w) => ({
        worker: w._id,
        name: w.name,
        workerType: w.workerType,
        dailyWage: Number(w.dailyWage) || 0,
        status: 'Present',
        workHours: 8,
      })),
    });
  };

  const setBulkEntry = (workerId, patch) =>
    setBulk((b) =>
      b ? { ...b, entries: b.entries.map((e) => (e.worker === workerId ? { ...e, ...patch } : e)) } : b
    );

  const markAll = (status) =>
    setBulk((b) => (b ? { ...b, entries: b.entries.map((e) => ({ ...e, status })) } : b));

  // Live preview only - the backend recomputes and stores earnedAmount itself.
  const bulkPreview = bulk
    ? bulk.entries.reduce((sum, e) => {
        const wage = Number(e.dailyWage) || 0;
        const mult = e.status === 'Present' ? 1 : e.status === 'Half Day' ? 0.5 : 0;
        return sum + wage * mult;
      }, 0)
    : 0;

  const submitBulk = async (e) => {
    e.preventDefault();
    if (!bulk) return;
    setSaving(true);
    try {
      await api.post(`/sites/${siteId}/attendance/bulk`, {
        date: bulk.date,
        entries: bulk.entries.map((x) => ({
          worker: x.worker,
          status: x.status,
          workHours: x.workHours === '' ? undefined : Number(x.workHours),
        })),
      });
      toast.success(`Attendance marked for ${bulk.entries.length} worker(s)`);
      setBulk(null);
      load();
      if (onChanged) onChanged();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save attendance');
    } finally {
      setSaving(false);
    }
  };

  const totalPages = pageInfo?.totalPages || 1;

  return (
    <div className="card">
      <TabToolbar
        title="Worker Attendance"
        onAdd={() => openSingle(null)}
      >
        <button type="button" className="btn btn-secondary btn-sm" onClick={openBulk}>
          Mark Whole Crew
        </button>
        <button type="button" className="btn btn-secondary btn-sm" onClick={load} disabled={loading}>
          Refresh
        </button>
      </TabToolbar>

      {/* Summary - figures come from the backend rollup, never recomputed here. */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-4">
        {summaryCards.map((c) => (
          <div key={c.label} className="border rounded-lg p-3 bg-gray-50">
            <div className="text-xs uppercase tracking-wide text-gray-500">{c.label}</div>
            <div className={`text-lg font-semibold ${c.cls || ''}`}>{c.value}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
        <div>
          <label className="label">From</label>
          <input type="date" className="input" value={filters.from} onChange={(e) => setFilter('from')(e.target.value)} />
        </div>
        <div>
          <label className="label">To</label>
          <input type="date" className="input" value={filters.to} onChange={(e) => setFilter('to')(e.target.value)} />
        </div>
        <div>
          <label className="label">Worker</label>
          <select className="select" value={filters.workerId} onChange={(e) => setFilter('workerId')(e.target.value)}>
            <option value="">All workers</option>
            {workers.map((w) => (
              <option key={w._id} value={w._id}>{w.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Status</label>
          <select className="select" value={filters.status} onChange={(e) => setFilter('status')(e.target.value)}>
            <option value="">All statuses</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
        <div className="flex items-end">
          <button type="button" className="btn btn-secondary w-full" onClick={clearFilters}>Clear Filters</button>
        </div>
      </div>

      <div className="table-container">
        <table className="table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Worker</th>
              <th>Status</th>
              <th className="text-right">Hours</th>
              <th className="text-right">Wage/Day</th>
              <th className="text-right">Earned</th>
              <th>Notes</th>
              <th className="text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} className="text-center py-8"><div className="spinner mx-auto" /></td></tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="text-center py-8 text-gray-400">
                  No attendance records for the selected filters.
                  <div className="mt-3 flex justify-center gap-2">
                    <button type="button" className="btn btn-primary btn-sm" onClick={() => openSingle(null)}>+ Mark Attendance</button>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={openBulk}>Mark Whole Crew</button>
                  </div>
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r._id} className="hover:bg-gray-50">
                  <td>{dateFmt(r.date)}</td>
                  <td className="font-medium">{workerName(r)}</td>
                  <td><span className={STATUS_CLS[r.status] || 'badge'}>{r.status}</span></td>
                  <td className="text-right">{r.workHours ?? '—'}</td>
                  <td className="text-right">{money(r.dailyWage)}</td>
                  <td className="text-right font-medium">{money(r.earnedAmount)}</td>
                  <td className="text-sm text-gray-500">{r.notes || '—'}</td>
                  <td className="text-right">
                    <div className="flex justify-end gap-2">
                      <button type="button" className="btn btn-secondary btn-sm" onClick={() => openSingle(r)}>Edit</button>
                      <button type="button" className="btn btn-danger btn-sm" onClick={() => remove(r)}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {pageInfo && pageInfo.totalItems > 0 && (
        <div className="flex items-center justify-between mt-4 flex-wrap gap-3">
          <div className="text-sm text-gray-500">
            Page {pageInfo.currentPage} of {pageInfo.totalPages} — {pageInfo.totalItems} record(s)
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={page <= 1 || loading}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={page >= totalPages || loading}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Next
            </button>
          </div>
        </div>
      )}


      {/* Single add / edit */}
      {single && (
        <Modal
          title={single._id ? 'Edit Attendance' : 'Mark Attendance'}
          onClose={() => setSingle(null)}
          onSubmit={submitSingle}
          submitting={saving}
        >
          <Field label="Worker">
            <select
              className="select"
              required
              value={single.worker}
              onChange={(e) => setSingle((s) => ({ ...s, worker: e.target.value }))}
            >
              <option value="">Select worker...</option>
              {workers.map((w) => (
                <option key={w._id} value={w._id}>{w.name}</option>
              ))}
            </select>
          </Field>
          <FieldInput
            label="Date"
            type="date"
            required
            value={single.date}
            onChange={(v) => setSingle((s) => ({ ...s, date: v }))}
          />
          <FieldInput
            label="Status"
            type="select"
            required
            value={single.status}
            onChange={(v) => setSingle((s) => ({ ...s, status: v }))}
            options={STATUSES}
          />
          <FieldInput
            label="Work Hours"
            type="number"
            step="0.5"
            value={single.workHours}
            onChange={(v) => setSingle((s) => ({ ...s, workHours: v }))}
          />
          <Field label="Notes">
            <textarea
              className="input"
              rows={2}
              value={single.notes}
              onChange={(e) => setSingle((s) => ({ ...s, notes: e.target.value }))}
            />
          </Field>
        </Modal>
      )}

      {/* Bulk crew marking */}
      {bulk && (
        <Modal
          title={`Mark Attendance — ${dateFmt(bulk.date)}`}
          onClose={() => setBulk(null)}
          onSubmit={submitBulk}
          submitting={saving}
        >
          <div className="mb-3 flex flex-wrap items-end gap-2">
            <div className="mr-auto">
              <FieldInput
                label="Date"
                type="date"
                required
                value={bulk.date}
                onChange={(v) => setBulk((b) => ({ ...b, date: v }))}
              />
            </div>
            {STATUSES.map((s) => (
              <button
                key={s}
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => markAll(s)}
              >
                All {s}
              </button>
            ))}
          </div>

          <div className="table-container" style={{ maxHeight: '45vh', overflowY: 'auto' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Worker</th>
                  <th>Status</th>
                  <th className="text-right">Hours</th>
                  <th className="text-right">Earned</th>
                </tr>
              </thead>
              <tbody>
                {bulk.entries.map((e) => {
                  const mult = e.status === 'Present' ? 1 : e.status === 'Half Day' ? 0.5 : 0;
                  return (
                    <tr key={e.worker}>
                      <td>
                        <div className="font-medium">{e.name}</div>
                        <div className="text-xs text-gray-500">
                          {e.workerType || 'Worker'} · {money(e.dailyWage)}/day
                        </div>
                      </td>
                      <td>
                        <select
                          className="select"
                          value={e.status}
                          onChange={(ev) => setBulkEntry(e.worker, { status: ev.target.value })}
                        >
                          {STATUSES.map((s) => (
                            <option key={s} value={s}>{s}</option>
                          ))}
                        </select>
                      </td>
                      <td className="text-right">
                        <input
                          type="number"
                          step="0.5"
                          className="input text-right"
                          style={{ maxWidth: '90px', marginLeft: 'auto' }}
                          value={e.workHours}
                          onChange={(ev) => setBulkEntry(e.worker, { workHours: ev.target.value })}
                        />
                      </td>
                      <td className="text-right">{money(e.dailyWage * mult)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="mt-3 text-right">
            <span className="text-sm text-gray-500">Estimated crew cost: </span>
            <span className="font-semibold text-primary-700">{money(bulkPreview)}</span>
          </div>
        </Modal>
      )}
    </div>
  );
}

