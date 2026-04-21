/**
 * Seed script — runs on every `prisma migrate` in dev and once per `make fresh`.
 *
 * Cloud mode: creates a few demo tenants.
 * Local mode:  creates the single pinned tenant from LOCAL_TENANT_ID.
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';

const prisma = new PrismaClient();

async function main() {
  const deploymentMode = process.env.DEPLOYMENT_MODE ?? 'cloud';
  const demoTenants = deploymentMode === 'local'
    ? [{ slug: process.env.LOCAL_TENANT_SLUG ?? 'local-site', name: process.env.LOCAL_TENANT_NAME ?? 'Local Branch' }]
    : [
        { slug: 'acme', name: 'ACME Corporation' },
        { slug: 'contoso', name: 'Contoso Ltd' },
      ];

  for (const t of demoTenants) {
    const apiKey = process.env.LOCAL_API_KEY ?? crypto.randomBytes(32).toString('hex');
    const tenant = await prisma.tenant.upsert({
      where: { slug: t.slug },
      update: {},
      create: { slug: t.slug, name: t.name, apiKey },
    });
    console.log(`Tenant ready: ${tenant.slug}  apiKey=${tenant.apiKey}`);

    // Departments
    const engineering = await prisma.department.upsert({
      where: { tenantId_name: { tenantId: tenant.id, name: 'Engineering' } },
      update: {},
      create: { tenantId: tenant.id, name: 'Engineering', description: 'Software and infrastructure' },
    });
    const hr = await prisma.department.upsert({
      where: { tenantId_name: { tenantId: tenant.id, name: 'Human Resources' } },
      update: {},
      create: { tenantId: tenant.id, name: 'Human Resources', description: 'People operations' },
    });

    // Demo admin + employee
    const adminEmp = await prisma.employee.upsert({
      where: { tenantId_empNo: { tenantId: tenant.id, empNo: 'EMP001' } },
      update: {},
      create: {
        tenantId: tenant.id,
        empNo: 'EMP001',
        name: 'Admin User',
        email: 'admin@example.com',
        position: 'System Administrator',
        departmentId: hr.id,
        joinDate: new Date('2023-01-15'),
        baseSalary: 8000,
        status: 'active',
      },
    });
    const devEmp = await prisma.employee.upsert({
      where: { tenantId_empNo: { tenantId: tenant.id, empNo: 'EMP002' } },
      update: {},
      create: {
        tenantId: tenant.id,
        empNo: 'EMP002',
        name: 'Jane Developer',
        email: 'jane@example.com',
        position: 'Senior Developer',
        departmentId: engineering.id,
        joinDate: new Date('2024-06-01'),
        baseSalary: 6500,
        status: 'active',
      },
    });

    const adminPassword = await bcrypt.hash('admin123', 10);
    const empPassword = await bcrypt.hash('password123', 10);

    await prisma.user.upsert({
      where: { tenantId_email: { tenantId: tenant.id, email: 'admin@example.com' } },
      update: {},
      create: {
        tenantId: tenant.id,
        email: 'admin@example.com',
        passwordHash: adminPassword,
        role: 'admin',
        employeeId: adminEmp.id,
        departmentId: hr.id,
      },
    });
    await prisma.user.upsert({
      where: { tenantId_email: { tenantId: tenant.id, email: 'jane@example.com' } },
      update: {},
      create: {
        tenantId: tenant.id,
        email: 'jane@example.com',
        passwordHash: empPassword,
        role: 'employee',
        employeeId: devEmp.id,
        departmentId: engineering.id,
      },
    });
  }

  console.log('Seed complete.');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
