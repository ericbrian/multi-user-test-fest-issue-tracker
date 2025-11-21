const express = require('express');
const { v4: uuidv4 } = require('uuid');
const xss = require('xss');
const { getPrisma } = require('../prismaClient');
const { requireAuth } = require('../middleware');
const { RoomService } = require('../services/roomService');

function registerRoomRoutes(router, deps) {
  const {
    io,
    GROUPIER_EMAILS_LIST // I'll need to pass this or parse it from env again.
    // Actually, in the original code it parsed process.env.GROUPIER_EMAILS inside the route.
    // I'll stick to that for now or pass it in deps if available.
  } = deps;

  const prisma = getPrisma();
  const roomService = new RoomService(prisma);

  // Script Library
  router.get('/api/script-library', requireAuth, async (req, res) => {
    try {
      const result = await roomService.getScriptLibrary();
      res.json(result);
    } catch (error) {
      console.error('Error fetching script library:', error);
      res.status(500).json({ error: 'Failed to fetch script library' });
    }
  });

  // Rooms
  router.get('/api/rooms', requireAuth, async (req, res) => {
    try {
      const result = await roomService.getAllRooms();
      res.json(result);
    } catch (error) {
      console.error('Error fetching rooms:', error);
      res.status(500).json({ error: 'Failed to fetch rooms' });
    }
  });

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
      res.status(500).json({ error: 'Failed to create room' });
    }
  });

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
      res.status(500).json({ error: 'Failed to join room' });
    }
  });

  // Test Script Lines
  router.get('/api/rooms/:roomId/test-script-lines', requireAuth, async (req, res) => {
    try {
      const { roomId } = req.params;
      const userId = req.user.id;

      const result = await roomService.getTestScriptLines(roomId, userId);
      res.json(result);
    } catch (error) {
      console.error('Error fetching test script lines:', error);
      res.status(500).json({ error: 'Failed to fetch test script lines' });
    }
  });

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
        return res.status(404).json({ error: error.message });
      }
      if (error.message === 'You must be a member of this room to update test progress') {
        return res.status(403).json({ error: error.message });
      }
      res.status(500).json({ error: 'Failed to update progress' });
    }
  });
}

module.exports = registerRoomRoutes;
