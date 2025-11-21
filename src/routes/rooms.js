const express = require('express');
const { v4: uuidv4 } = require('uuid');
const xss = require('xss');
const { getPrisma } = require('../prismaClient');
const { requireAuth } = require('../middleware');

function registerRoomRoutes(router, deps) {
  const {
    io,
    GROUPIER_EMAILS_LIST // I'll need to pass this or parse it from env again.
    // Actually, in the original code it parsed process.env.GROUPIER_EMAILS inside the route.
    // I'll stick to that for now or pass it in deps if available.
  } = deps;

  // Script Library
  router.get('/api/script-library', requireAuth, async (req, res) => {
    try {
      const prisma = getPrisma();
      const scripts = await prisma.scriptLibrary.findMany({
        where: { is_active: true },
        orderBy: { name: 'asc' },
        include: {
          _count: { select: { lines: true } }
        }
      });
      const result = scripts.map((s) => ({
        ...s,
        line_count: s._count?.lines || 0
      }));
      res.json(result);
    } catch (error) {
      console.error('Error fetching script library:', error);
      res.status(500).json({ error: 'Failed to fetch script library' });
    }
  });

  // Rooms
  router.get('/api/rooms', requireAuth, async (req, res) => {
    try {
      const prisma = getPrisma();
      const rooms = await prisma.room.findMany({
        orderBy: { created_at: 'desc' },
        include: { _count: { select: { members: true } } },
      });
      const result = rooms.map((r) => ({ ...r, member_count: String(r._count?.members || 0) }));
      res.json(result);
    } catch (error) {
      console.error('Error fetching rooms:', error);
      res.status(500).json({ error: 'Failed to fetch rooms' });
    }
  });

  router.post('/api/rooms', requireAuth, async (req, res) => {
    try {
      const prisma = getPrisma();
      // Sanitize inputs to prevent XSS using xss library
      const rawName = (req.body.name || '').trim();
      const name = xss(rawName) || `Room ${new Date().toLocaleString()}`;
      const description = req.body.description ? xss(req.body.description.trim()) : null;
      const selectedScriptId = req.body.scriptId || null;

      const roomId = uuidv4();
      const userId = req.user.id;

      // Create the room
      await prisma.room.create({ data: { id: roomId, name, created_by: userId } });

      // Create test script based on selection
      const testScriptId = uuidv4();
      if (selectedScriptId) {
        // User selected a script from the library
        const libraryScript = await prisma.scriptLibrary.findUnique({
          where: { id: selectedScriptId },
          include: { lines: { orderBy: { line_number: 'asc' } } }
        });

        if (libraryScript) {
          // Create test script with library script name and description
          await prisma.testScript.create({
            data: {
              id: testScriptId,
              room_id: roomId,
              script_id: 1,
              name: libraryScript.name,
              description: libraryScript.description,
            }
          });

          // Copy lines from library script to test script
          for (const libraryLine of libraryScript.lines) {
            await prisma.testScriptLine.create({
              data: {
                id: uuidv4(),
                test_script_id: testScriptId,
                test_script_line_id: libraryLine.line_number,
                name: libraryLine.name,
                description: libraryLine.description,
                notes: libraryLine.notes,
              }
            });
          }
        } else {
          // Fallback: create empty script if library script not found
          await prisma.testScript.create({
            data: {
              id: testScriptId,
              room_id: roomId,
              script_id: 1,
              name: name,
              description: description,
            }
          });
        }
      } else {
        // No script selected, create empty test script
        await prisma.testScript.create({
          data: {
            id: testScriptId,
            room_id: roomId,
            script_id: 1,
            name: name,
            description: description,
          }
        });
      }

      // Room creator is always a groupier (they just created this room)
      const isGroupier = true;
      // creator joins as member
      await prisma.roomMember.create({ data: { room_id: roomId, user_id: userId, is_groupier: isGroupier } }).catch((err) => {
        console.error('Failed to add room creator as member (may already exist):', err.message);
      });

      res.json({ id: roomId, name, created_by: userId });
    } catch (error) {
      console.error('Error creating room:', error);
      res.status(500).json({ error: 'Failed to create room' });
    }
  });

  router.post('/api/rooms/:roomId/join', requireAuth, async (req, res) => {
    try {
      const { roomId } = req.params;
      const prisma = getPrisma();

      // Check if this user created the room
      const room = await prisma.room.findUnique({ where: { id: roomId } });
      const isRoomCreator = room && room.created_by === req.user.id;

      const GROUPIER_EMAILS = (process.env.GROUPIER_EMAILS || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
      const isGroupier = GROUPIER_EMAILS.includes((req.user.email || '').toLowerCase()) || isRoomCreator;

      await prisma.roomMember.upsert({
        where: { room_id_user_id: { room_id: roomId, user_id: req.user.id } },
        update: { is_groupier: isGroupier },
        create: { room_id: roomId, user_id: req.user.id, is_groupier: isGroupier },
      });
      res.json({ ok: true, isGroupier });
    } catch (error) {
      console.error('Error joining room:', error);
      res.status(500).json({ error: 'Failed to join room' });
    }
  });

  // Test Script Lines
  router.get('/api/rooms/:roomId/test-script-lines', requireAuth, async (req, res) => {
    try {
      const { roomId } = req.params;
      const prisma = getPrisma();
      const userId = req.user.id;

      const testScriptLines = await prisma.testScriptLine.findMany({
        where: {
          testScript: {
            room_id: roomId
          }
        },
        include: {
          testScript: true,
          progress: {
            where: {
              user_id: userId
            }
          }
        },
        orderBy: [
          { testScript: { script_id: 'asc' } },
          { test_script_line_id: 'asc' }
        ]
      });

      const result = testScriptLines.map(line => ({
        ...line,
        is_checked: line.progress.length > 0 ? line.progress[0].is_checked : false,
        checked_at: line.progress.length > 0 ? line.progress[0].checked_at : null,
        progress_notes: line.progress.length > 0 ? line.progress[0].notes : null
      }));

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
      const prisma = getPrisma();
      const userId = req.user.id;

      // First, verify the test script line exists and get the room_id
      const testScriptLine = await prisma.testScriptLine.findUnique({
        where: { id: lineId },
        include: { testScript: true }
      });

      if (!testScriptLine) {
        return res.status(404).json({ error: 'Test script line not found' });
      }

      // Verify user is a member of the room
      const membership = await prisma.roomMember.findUnique({
        where: {
          room_id_user_id: {
            room_id: testScriptLine.testScript.room_id,
            user_id: userId
          }
        }
      });

      if (!membership) {
        return res.status(403).json({ error: 'You must be a member of this room to update test progress' });
      }

      const progressData = {
        is_checked: Boolean(is_checked),
        checked_at: is_checked ? new Date() : null,
        notes: notes || null,
        updated_at: new Date()
      };

      const existingProgress = await prisma.testScriptLineProgress.findUnique({
        where: {
          user_id_test_script_line_id: {
            user_id: userId,
            test_script_line_id: lineId
          }
        }
      });

      let progress;
      if (existingProgress) {
        progress = await prisma.testScriptLineProgress.update({
          where: {
            user_id_test_script_line_id: {
              user_id: userId,
              test_script_line_id: lineId
            }
          },
          data: progressData
        });
      } else {
        progress = await prisma.testScriptLineProgress.create({
          data: {
            id: uuidv4(),
            user_id: userId,
            test_script_line_id: lineId,
            ...progressData
          }
        });
      }

      // Emit socket notification (testScriptLine already fetched above for auth check)
      io.to(testScriptLine.testScript.room_id).emit('testScriptLine:progress', {
        lineId,
        userId,
        is_checked: progress.is_checked,
        checked_at: progress.checked_at,
        notes: progress.notes
      });

      res.json(progress);
    } catch (error) {
      console.error('Error updating test script line progress:', error);
      res.status(500).json({ error: 'Failed to update progress' });
    }
  });
}

module.exports = registerRoomRoutes;
