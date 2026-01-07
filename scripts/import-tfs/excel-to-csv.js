const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');

/**
 * Main function to convert Excel to CSV with strikethrough detection
 * @param {string} inputFilePath Path to the Excel file
 * @param {string} outputFilePath Path to the output CSV file
 */
async function convertExcelToCSV(inputFilePath, outputFilePath) {
  try {
    if (!inputFilePath) {
      console.error('Error: Input file path is required.');
      console.log('Usage: node excel-to-csv.js <path-to-excel-file> [output-csv-path]');
      return;
    }

    if (!outputFilePath) {
      const now = new Date();
      const dateStr = now.toISOString().split('T')[0]; // YYYY-MM-DD
      const csvDir = path.join(__dirname, 'csv');

      // Ensure the csv directory exists
      if (!fs.existsSync(csvDir)) {
        fs.mkdirSync(csvDir, { recursive: true });
      }

      outputFilePath = path.join(csvDir, `tf-script-${dateStr}.csv`);
    }

    console.log(`Reading Excel file: ${inputFilePath}`);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(inputFilePath);

    const worksheet = workbook.getWorksheet(1); // Get the first worksheet

    const processedRows = [];
    processedRows.push(['Section', 'Item under Test', 'Description']);

    let skippedLines = 0;
    let hierarchyStack = []; // Stores parent sections at each indent level

    worksheet.eachRow((row, rowNumber) => {
        // Skip the first row altogether
        if (rowNumber === 1) return;

        // Skip empty rows
        if (!row.values || row.values.length <= 1) return;

        // Get cells (1-indexed)
        const cellA = row.getCell(1);
        const cellB = row.getCell(2);
        const cellC = row.getCell(3);

        // 1. If Column A has strikethrough, do not import the whole line
        if (cellA.font && cellA.font.strike) {
            skippedLines++;
            return;
        }

        // Logic for Multi-Level Hierarchy Concatenation
        const rawA = (cellA.text || '');
        const trimmedA = rawA.trim();
        const indentLevel = (cellA.alignment && cellA.alignment.indent) || 0;

        // Update the hierarchy stack
        // If indent is 0, we start a new root level 0
        // If indent is higher, we keep what's on the stack up to indent - 1
        hierarchyStack = hierarchyStack.slice(0, indentLevel);

        let csvSection = '';
        if (hierarchyStack.length > 0) {
            csvSection = hierarchyStack.join(' > ') + ' > ' + trimmedA;
        } else {
            csvSection = trimmedA;
        }

        // If the current row should act as a parent for deeper indents, add it to stack
        // Heuristic: any row with text can be a parent for a deeper indent row
        hierarchyStack[indentLevel] = trimmedA;

        // Column B: Skip if strikethrough
        const csvItem = (cellB.font && cellB.font.strike) ? '' : (cellB.text || '').trim();
        const csvDesc = (cellC.text || '').trim();

        // Skip if everything is empty
        if (!trimmedA && !csvItem && !csvDesc) return;

        processedRows.push([csvSection, csvItem, csvDesc]);
    });

    // Convert back to CSV format ensuring exactly 3 columns and literal newlines
    const csvContent = processedRows.map(row => {
        return row.map(cell => {
            // Escape double quotes by doubling them
            let formattedCell = cell.replace(/"/g, '""');
            // If cell contains comma, newline, or double quote, wrap in double quotes
            if (formattedCell.includes(',') || formattedCell.includes('\n') || formattedCell.includes('"')) {
                formattedCell = `"${formattedCell}"`;
            }
            return formattedCell;
        }).join(',');
    }).join('\n');

    fs.writeFileSync(outputFilePath, csvContent, 'utf-8');
    console.log(`Successfully converted to CSV: ${outputFilePath}`);
    console.log(`Total rows exported (excluding header): ${processedRows.length - 1}`);
    if (skippedLines > 0) {
        console.log(`Total rows skipped due to strikethrough: ${skippedLines}`);
    }

  } catch (error) {
    console.error('Conversion failed:', error.message);
  }
}

// Run if called directly
if (require.main === module) {
  const inputPath = process.argv[2];
  const outputPath = process.argv[3];
  convertExcelToCSV(inputPath, outputPath);
}

module.exports = { convertExcelToCSV };
