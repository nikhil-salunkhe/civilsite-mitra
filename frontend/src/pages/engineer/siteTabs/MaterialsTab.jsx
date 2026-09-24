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
});

export default MaterialsTab;
