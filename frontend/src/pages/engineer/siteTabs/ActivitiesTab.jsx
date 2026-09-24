import React from 'react';
import { makeCrudTab, money, dateFmt } from './shared';

// Must match the Activity model enum (backend/src/models/Activity.js)
const TYPES = [
  'Site Visit', 'Concrete Pour', 'Slab Work', 'Brick Work', 'Plastering',
  'Inspection', 'Material Delivery', 'Measurement', 'Other',
];

const todayStr = () => new Date().toISOString().split('T')[0];

/**
 * Activities tab - daily site work log (site diary).
 * POST/PUT/DELETE hit /sites/:siteId/activities[/:id].
 */
const ActivitiesTab = makeCrudTab({
  basePath: 'activities',
  title: 'Activities',
  columns: [
    { key: 'date', label: 'Date', render: (r) => dateFmt(r.date) },
    { key: 'type', label: 'Type' },
    { key: 'workDescription', label: 'Work Description' },
    { key: 'workersPresent', label: 'Workers', right: true },
    {
      key: 'todayExpense', label: "Today's Expense", right: true,
      render: (r) => money(r.todayExpense),
    },
  ],
  fields: [
    { key: 'date', label: 'Date', type: 'date' },
    { key: 'type', label: 'Activity Type', type: 'select', options: TYPES },
    { key: 'workDescription', label: 'Work Description', required: true, placeholder: 'What work was carried out today?' },
    { key: 'workersPresent', label: 'Workers Present', type: 'number' },
    { key: 'workCompleted', label: 'Work Completed', placeholder: 'e.g. 1st slab shuttering done' },
    { key: 'materialsReceived', label: 'Materials Received', placeholder: 'e.g. 50 cement bags' },
    { key: 'issues', label: 'Issues / Delays' },
    { key: 'todayExpense', label: "Today's Expense", type: 'number', step: '0.01' },
    { key: 'notes', label: 'Notes', type: 'textarea' },
  ],
  toForm: (row) => ({
    date: row.date ? String(row.date).slice(0, 10) : todayStr(),
    type: row.type || 'Other',
    workDescription: row.workDescription || '',
    workersPresent: row.workersPresent ?? '',
    workCompleted: row.workCompleted || '',
    materialsReceived: row.materialsReceived || '',
    issues: row.issues || '',
    todayExpense: row.todayExpense ?? '',
    notes: row.notes || '',
  }),
  fromForm: (f) => ({
    date: f.date || undefined,
    type: f.type || 'Other',
    workDescription: f.workDescription,
    workersPresent: Number(f.workersPresent) || 0,
    workCompleted: f.workCompleted || '',
    materialsReceived: f.materialsReceived || '',
    issues: f.issues || '',
    todayExpense: Number(f.todayExpense) || 0,
    notes: f.notes || '',
  }),
});

export default ActivitiesTab;
