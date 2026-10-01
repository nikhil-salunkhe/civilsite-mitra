import React from 'react';
import { makeCrudTab } from './shared';
import { money, dateFmt } from './shared';

const CATEGORIES = ['Cement', 'Steel', 'Sand', 'Bricks', 'Tiles', 'Electrical', 'Plumbing', 'Paint', 'Hardware', 'Wood', 'Other'];
const UNITS = ['Bags', 'Kg', 'Ton', 'Quintal', 'Brass', 'CFT', 'SQFT', 'Pieces', 'Litres', 'No.'];

/**
 * Materials tab - purchases with automatic quantity x rate = total.
 * The backend recomputes totalAmount server-side; we only send the numbers.
 */
const MaterialsTab = makeCrudTab({
  basePath: 'materials',
  title: 'Materials',
  columns: [
    { key: 'name', label: 'Material' },
    { key: 'category', label: 'Category' },
    { key: 'quantity', label: 'Qty', right: true, render: (r) => `${r.quantity ?? '—'} ${r.unit || ''}` },
    { key: 'rate', label: 'Rate', right: true, render: (r) => money(r.rate) },
    { key: 'totalAmount', label: 'Total', right: true, render: (r) => money(r.totalAmount) },
    { key: 'paidAmount', label: 'Paid', right: true, render: (r) => money(r.paidAmount) },
    {
      key: 'pending', label: 'Pending', right: true,
      render: (r) => money(Math.max(0, (r.totalAmount || 0) - (r.paidAmount || 0))),
    },
    { key: 'purchaseDate', label: 'Purchased', render: (r) => dateFmt(r.purchaseDate) },
    { key: 'invoiceNumber', label: 'Invoice' },
  ],
  fields: [
    { key: 'name', label: 'Material Name', required: true, placeholder: 'e.g. OPC 53 Grade Cement' },
    { key: 'category', label: 'Category', type: 'select', options: CATEGORIES, required: true },
    { key: 'quantity', label: 'Quantity', type: 'number', step: '0.01', required: true },
    { key: 'unit', label: 'Unit', type: 'select', options: UNITS, required: true },
    { key: 'rate', label: 'Rate per Unit', type: 'number', step: '0.01', required: true },
    { key: 'paidAmount', label: 'Amount Paid', type: 'number', step: '0.01' },
    { key: 'purchaseDate', label: 'Purchase Date', type: 'date' },
    { key: 'invoiceNumber', label: 'Invoice Number', placeholder: 'e.g. INV-2024-001' },
    { key: 'notes', label: 'Notes', type: 'textarea' },
  ],
  toForm: (row) => ({
    name: row.name || '',
    category: row.category || '',
    quantity: row.quantity ?? '',
    unit: row.unit || '',
    rate: row.rate ?? '',
    paidAmount: row.paidAmount ?? '',
    purchaseDate: row.purchaseDate ? String(row.purchaseDate).slice(0, 10) : '',
    invoiceNumber: row.invoiceNumber || '',
    notes: row.notes || '',
  }),
  fromForm: (f) => ({
    name: f.name,
    category: f.category,
    unit: f.unit,
    quantity: Number(f.quantity) || 0,
    rate: Number(f.rate) || 0,
    paidAmount: Number(f.paidAmount) || 0,
    purchaseDate: f.purchaseDate || undefined,
    invoiceNumber: f.invoiceNumber || '',
    notes: f.notes || '',
  }),

  // Live read-out while the engineer types. The engineer never types a total:
  // it is always quantity x rate, and the server recomputes it on save.
  formExtra: (f) => {
    const qty = Number(f.quantity);
    const rate = Number(f.rate);
    const hasBoth = Number.isFinite(qty) && Number.isFinite(rate) && f.quantity !== '' && f.rate !== '';
    const total = hasBoth ? qty * rate : 0;
    const paid = Number(f.paidAmount) || 0;
    const pending = Math.max(0, total - paid);
    return (
      <div className="rounded-lg border border-primary-200 bg-primary-50 p-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-primary-700">Total (auto-calculated)</span>
          <span className="text-base font-bold text-primary-900">{money(total)}</span>
        </div>
        <p className="text-[11px] text-primary-600 mt-1">
          {hasBoth
            ? `${qty} ${f.unit || ''} × ${money(rate)} = ${money(total)}`
            : 'Enter quantity and rate to see the total.'}
        </p>
        {hasBoth && paid > 0 && (
          <p className="text-[11px] text-primary-700 mt-1">
            Paid {money(paid)} · Pending {money(pending)}
          </p>
        )}
        <p className="text-[10px] text-primary-500 mt-1.5">
          Total is calculated for you — it cannot be typed or overridden.
        </p>
      </div>
    );
  },
});

export default MaterialsTab;
