/**
 * Terms & Conditions content.
 *
 * Kept as data rather than hand-written JSX so the on-page table of contents
 * and the section anchors can never drift out of sync with the body, and so a
 * future copy edit is a one-line change per paragraph.
 */
export const LAST_UPDATED = 'October 2026';

export const SECTIONS = [
  {
    id: 'acceptance',
    title: 'Acceptance of Terms',
    paragraphs: [
      'By registering, accessing, or using CivilSiteMitra, you confirm that you have read, understood, and agreed to these Terms & Conditions. If you do not agree with any part of these terms, please do not use the platform.',
    ],
  },
  {
    id: 'about',
    title: 'About CivilSiteMitra',
    paragraphs: [
      'CivilSiteMitra is a digital management platform designed to help civil engineers, contractors, and construction professionals manage construction-related information such as:',
    ],
    bullets: [
      'Construction sites',
      'Site owners',
      'Project estimates',
      'Installments and payments',
      'Workers and worker payments',
      'Materials and purchases',
      'Vendors',
      'Site expenses',
      'Activities and progress',
      'Documents and site photos',
      'Reports and exports',
    ],
    after: 'CivilSiteMitra is a management and record-keeping software and does not replace professional engineering, legal, accounting, or financial advice.',
  },
  {
    id: 'user-account',
    title: 'User Account',
    paragraphs: [
      'Users are responsible for providing accurate information during registration and maintaining the confidentiality of their login credentials.',
      'You are responsible for all activities performed through your account.',
      'Users must immediately notify TechMitra Technology if they suspect unauthorized access, account misuse, or security issues.',
    ],
  },
  {
    id: 'user-responsibilities',
    title: 'User Responsibilities',
    intro: 'Users agree to:',
    bullets: [
      'Provide accurate and legitimate information.',
      'Use the platform only for lawful purposes.',
      'Keep login credentials confidential.',
      'Avoid sharing accounts with unauthorized individuals.',
      'Avoid attempting to access another user\u2019s data.',
      'Avoid uploading malicious, illegal, or harmful content.',
      'Avoid attempting to damage, disrupt, or bypass platform security.',
    ],
  },
  {
    id: 'data-business-records',
    title: 'Data & Business Records',
    paragraphs: [
      'Users are responsible for the accuracy of information entered into CivilSiteMitra.',
      'This may include project costs, material quantities, worker payments, vendor payments, expenses, owner payments, site information, and other business records.',
      'CivilSiteMitra may calculate totals, estimates, balances, and reports based on information entered by the user. Users should verify important financial and project information before relying on it for business decisions.',
    ],
  },
  {
    id: 'photos-documents',
    title: 'Site Photos & Documents',
    paragraphs: [
      'Users may upload construction-related photographs, documents, invoices, and other files where supported.',
      'Users confirm that they have the necessary rights and permissions to upload such content.',
      'Users must not upload content that violates applicable laws, copyrights, privacy rights, or third-party rights.',
    ],
  },
  {
    id: 'reports-disclaimer',
    title: 'Reports & Calculations Disclaimer',
    paragraphs: [
      'Reports, dashboards, calculations, estimates, profit figures, payment summaries, and exported documents are generated based on the data provided by the user.',
      'Although reasonable efforts are made to maintain calculation accuracy, users should independently verify important records before using them for accounting, taxation, legal, engineering, or financial purposes.',
      'CivilSiteMitra does not guarantee that generated estimates or reports will be suitable for every business or project decision.',
    ],
  },
  {
    id: 'subscription',
    title: 'Subscription & Payments',
    paragraphs: [
      'Certain features or services may require a paid subscription or service plan.',
      'Applicable pricing, billing period, renewal terms, and service conditions will be communicated to the customer before purchase.',
      'Failure to complete applicable payments may result in suspension or limitation of access to paid features.',
    ],
  },
  {
    id: 'prohibited',
    title: 'Prohibited Activities',
    intro: 'Users must not:',
    bullets: [
      'Attempt unauthorized access to another account.',
      'Reverse engineer or exploit the platform.',
      'Introduce viruses, malware, or harmful code.',
      'Scrape or copy platform data without permission.',
      'Misuse APIs or platform resources.',
      'Use the platform for illegal activities.',
      'Attempt to bypass authentication or security controls.',
    ],
    after: 'Violation of these conditions may result in account suspension or termination.',
  },
  {
    id: 'intellectual-property',
    title: 'Intellectual Property',
    paragraphs: [
      'CivilSiteMitra, its software, interface, design, branding, logos, source code, documentation, and related materials are owned by or licensed to TechMitra Technology unless otherwise stated.',
      'Users receive permission to use the platform according to their applicable service plan. This does not transfer ownership of the software or intellectual property to the user.',
    ],
  },
  {
    id: 'data-security',
    title: 'Data Security & Availability',
    paragraphs: [
      'TechMitra Technology takes reasonable technical and organizational measures to protect user data.',
      'However, no internet-based service can guarantee absolute security or uninterrupted availability.',
      'Service interruptions may occur because of maintenance, hosting providers, infrastructure failures, network issues, third-party services, or circumstances beyond our reasonable control.',
    ],
  },
  {
    id: 'suspension',
    title: 'Account Suspension & Termination',
    intro: 'TechMitra Technology may suspend, restrict, or terminate an account if:',
    bullets: [
      'The user violates these Terms.',
      'The account is involved in unauthorized or illegal activity.',
      'Required payments are not completed.',
      'The account creates security or operational risks.',
      'The service is misused.',
    ],
    after: 'Where reasonably possible, users may be notified before suspension or termination.',
  },
  {
    id: 'liability',
    title: 'Limitation of Liability',
    paragraphs: [
      'To the maximum extent permitted by applicable law, TechMitra Technology will not be responsible for indirect, incidental, consequential, or business losses resulting from the use or inability to use CivilSiteMitra.',
      'Users remain responsible for maintaining appropriate backups and verifying important business records.',
    ],
  },
  {
    id: 'changes',
    title: 'Changes to Terms',
    paragraphs: [
      'TechMitra Technology may update these Terms & Conditions from time to time.',
      'Updated terms will be published on the CivilSiteMitra website with a revised "Last Updated" date.',
      'Continued use of the platform after changes are published constitutes acceptance of the updated terms.',
    ],
  },
  {
    id: 'contact',
    title: 'Contact Us',
    paragraphs: ['TechMitra Technology'],
  },
  {
    id: 'agreement',
    title: 'Agreement',
    paragraphs: [
      'By using CivilSiteMitra, you acknowledge that you have read and agreed to these Terms & Conditions.',
    ],
  },
];
