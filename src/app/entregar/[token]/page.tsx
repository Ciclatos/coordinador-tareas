import type { Metadata } from "next";
import { findPublicPortal, publicPortalSummary } from "@/lib/public-portal-data";
import PublicSubmissionPortal from "@/components/PublicSubmissionPortal";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Portal de entrega", robots: { index: false, follow: false, nocache: true } };

export default async function PublicDeliveryPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const portal = await findPublicPortal(token);
  if (!portal) return <PublicSubmissionPortal token={token} invalid />;
  return <PublicSubmissionPortal token={token} summary={publicPortalSummary(portal)} />;
}
