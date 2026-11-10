export function printKeyflow(result) {
  if (result.command === "keyflow push")
    console.log(
      result.skipped
        ? `Unchanged; upload skipped (${result.postId}).`
        : `KeyFlow ${result.status} (${result.visibility}): ${result.postId}${result.url ? `\n${result.url}` : ""}`,
    );
  else if (result.command === "keyflow status")
    console.log(
      `Local KeyFlow state: ${result.state.status}${result.state.postId ? ` (${result.state.postId})` : ""}`,
    );
  else console.log(`${result.command}: complete.`);
}
