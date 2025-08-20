const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { getPrisma } = require('../../src/prismaClient');

async function importToScriptLibrary() {
  const prisma = getPrisma();

  try {
    console.log('Starting import to script library...');

    // Get script name and description from user input
    const scriptName = process.argv[2];
    const scriptDescription = process.argv[3] || null;
    const scriptCategory = process.argv[4] || null;

    if (!scriptName) {
      console.error('Error: Script name is required.');
      console.error('Usage: node import-to-library.js "<script-name>" "[description]" "[category]"');
      console.error('Example: node import-to-library.js "E-commerce Testing" "Complete e-commerce platform testing" "Web Application"');
      return;
    }

    console.log(`Creating script library entry: "${scriptName}"`);
    if (scriptDescription) console.log(`Description: "${scriptDescription}"`);
    if (scriptCategory) console.log(`Category: "${scriptCategory}"`);

    // Read the CSV file
    const csvFilePath = path.join(__dirname, 'tf-script.csv');
    if (!fs.existsSync(csvFilePath)) {
      console.error(`Error: CSV file not found at ${csvFilePath}`);
      console.error('Please ensure tf-script.csv exists in the import-tfs directory');
      return;
    }

    const csvContent = fs.readFileSync(csvFilePath, 'utf-8');

    // Split into lines and remove the header (first line)
    const lines = csvContent.split('\n').slice(1);

    // Filter out empty lines
    const dataLines = lines.filter(line => line.trim() !== '');

    console.log(`Found ${dataLines.length} data rows to import`);

    if (dataLines.length === 0) {
      console.error('No data lines found in CSV file');
      return;
    }

    // Create the script library entry
    const scriptId = uuidv4();
    await prisma.scriptLibrary.create({
      data: {
        id: scriptId,
        name: scriptName,
        description: scriptDescription,
        category: scriptCategory
      }
    });

    console.log(`Created script library entry with id: ${scriptId}`);

    // Parse CSV and import data
    let lineNumber = 1;
    const importedLines = [];

    for (const line of dataLines) {
      try {
        // Parse CSV line (handling commas within quoted fields)
        const columns = parseCSVLine(line);

        if (columns.length >= 3) {
          const name = columns[0].trim();
          const description = columns[1].trim();
          const notes = columns[2].trim();

          const scriptLibraryLine = {
            id: uuidv4(),
            script_id: scriptId,
            line_number: lineNumber,
            name: name || null,
            description: description || null,
            notes: notes || null
          };

          await prisma.scriptLibraryLine.create({
            data: scriptLibraryLine
          });

          importedLines.push(scriptLibraryLine);
          lineNumber++;
        }
      } catch (error) {
        console.warn(`Error parsing line: ${line}`, error.message);
        continue;
      }
    }

    console.log(`\nSuccessfully imported ${importedLines.length} lines to script library`);
    console.log(`Script "${scriptName}" is now available for room creation`);

    // Display summary
    console.log('\nImported lines:');
    importedLines.forEach((line, index) => {
      console.log(`  ${index + 1}. ${line.name}`);
      if (line.description) {
        console.log(`     Description: ${line.description}`);
      }
    });

  } catch (error) {
    console.error('Import failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Parse CSV line handling quoted fields with commas
function parseCSVLine(line) {
  const columns = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      columns.push(current);
      current = '';
    } else {
      current += char;
    }
  }

  columns.push(current); // Add the last column

  // Clean up quoted values
  return columns.map(col => col.replace(/^"|"$/g, '').trim());
}

// Run if called directly
if (require.main === module) {
  importToScriptLibrary();
}

module.exports = { importToScriptLibrary };
