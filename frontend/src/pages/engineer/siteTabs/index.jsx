import React from 'react';
import OverviewTab from './OverviewTab';
import PaymentsTab from './PaymentsTab';
import InstallmentsTab from './InstallmentsTab';
import WorkersTab from './WorkersTab';
import AttendanceTab from './AttendanceTab';
import MaterialsTab from './MaterialsTab';
import MaterialUsageTab from './MaterialUsageTab';
import VendorsTab from './VendorsTab';
import ExpensesTab from './ExpensesTab';
import ActivitiesTab from './ActivitiesTab';
import ReportsTab from './ReportsTab';
import SitePhotosTab from './SitePhotosTab';
import DocumentsTab from './DocumentsTab';

const TABS = {
  Overview: OverviewTab,
  Payments: PaymentsTab,
  Installments: InstallmentsTab,
  Workers: WorkersTab,
  Attendance: AttendanceTab,
  Materials: MaterialsTab,
  'Material Usage': MaterialUsageTab,
  Vendors: VendorsTab,
  Expenses: ExpensesTab,
  Activities: ActivitiesTab,
  Reports: ReportsTab,
  'Site Photos': SitePhotosTab,
  Documents: DocumentsTab,
};

// Uniform contract for every tab: { siteId, site, summary, onChanged }
export default function TabPanel({ tab, siteId, site, summary, onChanged }) {
  const Cmp = TABS[tab];
  if (!Cmp) return null;
  return <Cmp siteId={siteId} site={site} summary={summary} onChanged={onChanged} />;
}
