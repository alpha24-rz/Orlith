from fastapi import WebSocket
from typing import Dict, List
import json


class ConnectionManager:
    def __init__(self):
        # Maps workspace_id -> list of active WebSocket connections
        self.active_connections: Dict[str, List[WebSocket]] = {}

    async def connect(self, workspace_id: str, websocket: WebSocket):
        await websocket.accept()
        if workspace_id not in self.active_connections:
            self.active_connections[workspace_id] = []
        self.active_connections[workspace_id].append(websocket)

    def disconnect(self, workspace_id: str, websocket: WebSocket):
        if workspace_id in self.active_connections:
            if websocket in self.active_connections[workspace_id]:
                self.active_connections[workspace_id].remove(websocket)
            if not self.active_connections[workspace_id]:
                del self.active_connections[workspace_id]

    async def broadcast_to_workspace(self, workspace_id: str, message: dict):
        if workspace_id not in self.active_connections:
            return

        # We make a copy of the list to avoid mutations while iterating
        connections = list(self.active_connections[workspace_id])
        for connection in connections:
            try:
                await connection.send_json(message)
            except Exception:
                # Connection is likely dead, let's clean it up
                self.disconnect(workspace_id, connection)


manager = ConnectionManager()
