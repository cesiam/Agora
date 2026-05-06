from pydantic import BaseModel

class IngestResponse(BaseModel):
    document_id: str
    chunks_indexed: int
    storage_path: str
