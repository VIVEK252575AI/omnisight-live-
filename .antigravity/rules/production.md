# OmniSight Production Agent Rules (Google Antigravity IDE)

## 1. Repository Map (Strict Scope)
- **Backend Root**: `backend/` (Python 3.11.9, FastAPI, SQLAlchemy 2.0, Alembic, Playwright, Gemini SDK, PyGithub)
- **Frontend Root**: `frontend/omni/frontend/` (React, Vite, Supabase Auth JS client)
- **Database Migrations**: `backend/migrations/versions/` (6 Alembic revisions)
- **Ignored Paths**: Never read or edit `backend/tests/`, `demo-app/`, `client-demo/`, `docs/week*`, or `evaluation/`.

## 2. Production Architecture Rules
1. **NO ShopLite / NO Docker-in-Docker**: Never import or call `shoplite_sandbox.py` or `ShopLiteCheckoutCollector`. Use `PlaywrightWorkspaceCollector` in `backend/app/evidence_capture.py`.
2. **Database URL Normalization**: Always normalize `postgres://` to `postgresql+psycopg://` in `backend/app/config.py`, `backend/app/db.py`, and `backend/migrations/env.py`. Always set `pool_pre_ping=True` and `pool_recycle=300`.
3. **Ephemeral Render Disk**: Render wipes disk on restart. Use `/tmp/omnisight` and `/tmp/omnisight-workspaces` for local scratch space, and upload/serve permanent artifacts via `backend/app/supabase_storage.py`.
4. **Playwright Container Flags**: Always launch Chromium with:
   `args=["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"]`
   and close `page`, `context`, and `browser` inside `try...finally` blocks.
5. **No Silent Mocks in Production**: When `OMNISIGHT_ENV=production`, `backend/app/ai/adapters/factory.py` and `patch.py` must use live `gemini` adapters and raise an error if `OMNISIGHT_GEMINI_API_KEY` is missing.
6. **Frontend API & Auth**: `frontend/omni/frontend/src/services/api.js` must read `import.meta.env.VITE_API_BASE_URL` (strip trailing slash) and attach `Authorization: Bearer <supabase_access_token>`.

