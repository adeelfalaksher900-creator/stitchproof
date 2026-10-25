import { findErrata } from "./errata";

// Runs the fix search off the main thread so a long pattern never freezes the page.
self.onmessage = (e: MessageEvent<{ text: string; proof: Parameters<typeof findErrata>[1] }>) => {
  postMessage(findErrata(e.data.text, e.data.proof));
};
