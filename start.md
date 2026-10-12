Getting Started with Docker Compose
A complete local development environment is provided via Docker Compose, running the backend, frontend, PostgreSQL, and Redis.

Prerequisites
Docker and Docker Compose installed.
Setup
Copy the example environment variables:
cp .env.example .env
(Optional) Adjust .env variables if necessary.
Running the Stack
To build and start the entire stack:

docker compose up --build
The services will be available at:

Frontend: http://localhost:3000
Backend API: http://localhost:3001
PostgreSQL: localhost:5432
Redis: localhost:6379
Stopping Services
To stop the stack without losing database data:

docker compose stop
To stop and remove containers (data in volumes remains):

docker compose down
Rebuilding
If you change package.json or Dockerfiles:

docker compose up --build
Troubleshooting
Database Connection Issues: Ensure POSTGRES_USER and POSTGRES_PASSWORD in .env match what's expected.
Port Conflicts: If ports 3000, 3001, 5432, or 6379 are already in use, you may need to stop local services or change the port mappings in docker-compose.yml.
Logs: View logs for a specific service using docker compose logs -f <service_name> (e.g., docker compose logs -f fluxapay_backend).
