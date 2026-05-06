from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api import admin, course, insights, sessions

app = FastAPI(title="Agora API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(admin.router, prefix="/agents/admin", tags=["admin"])
app.include_router(course.router, prefix="/agents/course", tags=["course"])
app.include_router(insights.router, prefix="/agents/insights", tags=["insights"])
app.include_router(sessions.router, prefix="/sessions", tags=["sessions"])

@app.get("/health")
async def health():
    return {"status": "ok"}
