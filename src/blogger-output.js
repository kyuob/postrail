import { printRecovery } from "./recovery-output.js";

export function printBlogger(result) {
  if (["blogger inspect", "blogger reconcile"].includes(result.command)) printRecovery(result);
  else if (result.command === "blogger status")
    console.log(`Local Blogger state: ${result.state.status}`);
  else if (result.command === "blogger check")
    console.log(
      result.canPush
        ? "Blogger offline check: passed."
        : `Blogger check: ${result.blockers.join(", ")}`,
    );
  else if (result.command === "blogger blogs")
    for (const blog of result.blogs) console.log(`${blog.blogId}: ${blog.name}`);
  else if (result.command === "blogger push")
    console.log(
      result.skipped
        ? `Unchanged; upload skipped (${result.postId}).`
        : `Blogger ${result.visibility}: ${result.postId}`,
    );
  else if (result.command === "blogger get")
    console.log(
      `Blogger ${result.visibility}: ${result.postId}; matches last saved: ${result.matchesLastSaved}`,
    );
  else console.log(`${result.command}: complete.`);
}
