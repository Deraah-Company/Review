@echo off
cd /d "%~dp0"
docker compose up -d --build
if errorlevel 1 (
  echo Open Docker Desktop and try again.
  pause
  exit /b 1
)
start "" "http://localhost:3001"
