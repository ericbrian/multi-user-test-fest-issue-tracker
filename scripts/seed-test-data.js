const { PrismaClient } = require('@prisma/client');
const { v4: uuidv4 } = require('uuid');

async function main() {
  console.log('🔗 DB URL:', process.env.DATABASE_URL);
  const prisma = new PrismaClient();
  
  try {
    console.log('🌱 Seeding test data...');
    
    // 1. Create a script template
    const templateId = uuidv4();
    await prisma.scriptTemplate.upsert({
      where: { id: templateId }, // This is dummy because we want to create it
      update: {},
      create: {
        id: templateId,
        name: 'Standard Test Script',
        description: 'Standard set of tests for API verification',
        category: 'API Testing',
        is_active: true,
        lines: {
          create: [
            {
              id: uuidv4(),
              line_number: 1,
              name: 'Login Test',
              description: 'Verify user can login',
            },
            {
              id: uuidv4(),
              line_number: 2,
              name: 'Issue Creation',
              description: 'Verify issue reporting works',
            }
          ]
        }
      }
    });

    console.log('✅ Seeding completed successfully');
  } catch (error) {
    console.error('❌ Seeding failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
