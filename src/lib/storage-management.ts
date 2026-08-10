import { list, type ListBlobResultBlob } from "@vercel/blob";
import { PrismaClient } from "@prisma/client";
import { isPastStorageGrace } from "@/lib/storage-policy";
import { deleteBlobKeysWithRetry } from "@/lib/blob-cleanup";

const storageGlobal = globalThis as unknown as { storagePrisma?: PrismaClient };
const prisma = storageGlobal.storagePrisma ?? new PrismaClient();
if (process.env.NODE_ENV !== "production") storageGlobal.storagePrisma = prisma;

const MIB = 1024 * 1024;
const DEFAULT_LIMIT_BYTES = 1024 * MIB;

export type StorageCategoryKey =
  | "currentSubmissions"
  | "historicalSubmissions"
  | "latestPdfBuilds"
  | "historicalPdfBuilds"
  | "previews"
  | "institutional"
  | "qa"
  | "temporary"
  | "orphans";

export type StorageCategory = {
  key: StorageCategoryKey;
  label: string;
  count: number;
  bytes: number;
};

export type StorageSnapshot = {
  generatedAt: string;
  totalBytes: number;
  limitBytes: number;
  percentUsed: number;
  blobCount: number;
  submissionCount: number;
  duplicateBytes: number;
  duplicateGroups: number;
  missingReferenceCount: number;
  reclaimableQaBytes: number;
  reclaimableQaCount: number;
  categories: StorageCategory[];
};

type Inventory = {
  blobs: ListBlobResultBlob[];
  references: Set<string>;
  categories: Map<string, StorageCategoryKey>;
};

const labels: Record<StorageCategoryKey, string> = {
  currentSubmissions: "Entregas vigentes",
  historicalSubmissions: "Versiones históricas",
  latestPdfBuilds: "PDF finales vigentes",
  historicalPdfBuilds: "PDF finales anteriores",
  previews: "Miniaturas y vistas previas",
  institutional: "Archivos institucionales",
  qa: "Archivos QA/E2E",
  temporary: "Archivos temporales recientes",
  orphans: "Archivos huérfanos recuperables",
};

function isQaValue(value: unknown) {
  const text = JSON.stringify(value ?? "").toLowerCase();
  return (
    /(?:^|[\s"/_-])(e2e|qa|test)(?:[\s"/_-]|$)/.test(text) ||
    /@example\.com/.test(text) ||
    /prueba automatizada|usuario de prueba|docente ficticio/.test(text)
  );
}

async function listAllBlobs() {
  const blobs: ListBlobResultBlob[] = [];
  let cursor: string | undefined;
  do {
    const page = await list({ limit: 1000, cursor });
    blobs.push(...page.blobs);
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  return blobs;
}

async function inventory(): Promise<Inventory> {
  const [blobs, files, builds, covers] = await Promise.all([
    listAllBlobs(),
    prisma.submissionFile.findMany({
      select: {
        storageKey: true,
        version: {
          select: {
            version: true,
            submission: {
              select: {
                id: true,
                assignment: {
                  select: {
                    title: true,
                    course: { select: { name: true, user: { select: { email: true } } } },
                  },
                },
              },
            },
          },
        },
      },
    }),
    prisma.pdfBuild.findMany({
      where: { storageKey: { not: null } },
      select: {
        assignmentId: true,
        version: true,
        storageKey: true,
        assignment: {
          select: {
            title: true,
            course: { select: { name: true, user: { select: { email: true } } } },
          },
        },
      },
    }),
    prisma.coverTemplate.findMany({
      where: { storageKey: { not: null } },
      select: { storageKey: true },
    }),
  ]);

  const categories = new Map<string, StorageCategoryKey>();
  const references = new Set<string>();
  const latestVersion = new Map<string, number>();
  const latestBuild = new Map<string, number>();
  for (const file of files) {
    const submissionId = file.version.submission.id;
    latestVersion.set(
      submissionId,
      Math.max(latestVersion.get(submissionId) ?? 0, file.version.version),
    );
  }
  for (const build of builds)
    latestBuild.set(
      build.assignmentId,
      Math.max(latestBuild.get(build.assignmentId) ?? 0, build.version),
    );
  for (const file of files) {
    references.add(file.storageKey);
    categories.set(
      file.storageKey,
      isQaValue(file)
        ? "qa"
        : file.version.version === latestVersion.get(file.version.submission.id)
          ? "currentSubmissions"
          : "historicalSubmissions",
    );
  }
  for (const build of builds) {
    if (!build.storageKey) continue;
    references.add(build.storageKey);
    categories.set(
      build.storageKey,
      isQaValue(build)
        ? "qa"
        : build.version === latestBuild.get(build.assignmentId)
          ? "latestPdfBuilds"
          : "historicalPdfBuilds",
    );
  }
  for (const cover of covers) {
    if (!cover.storageKey) continue;
    references.add(cover.storageKey);
    categories.set(cover.storageKey, "institutional");
  }
  const now = Date.now();
  for (const blob of blobs) {
    if (categories.has(blob.pathname)) continue;
    if (/thumb|thumbnail|preview/i.test(blob.pathname)) {
      categories.set(blob.pathname, "previews");
    } else if (isQaValue(blob.pathname)) {
      categories.set(blob.pathname, "qa");
    } else if (!isPastStorageGrace(blob.uploadedAt, now)) {
      categories.set(blob.pathname, "temporary");
    } else {
      categories.set(blob.pathname, "orphans");
    }
  }
  return { blobs, references, categories };
}

export async function getStorageSnapshot(): Promise<StorageSnapshot> {
  const [{ blobs, categories, references }, submissionCount] = await Promise.all([
    inventory(),
    prisma.submission.count({ where: { versions: { some: { files: { some: {} } } } } }),
  ]);
  const result = new Map<StorageCategoryKey, StorageCategory>();
  for (const key of Object.keys(labels) as StorageCategoryKey[])
    result.set(key, { key, label: labels[key], count: 0, bytes: 0 });
  for (const blob of blobs) {
    const category = result.get(categories.get(blob.pathname) ?? "orphans")!;
    category.count += 1;
    category.bytes += blob.size;
  }
  const duplicateSets = new Map<string, ListBlobResultBlob[]>();
  for (const blob of blobs) {
    const key = `${blob.etag}:${blob.size}`;
    duplicateSets.set(key, [...(duplicateSets.get(key) ?? []), blob]);
  }
  const duplicates = [...duplicateSets.values()].filter((items) => items.length > 1);
  const duplicateBytes = duplicates.reduce(
    (total, items) => total + items[0].size * (items.length - 1),
    0,
  );
  const totalBytes = blobs.reduce((total, blob) => total + blob.size, 0);
  const blobKeys = new Set(blobs.map((blob) => blob.pathname));
  const reclaimableQa = blobs.filter(
    (blob) =>
      categories.get(blob.pathname) === "qa" &&
      !references.has(blob.pathname) &&
      isPastStorageGrace(blob.uploadedAt),
  );
  const configuredLimit = Number(process.env.BLOB_STORAGE_LIMIT_BYTES);
  const limitBytes =
    Number.isSafeInteger(configuredLimit) && configuredLimit > 0
      ? configuredLimit
      : DEFAULT_LIMIT_BYTES;
  return {
    generatedAt: new Date().toISOString(),
    totalBytes,
    limitBytes,
    percentUsed: Math.min(100, (totalBytes / limitBytes) * 100),
    blobCount: blobs.length,
    submissionCount,
    duplicateBytes,
    duplicateGroups: duplicates.length,
    missingReferenceCount: [...references].filter((key) => !blobKeys.has(key)).length,
    reclaimableQaBytes: reclaimableQa.reduce((total, blob) => total + blob.size, 0),
    reclaimableQaCount: reclaimableQa.length,
    categories: [...result.values()],
  };
}

export async function cleanupOrphanBlobs(options?: { qaOnly?: boolean }) {
  const { blobs, references, categories } = await inventory();
  const now = Date.now();
  const candidates = blobs.filter((blob) => {
    if (references.has(blob.pathname)) return false;
    if (!isPastStorageGrace(blob.uploadedAt, now)) return false;
    const category = categories.get(blob.pathname);
    return options?.qaOnly ? category === "qa" : category === "orphans";
  });
  if (candidates.length)
    await deleteBlobKeysWithRetry(candidates.map((blob) => blob.pathname));
  return {
    deletedCount: candidates.length,
    deletedBytes: candidates.reduce((total, blob) => total + blob.size, 0),
  };
}

export async function cleanupQaTestAccounts(options?: { execute?: boolean }) {
  const users = await prisma.user.findMany({
    where: {
      email: { endsWith: "@example.com", mode: "insensitive" },
      OR: [
        { email: { startsWith: "e2e-", mode: "insensitive" } },
        { email: { startsWith: "portal-", mode: "insensitive" } },
      ],
    },
    select: {
      id: true,
      courses: {
        select: {
          assignments: {
            select: {
              pdfBuilds: { select: { storageKey: true } },
              submissions: {
                select: {
                  versions: { select: { files: { select: { storageKey: true } } } },
                },
              },
            },
          },
          covers: { select: { storageKey: true } },
        },
      },
    },
  });
  const storageKeys = users.flatMap((user) =>
    user.courses.flatMap((course) => [
      ...course.covers.flatMap((cover) => cover.storageKey ? [cover.storageKey] : []),
      ...course.assignments.flatMap((assignment) => [
        ...assignment.pdfBuilds.flatMap((build) => build.storageKey ? [build.storageKey] : []),
        ...assignment.submissions.flatMap((submission) =>
          submission.versions.flatMap((version) => version.files.map((file) => file.storageKey)),
        ),
      ]),
    ]),
  );
  if (options?.execute && users.length) {
    const userIds = users.map((user) => user.id);
    await prisma.$transaction([
      prisma.assignment.deleteMany({ where: { course: { userId: { in: userIds } } } }),
      prisma.course.deleteMany({ where: { userId: { in: userIds } } }),
      prisma.user.deleteMany({ where: { id: { in: userIds } } }),
    ]);
    if (storageKeys.length)
      await deleteBlobKeysWithRetry(storageKeys).catch((error) => {
        console.error("qa_account_blob_cleanup_failed", error);
      });
  }
  return { accountCount: users.length, blobCount: storageKeys.length };
}

export function storageMiB(bytes: number) {
  return bytes / MIB;
}
