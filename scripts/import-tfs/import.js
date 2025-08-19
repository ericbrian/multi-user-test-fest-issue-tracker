const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { getPrisma } = require('../../src/prismaClient');

async function importTestScriptLines(roomId) {
  const prisma = getPrisma();

  try {
    console.log('Starting import process...');

    // Validate room ID parameter
    if (!roomId) {
      console.error('Error: Room ID is required. Usage: node import.js <room-uuid>');
      console.error('Example: node import.js 550e8400-e29b-41d4-a716-446655440000');
      return;
    }

    // Verify the room exists
    const room = await prisma.room.findUnique({
      where: { id: roomId }
    });

    if (!room) {
      console.error(`Error: No room found with ID: ${roomId}`);
      console.error('Please verify the room ID and try again.');
      return;
    }

    console.log(`Using room: "${room.name}" (${room.id})`);

    // Read the CSV file
    const csvFilePath = path.join(__dirname, 'tf-script.csv');
    const csvContent = fs.readFileSync(csvFilePath, 'utf-8');

    // Split into lines and remove the header (first line)
    const lines = csvContent.split('\n').slice(1);

    // Filter out empty lines
    const dataLines = lines.filter(line => line.trim() !== '');

    console.log(`Found ${dataLines.length} data rows to import`);

    // Look for existing test script in this room
    let testScript = await prisma.testScript.findFirst({
      where: { room_id: roomId }
    });

    if (!testScript) {
      console.log('No test script found for this room, creating a new one...');

      // Get the next script_id for this room
      const lastScript = await prisma.testScript.findFirst({
        where: { room_id: roomId },
        orderBy: { script_id: 'desc' }
      });
      const nextScriptId = lastScript ? lastScript.script_id + 1 : 1;

      testScript = await prisma.testScript.create({
        data: {
          id: uuidv4(),
          room_id: roomId,
          script_id: nextScriptId,
          name: 'TF Script Import',
          description: 'Imported test script lines from tf-script.csv'
        }
      });
      console.log(`Created test script with id: ${testScript.id} (script_id: ${nextScriptId})`);
    } else {
      console.log(`Using existing test script: ${testScript.name} (${testScript.id})`);
    }

    // Parse CSV and import data
    let testScriptLineId = 1;
    const importedLines = [];

    for (const line of dataLines) {
      try {
        // Parse CSV line (handling commas within quoted fields)
        const columns = parseCSVLine(line);

        if (columns.length >= 3) {
          const name = columns[0].trim();
          const description = columns[1].trim();
          const notes = columns[2].trim();

          const testScriptLine = {
            id: uuidv4(),
            test_script_id: testScript.id,
            test_script_line_id: testScriptLineId,
            name: name || null,
            description: description || null,
            notes: notes || null
          };

          importedLines.push(testScriptLine);
          testScriptLineId++;
        }
      } catch (error) {
        console.warn(`Error parsing line: ${line}`, error.message);
      }
    }

    // Bulk insert all lines
    console.log(`Importing ${importedLines.length} test script lines...`);

    const result = await prisma.testScriptLine.createMany({
      data: importedLines,
      skipDuplicates: true
    });

    console.log(`Successfully imported ${result.count} test script lines`);
    console.log('Import completed successfully!');

  } catch (error) {
    console.error('Error during import:', error);
  } finally {
    await prisma.$disconnect();
  }
}

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }

  // Add the last column
  result.push(current);

  // Clean up quotes from the results
  return result.map(col => col.replace(/^"/, '').replace(/"$/, ''));
}

// Run the import if this script is executed directly
if (require.main === module) {
  const roomId = process.argv[2];
  importTestScriptLines(roomId);
}

module.exports = { importTestScriptLines };
