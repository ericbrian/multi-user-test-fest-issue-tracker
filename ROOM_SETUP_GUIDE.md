# Test Fest Issue Tracker - Room Setup Guide

## How to Create a Test Fest (Room)

When you click "Create New Test Fest", you'll be prompted to:

1. **Test Fest Name**: Give your test fest a descriptive name

   - Examples: "Mobile App Testing", "Website Redesign", "Payment System Testing"
   - This name will also be used as the test script name

2. **Description** (Optional): Provide additional details about what you're testing
   - Example: "Testing the new mobile app features including login, navigation, and core functionality"

## How Issues Work

- When creating a test fest, the test fest room and the test fest script are created at the same time and a script ID is created automatically.
- When creating an issue, you must enter the ID of the item under test. This is taken from the actual test script.
- If you reference a Script ID that doesn't exist as a formal test script, the issue will still be created

## Importing Test Scripts from CSV

If you have an existing test script in CSV format, you can import it into your test fest using the import functionality.

### Prerequisites

1. **Create a Test Fest (Room)** first using the web interface
2. **Prepare your CSV file** with the following format:
   ```csv
   Section,Item under Test,Description
   Header,Header,NOTE: With the release of the REST API...
   Footer,Footer,
   Navigation,Left Hand Navigation Bar,
   ```

### CSV Format Requirements

Your CSV file should have three columns:
- **Section** (Column 1): The section or category name
- **Item under Test** (Column 2): The specific item being tested
- **Description** (Column 3): Additional notes or description for the test item

### How to Import

1. **Get the Room UUID** from your test fest room (you can find this in the browser URL when viewing the room or in the database)

2. **Place your CSV file** in the `scripts/import-tfs/` directory and name it `tf-script.csv`

3. **Navigate to the import directory**:
   ```bash
   cd scripts/import-tfs
   ```

4. **Run the import script with the room UUID**:
   ```bash
   node import.js <room-uuid>
   ```
   
   Example:
   ```bash
   node import.js 550e8400-e29b-41d4-a716-446655440000
   ```

### What the Import Does

- **Validates the provided room UUID** and ensures the room exists
- Creates test script lines from your CSV data
- **Associates them with the specified room** (creates a new test script if none exists for that room)
- Each row becomes a test script line with a unique ID
- Assigns sequential test script line IDs starting from 1
- **Uses the next available script_id** for the room if creating a new test script

### Important Notes

- **Room UUID is required** - you must provide the UUID of the target room
- **The room must exist** before importing - the script validates this first
- **Test script lines will be numbered sequentially** (1, 2, 3, etc.)
- **Empty lines in the CSV are ignored**
- **Duplicate entries are skipped** during import
- **The import creates test script lines** that can then be referenced when creating issues
- **Script will show helpful error messages** if the room UUID is missing or invalid

## Sample Test Fest Ideas

### E-commerce Website Testing

Description: "Complete testing of the new e-commerce platform focusing on user journey and payment processing"

### Mobile App Testing

Description: "Beta testing of the mobile app across different devices and operating systems"

### API Testing

Description: "Comprehensive testing of REST API endpoints for reliability and performance"

### Website Redesign

Description: "User acceptance testing for the new website design and navigation"

### Payment System Integration

Description: "Testing the new payment gateway integration across all platforms"
