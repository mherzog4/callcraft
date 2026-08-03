import type { EmailDraft } from "@/src/domain/schemas";

const reservedExampleDomains = new Set(["example.com", "example.net", "example.org"]);

export function isReservedExampleAddress(address: string): boolean {
  const separator = address.lastIndexOf("@");
  if (separator < 0) return false;
  return reservedExampleDomains.has(address.slice(separator + 1).toLowerCase());
}

export function reservedExampleRecipients(draft: Pick<EmailDraft, "to" | "cc">): string[] {
  return [...draft.to, ...draft.cc].filter(isReservedExampleAddress);
}

export function hasReservedExampleRecipients(draft: Pick<EmailDraft, "to" | "cc">): boolean {
  return reservedExampleRecipients(draft).length > 0;
}
