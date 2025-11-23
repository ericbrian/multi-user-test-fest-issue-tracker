const express = require('express');
const { v4: uuidv4 } = require('uuid');
const xss = require('xss');
const { getPrisma } = require('../prismaClient');
const { requireAuth } = require('../middleware');
const { RoomService } = require('../services/roomService');
const { ApiError } = require('../utils/apiResponse');

function registerRoomRoutes(router, deps) {
  const {
    io,
    GROUPIER_EMAILS_LIST // I'll need to pass this or parse it from env again.
    // Actually, in the original code it parsed process.env.GROUPIER_EMAILS inside the route.
    // I'll stick to that for now or pass it in deps if available.
  } = deps;

  const prisma = getPrisma();
  const roomService = new RoomService(prisma);

  /**
   * @openapi
   * /api/script-library:
   *   get:
   *     tags:
   *       - Rooms
   *     summary: Get all test scripts
   *     description: Retrieves the library of available test scripts that can be used when creating rooms.
   *     security:
   *       - cookieAuth: []
   *     responses:
   *       200:
   *         description: List of test scripts
   *         content:
   *           application/json:
   *             schema:
   *               type: array
   *               items:
   *                 $ref: '#/components/schemas/TestScript'
   *       500:
   *         description: Server error
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   */
  router.get('/api/script-library', requireAuth, async (req, res) => {
    try {
      const result = await roomService.getScriptLibrary();
      res.json(result);
    } catch (error) {
      console.error('Error fetching script library:', error);
      return ApiError.database(res, 'Failed to fetch script library');
    }
  });

  /**
   * @openapi
   * /api/rooms:
   *   get:
   *     tags:
   *       - Rooms
   *     summary: Get all rooms
   *     description: Retrieves all available test fest rooms.
   *     security:
   *       - cookieAuth: []
   *     responses:
   *       200:
   *         description: List of rooms
   *         content:
   *           application/json:
   *             schema:
   *               type: array
   *               items:
   *                 $ref: '#/components/schemas/Room'
   *       500:
   *         description: Server error
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   */
  router.get('/api/rooms', requireAuth, async (req, res) => {
    try {
      const result = await roomService.getAllRooms();
      res.json(result);
    } catch (error) {
      console.error('Error fetching rooms:', error);
      return ApiError.database(res, 'Failed to fetch rooms');
    }
  });

  /**
   * @openapi
   * /api/rooms:
   *   post:
   *     tags:
   *       - Rooms
   *     summary: Create a new room
   *     description: Creates a new test fest room. The creator automatically becomes a groupier (admin) of the room.
   *     security:
   *       - cookieAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - name
   *             properties:
   *               name:
   *                 type: string
   *                 description: Room name (will be sanitized)
   *                 example: "Sprint 42 Test Fest"
   *               description:
   *                 type: string
   *                 nullable: true
   *                 description: Optional room description
   *                 example: "Testing new payment features"
   *               scriptId:
   *                 type: string
   *                 format: uuid
   *                 nullable: true
   *                 description: Optional test script to associate with room
   *     responses:
   *       200:
   *         description: Room created successfully
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Room'
   *       500:
   *         description: Server error
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   */
  router.post('/api/rooms', requireAuth, async (req, res) => {
    try {
      // Sanitize inputs to prevent XSS using xss library
      const rawName = (req.body.name || '').trim();
      const name = xss(rawName) || `Room ${new Date().toLocaleString()}`;
      const description = req.body.description ? xss(req.body.description.trim()) : null;
      const scriptId = req.body.scriptId || null;
      const userId = req.user.id;

      const room = await roomService.createRoom({
        name,
        description,
        scriptId,
        userId
      });

      res.json(room);
    } catch (error) {
      console.error('Error creating room:', error);
      return ApiError.internal(res, 'Failed to create room', error.message);
    }
  });

  /**
   * @openapi
   * /api/rooms/{roomId}/join:
   *   post:
   *     tags:
   *       - Rooms
   *     summary: Join a room
   *     description: Adds the current user as a member of the specified room. Users with groupier emails are automatically granted groupier (admin) privileges.
   *     security:
   *       - cookieAuth: []
   *     parameters:
   *       - in: path
   *         name: roomId
   *         required: true
   *         schema:
   *           type: string
   *           format: uuid
   *         description: Room ID to join
   *     responses:
   *       200:
   *         description: Successfully joined room
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 room_id:
   *                   type: string
   *                   format: uuid
   *                 user_id:
   *                   type: string
   *                   format: uuid
   *                 is_groupier:
   *                   type: boolean
   *                   description: Whether user has groupier privileges
   *                 joined_at:
   *                   type: string
   *                   format: date-time
   *       500:
   *         description: Server error
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   */
  router.post('/api/rooms/:roomId/join', requireAuth, async (req, res) => {
    try {
      const { roomId } = req.params;
      const userId = req.user.id;
      const userEmail = req.user.email;

      // Use passed list or fallback to env
      const groupierEmails = GROUPIER_EMAILS_LIST || (process.env.GROUPIER_EMAILS || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);

      const result = await roomService.joinRoom(roomId, userId, groupierEmails, userEmail);
      res.json(result);
    } catch (error) {
      console.error('Error joining room:', error);
      return ApiError.internal(res, 'Failed to join room', error.message);
    }
  });

  /**
   * @openapi
   * /api/rooms/{roomId}/test-script-lines:
   *   get:
   *     tags:
   *       - Rooms
   *     summary: Get test script lines for a room
   *     description: Retrieves all test script lines for the room's associated test script, including progress tracking for the current user.
   *     security:
   *       - cookieAuth: []
   *     parameters:
   *       - in: path
   *         name: roomId
   *         required: true
   *         schema:
   *           type: string
   *           format: uuid
   *         description: Room ID
   *     responses:
   *       200:
   *         description: List of test script lines with progress
   *         content:
   *           application/json:
   *             schema:
   *               type: array
   *               items:
   *                 $ref: '#/components/schemas/TestScriptLine'
   *       500:
   *         description: Server error
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   */
  router.get('/api/rooms/:roomId/test-script-lines', requireAuth, async (req, res) => {
    try {
      const { roomId } = req.params;
      const userId = req.user.id;

      const result = await roomService.getTestScriptLines(roomId, userId);
      res.json(result);
    } catch (error) {
      console.error('Error fetching test script lines:', error);
      return ApiError.database(res, 'Failed to fetch test script lines');
    }
  });

  /**
   * @openapi
   * /api/test-script-lines/{lineId}/progress:
   *   post:
   *     tags:
   *       - Rooms
   *     summary: Update test script line progress
   *     description: Updates the current user's progress on a specific test script line. Emits real-time update via Socket.IO.
   *     security:
   *       - cookieAuth: []
   *     parameters:
   *       - in: path
   *         name: lineId
   *         required: true
   *         schema:
   *           type: string
   *           format: uuid
   *         description: Test script line ID
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               is_checked:
   *                 type: boolean
   *                 description: Whether the line is marked as completed
   *                 example: true
   *               notes:
   *                 type: string
   *                 nullable: true
   *                 description: Optional notes about this test step
   *                 example: "Verified on Chrome and Firefox"
   *     responses:
   *       200:
   *         description: Progress updated successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 user_id:
   *                   type: string
   *                   format: uuid
   *                 test_script_line_id:
   *                   type: string
   *                   format: uuid
   *                 is_checked:
   *                   type: boolean
   *                 checked_at:
   *                   type: string
   *                   format: date-time
   *                   nullable: true
   *                 notes:
   *                   type: string
   *                   nullable: true
   *       403:
   *         description: User is not a member of the room
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   *       404:
   *         description: Test script line not found
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   *       500:
   *         description: Server error
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   */
  router.post('/api/test-script-lines/:lineId/progress', requireAuth, async (req, res) => {
    try {
      const { lineId } = req.params;
      const { is_checked, notes } = req.body;
      const userId = req.user.id;

      const { progress, roomId } = await roomService.updateTestScriptLineProgress(
        lineId,
        userId,
        is_checked,
        notes
      );

      // Emit socket notification
      io.to(roomId).emit('testScriptLine:progress', {
        lineId,
        userId,
        is_checked: progress.is_checked,
        checked_at: progress.checked_at,
        notes: progress.notes
      });

      res.json(progress);
    } catch (error) {
      console.error('Error updating test script line progress:', error);
      if (error.message === 'Test script line not found') {
        return ApiError.notFound(res, 'Test script line');
      }
      if (error.message === 'You must be a member of this room to update test progress') {
        return ApiError.insufficientPermissions(res, error.message);
      }
      return ApiError.internal(res, 'Failed to update progress', error.message);
    }
  });
}

module.exports = registerRoomRoutes;
