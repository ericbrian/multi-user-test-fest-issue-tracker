const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { getPrisma } = require('../../src/prismaClient');

async function importTestScriptLines() {
    const prisma = getPrisma();

    try {
        console.log('Starting import process...');

        // Read the CSV file
        const csvFilePath = path.join(__dirname, 'tf-script.csv');
        const csvContent = fs.readFileSync(csvFilePath, 'utf-8');

        // Split into lines and remove the header (first line)
        const lines = csvContent.split('\n').slice(1);

        // Filter out empty lines
        const dataLines = lines.filter(line => line.trim() !== '');

        console.log(`Found ${dataLines.length} data rows to import`);

        // For now, we'll need a test script to associate these lines with
        // You'll need to either create a test script first or modify this to work with your specific needs
        // For this example, I'll create a default test script if none exists

        let testScript = await prisma.testScript.findFirst();

        if (!testScript) {
            console.log('No test script found, creating a default one...');
            // You'll need to provide a room_id here - this is just an example
            const room = await prisma.room.findFirst();
            if (!room) {
                console.error('No room found. Please create a room first.');
                return;
            }

            testScript = await prisma.testScript.create({
                data: {
                    id: uuidv4(),
                    room_id: room.id,
                    script_id: 1,
                    name: 'TF Script Import',
                    description: 'Imported test script lines from tf-script.csv'
                }
            });
            console.log(`Created test script with id: ${testScript.id}`);
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
    importTestScriptLines();
}

module.exports = { importTestScriptLines };
