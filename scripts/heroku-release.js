const { spawnSync } = require('node:child_process');

function runPrismaMigrateDeploy() {
  const prismaCmd = process.platform === 'win32' ? 'node_modules\\.bin\\prisma.cmd' : 'node_modules/.bin/prisma';
  return spawnSync(prismaCmd, ['migrate', 'deploy'], {
    encoding: 'utf8',
    env: process.env,
  });
}

function main() {
  const result = runPrismaMigrateDeploy();

  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);

  const combinedOutput = `${result.stdout || ''}\n${result.stderr || ''}`;

  if (result.status === 0) {
    return;
  }

  // When pointing at an existing non-empty schema (e.g., external/shared DB), Prisma needs a baseline.
  // We treat P3005 as non-fatal so the release can proceed.
  if (combinedOutput.includes('Error: P3005')) {
    console.warn(
      [
        '',
        '⚠️  Prisma migrate deploy failed with P3005 (schema not empty).',
        '    Skipping migrations for this release so the app can boot.',
        '    If you need migrations, baseline the DB (prisma migrate resolve) then redeploy.',
        '',
      ].join('\n')
    );
    process.exit(0);
  }

  // Otherwise: fail the release.
  process.exit(typeof result.status === 'number' ? result.status : 1);
}

main();
