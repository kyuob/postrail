export function printPublish(result) {
  if (result.offline) {
    console.log("Offline publish preflight:");
    for (const target of result.preflight)
      console.log(
        `  ${target.platform}: ${target.visibility}; ${target.blockers.length ? target.blockers.join(", ") : "ready for explicit confirmation"}`,
      );
  } else {
    for (const target of result.results) {
      const id = target.postId ? ` (${target.postId})` : "";
      if (target.status !== "failed") console.log(`  ${target.platform}: ${target.status}${id}`);
      else {
        const next =
          target.nextAction === "inspect_remote"
            ? "inspect the saved remote result; do not resend an unresolved write"
            : target.nextAction === "review_inputs"
              ? "review inputs and platform status before another send"
              : "inspect local journals and platform status before another send";
        console.log(
          `  ${target.platform}: failed${id} — ${target.error.code}; local state: ${target.localStatus}; ${next}`,
        );
      }
    }
  }
}
