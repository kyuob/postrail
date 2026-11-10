import { printRecovery } from "./recovery-output.js";

export function printTistory(result) {
  if (["tistory inspect", "tistory reconcile"].includes(result.command)) printRecovery(result);
  else if (result.command === "tistory status")
    console.log(`Local Tistory state: ${result.state.status}`);
  else if (result.command === "tistory check")
    console.log(
      result.canPush
        ? "Tistory offline check: passed."
        : `Tistory check: ${result.blockers.join(", ")}`,
    );
  else if (result.command === "tistory push")
    console.log(
      result.skipped
        ? `Unchanged; upload skipped (${result.postId}).`
        : `Tistory ${result.visibility}: ${result.postId}\n${result.url}`,
    );
  else if (result.command === "tistory get")
    console.log(
      `Tistory ${result.visibility}: ${result.postId}; matches last saved: ${result.matchesLastSaved}`,
    );
  else console.log(`${result.command}: complete.`);
}
