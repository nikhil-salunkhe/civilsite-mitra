import React from 'react';
import { makeCrudTab, money, dateFmt } from './shared';

// Must match backend EXPENSE_CATEGORIES (src/config/constants.js)
const CATEGORIES = [
  'Transportation', 'JCB', 'Machinery', 'Electricity', 'Water',
  'Government Fees', 'Permissions', 'Architect', 'Engineer', 'Travel', 'Miscellaneous',
];

/**
 * Expenses tab - other site expenses outside materials/workers/vendors.
 * Paid/pending/status are recomputed server-side via calculateTotals().
 */
const ExpensesTab = makeCrudTab({
  basePath: 'expenses',
  title: 'Expenses',
  columns: [
    { key: 'expenseDate', label: 'Date', render: (r) => dateFmt(r.expenseDate) },
    { key: 'category', label: 'Category' },
    { key: 'description', label: 'Description' },
    { key: 'amount', label: 'Amount', right: true, render: (r) => money(r.amount) },
    { key: 'paidAmount', label: 'Paid', right: true, render: (r) => money(r.paidAmount) },
    {
      key: 'pending', label: 'Pending', right: true,
      render: (r) => money(Math.max(0, (r.amount || 0) - (r.paidAmount || 0))),
    },
    { key: 'paymentStatus', label: 'Status' },
  ],
  fields: [
    { key: 'expenseDate', label: 'Expense Date', type: 'date' },
    { key: 'category', label: 'Category', type: 'select', options: CATEGORIES, required: true },
    { key: 'description', label: 'Description', required: true, placeholder: 'e.g. Sand delivery to site' },
    { key: 'amount', label: 'Amount', type: 'number', step: '0.01', required: true },
    { key: 'paidAmount', label: 'Amount Paid', type: 'number', step: '0.01' },
    { key: 'notes', label: 'Notes', type: 'textarea' },
  ],
  toForm: (row) => ({
    expenseDate: row.expenseDate ? String(row.expenseDate).slice(0, 10) : '',
    category: row.category || '',
    description: row.description || '',
    amount: row.amount ?? '',
    paidAmount: row.paidAmount ?? '',
    notes: row.notes || '',
  }),
  fromForm: (f) => ({
    expenseDate: f.expenseDate || undefined,
    category: f.category,
    description: f.description,
    amount: Number(f.amount) || 0,
    paidAmount: Number(f.paidAmount) || 0,
    notes: f.notes || '',
  }),
});

export default ExpensesTab;