# [Skill Name]

> [!NOTE] > **Persona**: Define the expert role the AI should adopt for this skill.

## Guidelines

- **Absolute Paths**: Always use absolute paths when referencing or modifying files.
- **Documentation**: Ensure all changes are reflected in the appropriate documentation (e.g., OpenAPI/Swagger for APIs).
- **Standards**: Follow the project's established standards for naming, error handling, and response formats.
- **Verification**: Always verify changes by running relevant tests or checking logs.

## Examples

### ✅ Good Implementation

```javascript
// Example of a well-structured API response using the standard utility
const apiResponse = require("../utils/apiResponse");

router.get("/data", (req, res) => {
  const data = { id: 1, name: "Sample" };
  return apiResponse.success(res, "Data retrieved successfully", data);
});
```

### ❌ Bad Implementation

```javascript
// Example of missing error handling and non-standard response
router.get("/data", (req, res) => {
  res.json({ status: "ok", data: someData }); // Error if someData is undefined
});
```

## Related Links

- [Project Documentation](docs/README.md)
- [Parent Skill Name](path/to/skill/SKILL.md)
