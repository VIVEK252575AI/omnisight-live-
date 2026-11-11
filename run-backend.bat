@echo off
echo Starting OmniSight Backend on http://localhost:8000 ...
cd backend
.\.venv\Scripts\uvicorn.exe app.main:app --reload --host 0.0.0.0 --port 8000

