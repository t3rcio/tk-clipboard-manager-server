from fastapi import WebSocket
from typing import Dict, List
from uuid import UUID
import json

class ClipboardConnectionManager:
    def __init__(self):
        # Mapeia user_id -> lista de conexões websocket ativas
        self.active_connections: Dict[UUID, List[WebSocket]] = {}

    async def connect(self, user_id: UUID, websocket: WebSocket):
        await websocket.accept()
        if user_id not in self.active_connections:
            self.active_connections[user_id] = []
        self.active_connections[user_id].append(websocket)

    def disconnect(self, user_id: UUID, websocket: WebSocket):
        if user_id in self.active_connections:
            if websocket in self.active_connections[user_id]:
                self.active_connections[user_id].remove(websocket)
            if not self.active_connections[user_id]:
                del self.active_connections[user_id]

    async def broadcast_to_user(self, user_id: UUID, message: dict, sender_websocket: WebSocket = None):
        """
        Envia a mensagem para TODOS os dispositivos do usuário.
        Se `sender_websocket` for passado, pode opcionalmente evitar re-enviar para o próprio dispositivo emissor.
        """
        if user_id in self.active_connections:
            for connection in self.active_connections[user_id]:
                # Envia para todos os dispositivos conectados do usuário
                await connection.send_text(json.dumps(message))

manager = ClipboardConnectionManager()