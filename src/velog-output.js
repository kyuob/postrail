export function printVelog(result) {
  if (result.command === "velog status") console.log(`Local Velog state: ${result.state.status}`);
  else if (result.command === "velog push")
    console.log(
      result.skipped
        ? `Unchanged; upload skipped (${result.postId}).`
        : `Velog ${result.visibility}: ${result.postId}\n${result.url}`,
    );
  else if (result.command === "velog get")
    console.log(
      `Velog ${result.visibility}: ${result.postId}; matches last saved: ${result.matchesLastSaved}`,
    );
  else if (result.command === "velog inspect") {
    console.log(`Velog inspection: ${result.postId}; local state: ${result.localStatus}`);
    for (const [field, matches] of Object.entries(result.comparisons))
      console.log(`  ${field}: ${matches ? "matches" : "not verified or different"}`);
    console.log(
      `  visibility: intended=${result.visibility.intended}; actual=${result.visibility.actual}`,
    );
    console.log(
      `  visibility flags: intended=${JSON.stringify(result.visibility.intendedFlags)}; actual=${JSON.stringify(result.visibility.actualFlags)}`,
    );
    console.log(
      `  tags: intended=${JSON.stringify(result.tags.intended)}; actual=${JSON.stringify(result.tags.actual)}`,
    );
    console.log(
      `  local reconciliation eligible: ${result.canReconcile}; review hash: ${result.reviewHash}`,
    );
  } else if (result.command === "velog reconcile")
    console.log(
      `Local journal reconciled: ${result.postId}; private backup verified; no remote post was written.`,
    );
  else console.log(`${result.command}: complete.`);
}
