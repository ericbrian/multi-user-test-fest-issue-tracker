/**
 * Room Management Service
 * Handles business logic for rooms and test scripts
 */

const { v4: uuidv4 } = require('uuid');

class RoomService {
  constructor(prisma) {
    this.prisma = prisma;
  }

  /**
   * Get all rooms with member counts
   * @returns {Promise<Array>} - Array of rooms
   */
  async getAllRooms() {
    const rooms = await this.prisma.room.findMany({
      orderBy: { created_at: 'desc' },
      include: { _count: { select: { members: true } } },
    });

    return rooms.map((room) => ({
      ...room,
      member_count: String(room._count?.members || 0),
    }));
  }

  /**
   * Create a new room with optional test script
   * @param {Object} data - Room creation data
   * @returns {Promise<Object>} - Created room
   */
  async createRoom(data) {
    const { name, description, scriptId, userId } = data;
    const roomId = uuidv4();

    // Create the room
    await this.prisma.room.create({
      data: { id: roomId, name, created_by: userId },
    });

    // Create test script
    await this.createTestScript(roomId, name, description, scriptId);

    // Add creator as member (always groupier)
    await this.addRoomMember(roomId, userId, true);

    return { id: roomId, name, created_by: userId };
  }

  /**
   * Create test script for a room
   * @param {string} roomId - Room UUID
   * @param {string} name - Room/script name
   * @param {string} description - Room/script description
   * @param {string} scriptId - Optional library script ID
   * @private
   */
  async createTestScript(roomId, name, description, scriptId) {
    const testScriptId = uuidv4();

    if (scriptId) {
      // User selected a script from the library
      const libraryScript = await this.prisma.scriptLibrary.findUnique({
        where: { id: scriptId },
        include: { lines: { orderBy: { line_number: 'asc' } } },
      });

      if (libraryScript) {
        // Create test script with library script name and description
        await this.prisma.testScript.create({
          data: {
            id: testScriptId,
            room_id: roomId,
            script_id: 1,
            name: libraryScript.name,
            description: libraryScript.description,
          },
        });

        // Copy lines from library script
        for (const libraryLine of libraryScript.lines) {
          await this.prisma.testScriptLine.create({
            data: {
              id: uuidv4(),
              test_script_id: testScriptId,
              test_script_line_id: libraryLine.line_number,
              name: libraryLine.name,
              description: libraryLine.description,
              notes: libraryLine.notes,
            },
          });
        }
        return;
      }
    }

    // Create empty test script (fallback or no script selected)
    await this.prisma.testScript.create({
      data: {
        id: testScriptId,
        room_id: roomId,
        script_id: 1,
        name: name,
        description: description,
      },
    });
  }

  /**
   * Add a member to a room
   * @param {string} roomId - Room UUID
   * @param {string} userId - User UUID
   * @param {boolean} isGroupier - Whether user is groupier
   * @returns {Promise<void>}
   */
  async addRoomMember(roomId, userId, isGroupier = false) {
    try {
      await this.prisma.roomMember.create({
        data: { room_id: roomId, user_id: userId, is_groupier: isGroupier },
      });
    } catch (err) {
      // Member might already exist, log but don't fail
      console.error('Failed to add room member (may already exist):', err.message);
    }
  }

  /**
   * Join a room (upsert membership)
   * @param {string} roomId - Room UUID
   * @param {string} userId - User UUID
   * @param {Array<string>} groupierEmails - List of groupier emails
   * @param {string} userEmail - User's email
   * @returns {Promise<Object>} - Result with isGroupier flag
   */
  async joinRoom(roomId, userId, groupierEmails, userEmail) {
    // Check if user created the room
    const room = await this.prisma.room.findUnique({ where: { id: roomId } });
    const isRoomCreator = room && room.created_by === userId;

    // Determine if user should be groupier
    const isGroupier =
      groupierEmails.includes((userEmail || '').toLowerCase()) || isRoomCreator;

    // Upsert membership
    await this.prisma.roomMember.upsert({
      where: { room_id_user_id: { room_id: roomId, user_id: userId } },
      update: { is_groupier: isGroupier },
      create: { room_id: roomId, user_id: userId, is_groupier: isGroupier },
    });

    return { ok: true, isGroupier };
  }

  /**
   * Check if user is a member of a room
   * @param {string} roomId - Room UUID
   * @param {string} userId - User UUID
   * @returns {Promise<boolean>}
   */
  async isMember(roomId, userId) {
    const membership = await this.prisma.roomMember.findUnique({
      where: { room_id_user_id: { room_id: roomId, user_id: userId } },
    });
    return !!membership;
  }

  /**
   * Check if user is a groupier in a room
   * @param {string} roomId - Room UUID
   * @param {string} userId - User UUID
   * @returns {Promise<boolean>}
   */
  async isGroupier(roomId, userId) {
    const membership = await this.prisma.roomMember.findUnique({
      where: { room_id_user_id: { room_id: roomId, user_id: userId } },
    });
    return !!(membership && membership.is_groupier);
  }
}

module.exports = { RoomService };
