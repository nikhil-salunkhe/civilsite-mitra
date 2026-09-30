import React from 'react';
import { Icon } from './Icon';

export const LoadingScreen = () => (
  <div className="flex items-center justify-center min-h-screen bg-gray-50">
    <div className="flex flex-col items-center">
      <div className="spinner w-12 h-12 border-4 border-primary-600 border-t-transparent"></div>
      <p className="mt-4 text-gray-500">Loading...</p>
    </div>
  </div>
);

export const EmptyState = ({ icon, title, description, action }) => (
  <div className="empty-state">
    {icon && <div className="empty-state-icon">{icon}</div>}
    <h3 className="empty-state-title">{title}</h3>
    {description && <p className="empty-state-description">{description}</p>}
    {action && <div className="mt-4">{action}</div>}
  </div>
);

export const ConfirmDialog = ({ isOpen, onClose, onConfirm, title, message, confirmText = 'Confirm', cancelText = 'Cancel', isDangerous = false }) => {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content modal-sm" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">{title}</h3>
          <button
            type="button"
            aria-label="Close dialog"
            onClick={onClose}
            className="btn-icon btn-secondary rounded-full hover:bg-gray-100"
          >
            <Icon name="x" size={20} />
          </button>
        </div>
        <div className="modal-body">
          <p className="text-gray-600">{message}</p>
        </div>
        <div className="modal-footer">
          <button type="button"  onClick={onClose} className="btn btn-secondary">{cancelText}</button>
          <button type="button"  onClick={onConfirm} className={`btn ${isDangerous ? 'btn-danger' : 'btn-primary'}`}>
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};

export const StatusBadge = ({ status }) => {
  const statusConfig = {
    'ACTIVE': { className: 'status-active', label: 'Active' },
    'SUSPENDED': { className: 'status-suspended', label: 'Suspended' },
    'BLOCKED': { className: 'status-blocked', label: 'Blocked' },
    'INACTIVE': { className: 'status-inactive', label: 'Inactive' },
    'Active': { className: 'status-active', label: 'Active' },
    'On Hold': { className: 'status-suspended', label: 'On Hold' },
    'Planned': { className: 'status-inactive', label: 'Planned' },
    'Completed': { className: 'status-completed', label: 'Completed' },
    'Closed': { className: 'status-inactive', label: 'Closed' },
    'Paid': { className: 'status-paid', label: 'Paid' },
    'Partial': { className: 'status-partial', label: 'Partial' },
    'Pending': { className: 'status-pending', label: 'Pending' },
    'Overdue': { className: 'status-blocked', label: 'Overdue' },
  };

  const config = statusConfig[status] || { className: 'bg-gray-100 text-gray-700', label: status };

  return (
    <span className={`badge ${config.className}`}>
      {config.label}
    </span>
  );
};

export const Pagination = ({ currentPage, totalPages, onPageChange }) => {
  if (totalPages <= 1) return null;

  return (
    <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200">
      <p className="text-sm text-gray-600">
        Page {currentPage} of {totalPages}
      </p>
      <div className="flex items-center gap-1">
        <button type="button" 
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1}
          className="btn btn-secondary btn-sm"
        >
          Previous
        </button>
        <button type="button" 
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage === totalPages}
          className="btn btn-secondary btn-sm ml-2"
        >
          Next
        </button>
      </div>
    </div>
  );
};

export const SearchInput = ({ value, onChange, placeholder = 'Search...' }) => (
  <div className="relative">
    <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
    </svg>
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="input pl-10"
    />
  </div>
);

export const PageHeader = ({ title, subtitle, actions }) => (
  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6">
    <div>
      <h1 className="text-2xl font-bold text-gray-900 break-words">{title}</h1>
      {subtitle && <p className="text-sm text-gray-500 mt-1">{subtitle}</p>}
    </div>
    {actions && <div className="mt-4 sm:mt-0">{actions}</div>}
  </div>
);

export const FormSection = ({ title, children }) => (
  <div className="mb-6">
    <h2 className="text-lg font-semibold text-gray-900 mb-4 border-b border-gray-200 pb-2">{title}</h2>
    {children}
  </div>
);
export const FormRow = ({ children, className = '' }) => (
  <div className={`grid grid-cols-1 md:grid-cols-2 gap-4 ${className}`}>
    {children}
  </div>
);

export const FormGroup = ({ label, children, error, className = '' }) => (
  <div className={`mb-4 ${className}`}>
    {label && <label className="label">{label}</label>}
    {children}
    {error && <p className="mt-1 text-sm text-danger-600">{error}</p>}
  </div>
);
