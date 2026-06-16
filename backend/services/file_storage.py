import os
import shutil
from fastapi import UploadFile
import uuid


class FileStorageService:
    def __init__(self):
        self.base_path = "./uploads"
        os.makedirs(self.base_path, exist_ok=True)

    async def save_upload_file(self, upload_file: UploadFile) -> str:
        # Generate unique filename to avoid collisions
        ext = os.path.splitext(upload_file.filename)[1] if upload_file.filename else ""
        unique_filename = f"{uuid.uuid4()}{ext}"

        file_path = os.path.join(self.base_path, unique_filename)

        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(upload_file.file, buffer)

        return file_path

    def get_file_path(self, filename: str) -> str:
        return os.path.join(self.base_path, filename)

    def delete_file(self, file_path: str):
        if os.path.exists(file_path):
            os.remove(file_path)


storage_service = FileStorageService()
