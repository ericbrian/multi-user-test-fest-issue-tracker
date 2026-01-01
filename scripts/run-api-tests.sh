#!/bin/bash

# Configuration
COMPOSE_FILE="api-tests/docker-compose.yml"
TEST_DB_URL="postgresql://postgres:testpassword@localhost:5434/api_test_fest_tracker?schema=testfest"
TEST_REDIS_URL="redis://localhost:6380"

echo "🚀 Starting API Test Environment..."

# 1. Start Docker containers
docker compose -f "$COMPOSE_FILE" up -d --wait

# 2. Push schema and seed test database
echo "📡 Syncing database schema..."
DATABASE_URL="$TEST_DB_URL" npx prisma db push --accept-data-loss
echo "🌱 Seeding database..."
DATABASE_URL="$TEST_DB_URL" node scripts/seed-test-data.js

# 3. Start the application server in the background
echo "🟢 Starting application server..."
NODE_ENV=test DATABASE_URL="$TEST_DB_URL" REDIS_URL="$TEST_REDIS_URL" node server.js &
SERVER_PID=$!

# Function to cleanup on exit
cleanup() {
    echo "🧹 Cleaning up..."
    kill "$SERVER_PID" 2>/dev/null
    docker compose -f "$COMPOSE_FILE" down
}

# Ensure cleanup happens even if tests fail
trap cleanup EXIT

# 4. Wait for server to be ready
echo "⏳ Waiting for server to be ready..."
max_attempts=30
attempt=1
while ! curl -s http://localhost:3000/health > /dev/null; do
    if [ $attempt -eq $max_attempts ]; then
        echo "❌ Server failed to start in time"
        exit 1
    fi
    printf "."
    sleep 1
    attempt=$((attempt + 1))
done
echo "✅ Server is up!"

# 5. Run tests
echo "🧪 Running API tests..."
npx httpyac run api-tests/testfest-api.http --all --env api-tests/.httpyac.env.json
TEST_RESULT=$?

if [ $TEST_RESULT -eq 0 ]; then
    echo "✅ API tests passed!"
else
    echo "❌ API tests failed!"
fi

# Cleanup will happen via trap

exit $TEST_RESULT
