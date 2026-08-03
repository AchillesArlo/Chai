import { TenantDetail } from '../../../tenant-detail';

export default async function Page({
  params,
}: {
  params: Promise<{ tenantId: string }>;
}) {
  const { tenantId } = await params;
  return <TenantDetail tenantId={tenantId} />;
}
