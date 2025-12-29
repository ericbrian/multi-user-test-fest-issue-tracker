# Service Layer Migration Guide

The business logic has been extracted into service classes, but the routes still need to be refactored to use them. This guide explains how to complete that migration.

## Current State

✅ **Service classes created**:

- `src/services/jiraService.js`
- `src/services/issueService.js`
- `src/services/roomService.js`

❌ **Routes still contain inline logic**:

- `src/routes.js` has not been refactored yet

## Benefits of Completing Migration

1. **Testability**: Services can be tested independently
2. **Reusability**: Business logic can be used in multiple routes
3. **Maintainability**: Changes to business logic don't require route changes
4. **Separation of Concerns**: Routes handle HTTP, services handle business logic

## How to Use Services in Routes

### Example: Refactoring Room Creation

**Before** (current code in routes.js):

```javascript
app.post('/api/rooms', requireAuth, async (req, res) => {
  try {
    const prisma = getPrisma();
    const rawName = (req.body.name || '').trim();
    const name = sanitizeHtml(rawName) || `Room ${new Date().toLocaleString()}`;
    const description = req.body.description ? sanitizeHtml(req.body.description.trim()) : null;
    const selectedScriptId = req.body.scriptId || null;

    const roomId = uuidv4();
    const userId = req.user.id;

    // Create the room
    await prisma.room.create({ data: { id: roomId, name, created_by: userId } });

    // ... 50+ more lines of logic ...
    
    res.json({ id: roomId, name, created_by: userId });
  } catch (error) {
    console.error('Error creating room:', error);
    res.status(500).json({ error: 'Failed to create room' });
  }
});
```

**After** (using RoomService):

```javascript
app.post('/api/rooms', requireAuth, async (req, res) => {
  try {
    const rawName = (req.body.name || '').trim();
    const name = sanitizeHtml(rawName) || `Room ${new Date().toLocaleString()}`;
    const description = req.body.description ? sanitizeHtml(req.body.description.trim()) : null;
    const scriptId = req.body.scriptId || null;

    const room = await roomService.createRoom({
      name,
      description,
      scriptId,
      userId: req.user.id,
    });

    res.json(room);
  } catch (error) {
    console.error('Error creating room:', error);
    res.status(500).json({ error: 'Failed to create room' });
  }
});
```

### Example: Refactoring Jira Integration

**Before** (current code in routes.js, ~100 lines):

```javascript
app.post('/api/issues/:id/jira', requireAuth, async (req, res) => {
  try {
    // ... authorization checks ...
    
    // ... 80+ lines of Jira API logic ...
    
    res.json({ jira_key: jiraKey });
  } catch (error) {
    // ... complex error handling ...
  }
});
```

**After** (using JiraService):

```javascript
app.post('/api/issues/:id/jira', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { roomId } = req.body;
    
    // Authorization check
    const isGroupier = await roomService.isGroupier(roomId, req.user.id);
    if (!isGroupier) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    // Get issue
    const issue = await issueService.getIssue(id);
    if (!issue) {
      return res.status(404).json({ error: 'Issue not found' });
    }

    if (issue.jira_key) {
      return res.json({ jira_key: issue.jira_key });
    }

    // Create in Jira using service
    const room = await roomService.getRoom(roomId);
    const jiraKey = await jiraService.createIssue(issue, room.name);
    
    // Update issue with Jira key
    const updatedIssue = await issueService.updateJiraKey(id, jiraKey);
    
    io.to(roomId).emit('issue:update', updatedIssue);
    res.json({ jira_key: jiraKey });
  } catch (error) {
    console.error('Error in Jira integration:', error);
    res.status(500).json({ error: error.message || 'Failed to create Jira issue' });
  }
});
```

## Step-by-Step Migration

### 1. Initialize Services in registerRoutes

At the top of `registerRoutes` function:

```javascript
function registerRoutes(app, deps) {
  const { pool, io, upload, uploadsDir, TAGS, /* ... */ } = deps;
  
  const { requireAuth } = require('./middleware');
  const { authLimiter, issueCreationLimiter, uploadLimiter } = require('./rateLimiter');
  const { getPrisma } = require('./prismaClient');
  
  // Initialize services
  const { JiraService } = require('./services/jiraService');
  const { IssueService } = require('./services/issueService');
  const { RoomService } = require('./services/roomService');
  
  const prisma = getPrisma();
  const jiraService = new JiraService({
    JIRA_BASE_URL,
    JIRA_EMAIL,
    JIRA_API_TOKEN,
    JIRA_PROJECT_KEY,
    JIRA_ISSUE_TYPE,
    uploadsDir,
  });
  const issueService = new IssueService(prisma, uploadsDir);
  const roomService = new RoomService(prisma);
  
  // ... rest of routes
}
```

### 2. Refactor Routes One at a Time

Start with simpler routes and work toward more complex ones:

#### Easy (Start Here)

1. `GET /api/rooms` → Use `roomService.getAllRooms()`
2. `GET /api/rooms/:roomId/issues` → Use `issueService.getRoomIssues()`
3. `DELETE /api/issues/:id` → Use `issueService.deleteIssue()`

#### Medium

4. `POST /api/rooms/:roomId/join` → Use `roomService.joinRoom()`
5. `POST /api/issues/:id/status` → Use `issueService.updateStatus()`

#### Complex

6. `POST /api/rooms` → Use `roomService.createRoom()`
7. `POST /api/rooms/:roomId/issues` → Use `issueService.createIssue()`
8. `POST /api/issues/:id/jira` → Use `jiraService.createIssue()`

### 3. Add Missing Service Methods

You may need to add methods to services that weren't initially created:

```javascript
// In IssueService
async getIssue(issueId) {
  const issue = await this.prisma.issue.findUnique({
    where: { id: issueId },
    include: { createdBy: { select: { name: true, email: true } } },
  });
  
  if (!issue) return null;
  return this.formatIssueForClient(issue);
}
```

```javascript
// In RoomService
async getRoom(roomId) {
  return await this.prisma.room.findUnique({
    where: { id: roomId }
  });
}
```

### 4. Update Tests

As you refactor routes, update the integration tests to test the routes, and ensure unit tests cover the services:

```javascript
// __tests__/unit/roomService.test.js
describe('RoomService', () => {
  test('createRoom should create room with test script', async () => {
    const mockPrisma = {
      room: { create: jest.fn() },
      testScript: { create: jest.fn() },
      roomMember: { create: jest.fn() },
    };
    
    const roomService = new RoomService(mockPrisma);
    
    const result = await roomService.createRoom({
      name: 'Test Room',
      description: 'Test',
      scriptId: null,
      userId: 'user-123',
    });
    
    expect(result).toHaveProperty('id');
    expect(mockPrisma.room.create).toHaveBeenCalled();
  });
});
```

## Testing Strategy

1. **Before Refactoring**: Ensure current functionality works
2. **During Refactoring**:
   - Write/update unit tests for service methods
   - Write/update integration tests for routes
   - Test manually in development
3. **After Refactoring**:
   - Run full test suite
   - Verify all functionality still works
   - Check for any edge cases

## Common Patterns

### Error Handling

```javascript
try {
  const result = await service.someMethod(data);
  res.json(result);
} catch (error) {
  console.error('Error in route:', error);
  res.status(500).json({ 
    error: error.message || 'Generic error message' 
  });
}
```

### Authorization

```javascript
// Check groupier status
const isGroupier = await roomService.isGroupier(roomId, req.user.id);
if (!isGroupier) {
  return res.status(403).json({ error: 'Forbidden' });
}

// Check membership
const isMember = await roomService.isMember(roomId, req.user.id);
if (!isMember) {
  return res.status(403).json({ error: 'Not a member of this room' });
}
```

### Socket.IO Emission

```javascript
// After updating data, emit to room
const result = await service.updateSomething(id, data);
io.to(roomId).emit('event:name', result);
res.json(result);
```

## Benefits After Migration

- ✅ Routes are thin HTTP handlers (5-20 lines each)
- ✅ Business logic is testable independently
- ✅ Changes to logic don't affect route structure
- ✅ Services can be reused across multiple routes
- ✅ Easier to add new features
- ✅ Better code organization

## Timeline Estimate

- **Easy routes**: 30 minutes each
- **Medium routes**: 1 hour each
- **Complex routes**: 2-3 hours each
- **Testing**: 2-4 hours
- **Total**: 8-12 hours of development time

## Questions?

Refer to the service class implementations for method signatures and usage examples. All services have JSDoc comments explaining parameters and return values.
