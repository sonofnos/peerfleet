import { execSync } from 'child_process';
import {
  PostgreSqlContainer,
  StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import { PrismaClient } from '@prisma/client';

let container: StartedPostgreSqlContainer;
let prismaClient: PrismaClient;

export async function startTestDatabase(): Promise<PrismaClient> {
  container = await new PostgreSqlContainer('postgres:16').start();
  const databaseUrl = container.getConnectionUri();

  execSync('npx prisma migrate deploy', {
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: 'inherit',
  });

  prismaClient = new PrismaClient({
    datasources: { db: { url: databaseUrl } },
  });
  await prismaClient.$connect();
  return prismaClient;
}

export async function stopTestDatabase(): Promise<void> {
  await prismaClient?.$disconnect();
  await container?.stop();
}
