Documentation for Holokai Web Scheduler

ml_trainer folder contains the python algorithim and ai optimizer
public folder contains strictly javascript, html and css
routes folder contians the api routes

# Holokai Web Scheduler

A full-stack course scheduling app powered by Docker, Express, PostgreSQL, and a custom ML optimization service.

## Project Structure

- `ml_trainer/` - Python algorithm for schedule optimization (served via Flask + Gunicorn)
- `public/` - Frontend static files (HTML, CSS, JS)
- `routes/` - API endpoints used by the frontend
- `server.js` - Main Express.js server file
- `docker-compose.yml` - Defines and coordinates services (web, ML, database)
- `Dockerfile` - Builds the Express backend container
- `db/` - SQL scripts for database initialization
