/**
 * Seed Pilot Data Script for Chai Omnichannel AI Platform
 */
export async function seedPilotData() {
  console.log('Seeding Pilot Tenant Data...');
  const tenant = {
    id: 'tenant-nusantara-dental',
    name: 'Nusantara Dental',
    domain: 'nusantaradental.chai.id',
    status: 'ACTIVE',
  };

  const knowledgeDocs = [
    { title: 'Daftar Harga Perawatan Gigi 2026.pdf', chunks: 24 },
    { title: 'FAQ Layanan & Jam Operasional.docx', chunks: 12 },
  ];

  console.log(`Seeded tenant ${tenant.name} (${tenant.id}) with ${knowledgeDocs.length} knowledge documents.`);
  return { tenant, knowledgeDocs };
}

if (require.main === module) {
  seedPilotData().then(() => console.log('Seed completed.'));
}
