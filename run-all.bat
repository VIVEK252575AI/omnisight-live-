@echo off
echo ============================================================
echo Starting OmniSight Full-Stack Environment (Backend + Frontend)
echo ============================================================
start "OmniSight Backend" cmd /k "cd backend && .\.venv\Scripts\uvicorn.exe app.main:app --reload --host 0.0.0.0 --port 8000"
start "OmniSight Frontend" cmd /k "cd frontend\omni\frontend && npm run dev"
echo.
echo Servers launching in separate windows:
echo - Backend:  http://localhost:8000 (API Docs: http://localhost:8000/docs)
echo - Frontend: http://localhost:5173
echo.
pause

