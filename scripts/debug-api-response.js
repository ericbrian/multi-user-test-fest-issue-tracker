
const axios = require('axios');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function debugApi() {
    try {
        console.log('--- Debugging API Response ---');

        // 1. Get the room
        const room = await prisma.room.findFirst();
        if (!room) {
            console.error('No room found in DB');
            return;
        }
        console.log(`Room: ${room.name} (${room.id})`);

        // 2. Get a user
        const user = await prisma.user.findFirst();
        if (!user) {
            console.error('No user found');
            return;
        }

        // 3. Simulate the API call logic directly (since we can't easily auth with axios against the running server without a token)
        // We will use the service directly to see what the JSON structure looks like.

        const { RoomService } = require('../src/services/roomService');
        const roomService = new RoomService(prisma);

        const lines = await roomService.getTestScriptLines(room.id, user.id);
        console.log(`Service returned ${lines.length} lines.`);

        if (lines.length > 0) {
            console.log('First line structure:', JSON.stringify(lines[0], null, 2));
        }

    } catch (error) {
        console.error('Error debugging API:', error);
    } finally {
        await prisma.$disconnect();
    }
}

debugApi();
