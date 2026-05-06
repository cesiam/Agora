# Commit 3 — Define database schema with pgvector and tsvector
# Message: feat: define database schema with pgvector and tsvector

# Create backend/app/db/schema.sql

cat > backend/app/db/schema.sql << 'EOF'
-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS vector;

-- Instructors
CREATE TABLE IF NOT EXISTS instructors (
  instructor_id   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name            TEXT NOT NULL,
  email           TEXT UNIQUE NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Courses
CREATE TABLE IF NOT EXISTS courses (
  course_id       UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  instructor_id   UUID REFERENCES instructors(instructor_id),
  name            TEXT NOT NULL,
  subject         TEXT,
  level           TEXT,
  rubric          JSONB,
  calibration     JSONB,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Documents (raw files uploaded by instructor)
CREATE TABLE IF NOT EXISTS documents (
  document_id     UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  course_id       UUID REFERENCES courses(course_id),
  filename        TEXT NOT NULL,
  storage_path    TEXT NOT NULL,
  uploaded_at     TIMESTAMPTZ DEFAULT NOW()
);

-- Chunks (processed from documents)
CREATE TABLE IF NOT EXISTS chunks (
  chunk_id        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  document_id     UUID REFERENCES documents(document_id),
  course_id       UUID REFERENCES courses(course_id),
  page            INT,
  chunk_index     INT,
  text            TEXT NOT NULL,
  embedding       vector(1536),
  ts              tsvector GENERATED ALWAYS AS (to_tsvector('english', text)) STORED
);

CREATE INDEX IF NOT EXISTS chunks_embedding_idx
  ON chunks USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

CREATE INDEX IF NOT EXISTS chunks_ts_idx
  ON chunks USING GIN (ts);

CREATE INDEX IF NOT EXISTS chunks_course_idx
  ON chunks (course_id);

-- Students
CREATE TABLE IF NOT EXISTS students (
  student_id      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name            TEXT NOT NULL,
  email           TEXT UNIQUE NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Sessions
CREATE TABLE IF NOT EXISTS sessions (
  session_id      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id      UUID REFERENCES students(student_id),
  course_id       UUID REFERENCES courses(course_id),
  session_mode    TEXT CHECK (session_mode IN ('practice', 'eval', 'review')),
  attempt         INT DEFAULT 1,
  transcript      JSONB,
  started_at      TIMESTAMPTZ DEFAULT NOW(),
  ended_at        TIMESTAMPTZ
);

-- Student insights (per session, per concept)
CREATE TABLE IF NOT EXISTS student_insights (
  insight_id      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id      UUID REFERENCES sessions(session_id),
  student_id      UUID REFERENCES students(student_id),
  course_id       UUID REFERENCES courses(course_id),
  insight_type    TEXT CHECK (insight_type IN ('misconception', 'knowledge_gap', 'strength', 'reasoning_error')),
  description     TEXT,
  source_quote    TEXT,
  concept_tag     TEXT,
  severity        TEXT CHECK (severity IN ('low', 'medium', 'high')),
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Student mastery (aggregate per student per concept)
CREATE TABLE IF NOT EXISTS student_mastery (
  mastery_id      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id      UUID REFERENCES students(student_id),
  course_id       UUID REFERENCES courses(course_id),
  concept_tag     TEXT NOT NULL,
  attempts        INT DEFAULT 1,
  current_severity TEXT,
  trajectory      TEXT CHECK (trajectory IN ('improving', 'stagnant', 'regressing')),
  last_session_id UUID REFERENCES sessions(session_id),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (student_id, course_id, concept_tag)
);

-- Course insights (aggregate per course per concept)
CREATE TABLE IF NOT EXISTS course_insights (
  insight_id      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  course_id       UUID REFERENCES courses(course_id),
  concept_tag     TEXT NOT NULL,
  pattern_description TEXT,
  student_count   INT DEFAULT 0,
  session_count   INT DEFAULT 0,
  last_updated    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (course_id, concept_tag)
);
EOF

# Create backend/app/db/connection.py

cat > backend/app/db/connection.py << 'EOF'
import os
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")

engine = create_async_engine(DATABASE_URL, echo=False, pool_size=10, max_overflow=20)

AsyncSessionLocal = sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
)

async def get_db():
    async with AsyncSessionLocal() as session:
        yield session
EOF

git add backend/app/db/
git commit -m "feat: define database schema with pgvector and tsvector"
