---
description: How to containerize and run the Test Fest Tracker app locally
---

## 1. Verify Dockerfile

Ensure the `Dockerfile` in the root directory is set up correctly (it currently uses `node:20-alpine` and exposes port 3000).

## 2. Build the Docker Image

Run the following command in the project root to build the image:

```bash
docker build -t test-fest-tracker:local .
```

## 3. Run the Container

You can run the container using a standalone `docker run` command, but you need to pass the environment variables. The easiest way is to use your local `.env` file.

**Note:** Since the app inside the container needs to talk to your _local_ Postgres database, you must point `DATABASE_URL` to `host.docker.internal` instead of `localhost`.

```bash
# Run with environment variables from .env, overriding DATABASE_URL
docker run --name test-fest-container \
  --env-file .env \
  -e DATABASE_URL=postgres://postgres:postgres@host.docker.internal:5432/test_fest_tracker \
  -p 3000:3000 \
  -d test-fest-tracker:local
```

_(If you are on Linux instead of Mac/Windows, use `--add-host=host.docker.internal:host-gateway`)_

## 4. Verify

- View logs: `docker logs -f test-fest-container`
- Access app: Open `http://localhost:3000`

## 5. Stop and Cleanup

```bash
docker stop test-fest-container
docker rm test-fest-container
```
