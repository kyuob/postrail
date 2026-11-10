export function printRecovery(result) {
  if (result.command.endsWith(' reconcile')) return console.log(`Local journal reconciled: ${result.postId}; private backup verified; no remote post was written.`);
  console.log(`${result.command}: ${result.postId}; local state: ${result.localStatus}`);
  for (const [field, matches] of Object.entries(result.comparisons)) console.log(`  ${field}: ${matches ? 'matches' : 'not verified or different'}`);
  console.log(`  visibility: intended=${result.visibility.intended}; actual=${result.visibility.actual}`);
  console.log(`  tags: intended=${JSON.stringify(result.tags.intended)}; actual=${JSON.stringify(result.tags.actual)}`);
  if (result.preserved) console.log(`  preserved editor settings: ${JSON.stringify(result.preserved)}`);
  console.log(`  local reconciliation eligible: ${result.canReconcile}; review hash: ${result.reviewHash}`);
}
