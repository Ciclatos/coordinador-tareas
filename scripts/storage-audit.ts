import {
  cleanupOrphanBlobs,
  cleanupQaTestAccounts,
  getStorageSnapshot,
} from "../src/lib/storage-management";

const args = new Set(process.argv.slice(2));
const execute = args.has("--execute");
const qaOnly = args.has("--qa-orphans");
const wantsCleanup = args.has("--cleanup-orphans") || qaOnly;
const qaAccounts = args.has("--qa-accounts");
const confirmation = process.argv.find((item) => item.startsWith("--confirm="))?.split("=")[1];

async function main() {
  const before = await getStorageSnapshot();
  console.log(JSON.stringify({ mode: execute ? "execute" : "audit", ...before }, null, 2));
  if (wantsCleanup && !execute)
    console.log("Vista previa únicamente. Añada --execute --confirm=DELETE_UNREFERENCED_BLOBS para eliminar.");
  if (wantsCleanup && execute) {
    if (confirmation !== "DELETE_UNREFERENCED_BLOBS")
      throw new Error("Confirmación ausente o incorrecta.");
    const removed = await cleanupOrphanBlobs({ qaOnly });
    const after = await getStorageSnapshot();
    console.log(JSON.stringify({ removed, after }, null, 2));
  }
  if (qaAccounts) {
    if (execute && confirmation !== "DELETE_UNREFERENCED_BLOBS")
      throw new Error("Confirmación ausente o incorrecta.");
    const accounts = await cleanupQaTestAccounts({ execute });
    console.log(JSON.stringify({ qaAccounts: accounts, executed: execute }, null, 2));
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
