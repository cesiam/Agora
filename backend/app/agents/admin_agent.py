import os
import uuid
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from app.models.admin import IngestResponse
from app.services.llm import openai_client

BUCKET = os.getenv("AWS_BUCKET_NAME")
CHUNK_SIZE = 400
CHUNK_OVERLAP = 50


def parse_and_chunk(text: str) -> list[str]:
    words = text.split()
    chunks = []
    i = 0
    while i < len(words):
        chunk = " ".join(words[i : i + CHUNK_SIZE])
        chunks.append(chunk)
        i += CHUNK_SIZE - CHUNK_OVERLAP
    return chunks


async def embed(text: str) -> list[float]:
    response = await openai_client.embeddings.create(
        model="text-embedding-3-small",
        input=text,
    )
    return response.data[0].embedding


async def ingest_document(
    file_bytes: bytes,
    filename: str,
    file_text: str,
    course_id: str,
    instructor_id: str,
    db: AsyncSession,
) -> IngestResponse:
    document_id = str(uuid.uuid4())
    storage_path = f"courses/{course_id}/{document_id}/{filename}"

    # 1. Upload raw file to object storage (skipped if AWS not configured)
    if BUCKET:
        import boto3
        s3 = boto3.client("s3",
            aws_access_key_id=os.getenv("AWS_ACCESS_KEY_ID"),
            aws_secret_access_key=os.getenv("AWS_SECRET_ACCESS_KEY"),
            region_name=os.getenv("AWS_REGION"),
        )
        s3.put_object(Bucket=BUCKET, Key=storage_path, Body=file_bytes)

    # 2. Insert document record
    await db.execute(
        text("""
            INSERT INTO documents (document_id, course_id, filename, storage_path)
            VALUES (:document_id, :course_id, :filename, :storage_path)
        """),
        {
            "document_id": document_id,
            "course_id": course_id,
            "filename": filename,
            "storage_path": storage_path,
        },
    )

    # 3. Chunk text
    chunks = parse_and_chunk(file_text)

    # 4. Embed and insert each chunk
    for idx, chunk_text in enumerate(chunks):
        chunk_id = str(uuid.uuid4())
        embedding = await embed(chunk_text)
        embedding_str = "[" + ",".join(str(x) for x in embedding) + "]"

        await db.execute(
            text("""
                INSERT INTO chunks (chunk_id, document_id, course_id, chunk_index, text, embedding)
                VALUES (:chunk_id, :document_id, :course_id, :chunk_index, :text, CAST(:embedding AS vector))
            """),
            {
                "chunk_id": chunk_id,
                "document_id": document_id,
                "course_id": course_id,
                "chunk_index": idx,
                "text": chunk_text,
                "embedding": embedding_str,
            },
        )

    await db.commit()

    return IngestResponse(
        document_id=document_id,
        chunks_indexed=len(chunks),
        storage_path=storage_path,
    )
