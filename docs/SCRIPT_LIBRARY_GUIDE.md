# Script Library Usage Guide

The Test Fest Issue Tracker now supports a script library that allows users to choose from pre-built test scripts when creating rooms.

## Overview

Instead of creating empty test scripts for each room, users can now:

1. Choose from a library of existing test script templates when creating a new room
2. Create an empty room and add tests later (original functionality)
3. Build up the script library using imported CSV files

## How to Add Scripts to the Library

### Using the Import Script

1. **Prepare your CSV file**: Place your test script data in `/scripts/import-tfs/tf-script.csv`

   The CSV should have this format:

   ```csv
   Test Step Name,Description,Notes
   "Login to Application","Navigate to login page and enter credentials","Use test account credentials"
   "Browse Products","Navigate through product categories","Test filtering and sorting"
   ```

2. **Run the import command**:

   ```bash
   cd /path/to/project
   node scripts/import-tfs/import-to-library.js "Script Name" "Optional Description" "Optional Category"
   ```

   **Examples**:

   ```bash
   # Simple import with just a name
   node scripts/import-tfs/import-to-library.js "E-commerce Testing"

   # With description
   node scripts/import-tfs/import-to-library.js "Mobile App Testing" "Complete mobile app testing workflow"

   # With description and category
   node scripts/import-tfs/import-to-library.js "API Testing" "REST API endpoint testing" "Integration Testing"
   ```

3. **The script will**:
   - Create a new entry in the script library
   - Import all test steps from your CSV file
   - Make the script available for room creation

## How Users Choose Scripts

When creating a new Test Fest room:

1. **Click "Create New Test Fest"** - This now opens a modal instead of simple prompts
2. **Fill in the room details**:
   - **Test Fest Name**: Required name for the room
   - **Description**: Optional description of what's being tested
   - **Test Script Template**: Choose from available library scripts or create empty
3. **Script Selection Options**:
   - **"Create empty script"**: Original behavior - empty script with room name
   - **Library Scripts**: Pre-built scripts showing name, category, and test count

## Script Library Management

### Database Schema

The script library uses two new tables:

- `script_library`: Stores script templates with name, description, category
- `script_library_line`: Stores individual test steps for each script template

### API Endpoints

- `GET /api/script-library`: Fetches all active script templates (used by room creation modal)

### When Room is Created with Library Script

1. A new `RoomScript` is created with the library script's name and description
2. All `RoomScriptLine` entries are copied from the library script
3. Users can then track progress on these test steps as normal

## Benefits

- **Consistency**: Teams can standardize testing approaches across projects
- **Efficiency**: No need to recreate common test scripts repeatedly
- **Flexibility**: Still supports custom/empty scripts for unique testing needs
- **Reusability**: Build up a library of proven test scripts over time

## Migration from Old System

Existing rooms and scripts continue to work exactly as before. This is purely an additive feature that enhances the room creation process.
