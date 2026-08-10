import { closeDatabase } from "@/src/db/client";
import { listCalls, listDrafts, listSellers } from "@/src/db/repositories";

// Asserts that the seeded demo actually produced a reviewable draft, which is
// the claim the README quickstart makes. Every command in that quickstart can
// exit zero while the pipeline silently produced nothing.
function fail(message: string): never {
  console.error(`Demo verification failed: ${message}`);
  closeDatabase();
  process.exit(1);
}

const sellers = listSellers();
if (sellers.length === 0) fail("no seller exists — run `npm run db:seed` first");

const seller = sellers[0]!;
const calls = listCalls(seller.id);
if (calls.length === 0) fail("the seeded seller has no calls");

const delivered = calls.filter((call) => call.state === "delivered");
if (delivered.length === 0) {
  fail(
    `no call reached "delivered" — states present: ${[...new Set(calls.map((call) => call.state))].join(", ") || "none"}`,
  );
}

const drafts = listDrafts(seller.id);
if (drafts.length === 0) fail("a call is delivered but no draft revision was written");

console.log(
  `Demo verified: ${delivered.length}/${calls.length} call(s) delivered, ${drafts.length} draft revision(s).`,
);
closeDatabase();
