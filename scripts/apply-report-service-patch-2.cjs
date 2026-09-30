// 3. Destructuring of the Promise.all results.
apply(
  'destructure',
  `    workerPayments,
    materials,
    vendors,
    vendorPayments,
    expenses,
    activities,
  ] = await Promise.all([`,
  `    workerPayments,
    materials,
    vendors,
    vendorPayments,
    expenses,
    activities,
    documents,
    usage,
    attendanceSummary,
    stock,
  ] = await Promise.all([`
);

// 4. Material usage extraction from free-text expenses ("Vendor-wise rollup"
// anchors this just above the vendor rollup - it sits right after it).
apply(
  'usage-from-expenses',
  `  // Vendor-wise rollup (purchase obligation + cash paid to that vendor).`,
  `  // Material consumed on site, recovered from free-text expense records, so
  // the report's "material consumed" figure matches the Materials tab logic.
  const MATERIAL_WORDS = ['cement', 'sand', 'steel', 'brick', 'aggregate', 'concrete'];
  const materialUsageFromExpenses = expenses
    .filter((e) => MATERIAL_WORDS.some((w) => String(e.description || '').toLowerCase().includes(w)))
    .reduce((acc, e) => acc + (Number(e.amount) || 0), 0);

  // Vendor-wise rollup (purchase obligation + cash paid to that vendor).`
);

// 5. Include everything in the returned payload.
apply(
  'payload',
  `    workers: workerSummary,
    workerPayments,
    materials,`,
  `    workers: workerSummary,
    workerPayments,
    attendanceSummary,
    materials,
    usage,
    stock,
    materialUsageFromExpenses,`
);

apply(
  'payload-docs',
  `    expenses,
    activities,`,
  `    expenses,
    activities,
    documents,`
);

fs.writeFileSync(file, text);
console.log(`DONE patched=${changed}`);
