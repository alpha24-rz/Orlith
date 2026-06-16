from models.workspace import Workspace

class WorkspaceValidator:
    @staticmethod
    async def get_workspace_status(db_session, workspace: Workspace) -> str:
        return "READY"

    @staticmethod
    async def get_health(db_session, workspace: Workspace) -> dict:
        return {
            "status": "READY",
            "chat": {"healthy": True, "provider": "openrouter", "model": "qwen"},
            "embedding": {"healthy": True, "provider": "openrouter", "model": "llama"}
        }
