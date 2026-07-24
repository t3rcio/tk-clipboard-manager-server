from fastapi import WebSocket
from typing import Dict, List, Optional
from uuid import UUID

import json
import time

MAX_BUFFER_SIZE = 20 # for send to offline devices

class ClipboardConnectionManager:
    def __init__(self, buffer_size=MAX_BUFFER_SIZE):
        self.active_connections: Dict[UUID, List[WebSocket]] = {}
        self.user_buffers: Dict[UUID, List[dict]] = {}
        self.buffer_size = buffer_size

    async def connect(self, user_id: UUID, websocket: WebSocket):
        await websocket.accept()
        if user_id not in self.active_connections:
            self.active_connections[user_id] = []
        self.active_connections[user_id].append(websocket)

        if user_id not in self.user_buffers:
            self.user_buffers[user_id] = []

    def disconnect(self, user_id: UUID, websocket: WebSocket):
        if user_id in self.active_connections:
            if websocket in self.active_connections[user_id]:
                self.active_connections[user_id].remove(websocket)
            if not self.active_connections[user_id]:
                del self.active_connections[user_id]

    async def broadcast_to_user(self, user_id: UUID, payload: dict, sender_websocket: WebSocket = None):
        '''
        Broadcast da mensagem para os devices
        Se `sender_websocket` for passado, pode enviar a mensagem de volta para o emissor
        '''
        payload["msg_id"] = int(time.time() * 1000)
        
        if user_id not in self.user_buffers:
            self.user_buffers[user_id] = []

        self.user_buffers[user_id].append(payload)

        if len(self.user_buffers[user_id]) > self.buffer_size:
            self.user_buffers[user_id].pop(0)
        
        if user_id in self.active_connections:
            for connection in self.active_connections[user_id]:                
                await connection.send_text(json.dumps(payload))
    
    async def sync_missed_messages(self, user_id: UUID, websocket: WebSocket, last_msg_id: Optional[int]):
        '''
        Envia mensagens do buffer para devices outrora offline
        '''
        if user_id not in self.user_buffers or not last_msg_id:
            return
        
        missed = [msg for msg in self.user_buffers[user_id] if msg.get("msg_id", 0) > last_msg_id]
        for msg in missed:
            await websocket.send_text(json.dumps(msg))

manager = ClipboardConnectionManager(buffer_size=MAX_BUFFER_SIZE)