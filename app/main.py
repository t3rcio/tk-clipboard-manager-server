
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, status
from uuid import UUID
from app.connection_manager import manager
import json

app = FastAPI(
    title="ClipSync API",
    description="Backend para sincronização de área de transferência multi-dispositivo",
    version="0.2.0"
)

@app.get("/")
async def root():
    return {"status": "ok", "message": "ClipSync API está rodando!"}

@app.websocket("/ws/clipboard/{user_id}/{device_id}")
async def clipboard_websocket_endpoint(
    websocket: WebSocket,
    user_id: UUID,
    device_id: UUID
):
    """
    Endpoint WebSocket onde os dispositivos se conectam.
    Cada mensagem recebida aqui é repassada para os outros dispositivos do mesmo usuário.
    """
    await manager.connect(user_id, websocket)
    try:
        # Envia uma mensagem de boas-vindas / confirmação de conexão
        await websocket.send_text(json.dumps({
            "type": "system",
            "message": f"Dispositivo {device_id} conectado com sucesso ao canal do usuário {user_id}."
        }))

        while True:
            # Aguarda o dispositivo enviar novo conteúdo copiado
            data_raw = await websocket.receive_text()
            
            try:
                data = json.loads(data_raw)
                payload = {
                    "type": "clipboard_update",
                    "sender_device_id": str(device_id),
                    "content": data.get("content", ""),
                    "timestamp": data.get("timestamp")
                }
                
                # Transmite o conteúdo para todos os dispositivos do usuário
                await manager.broadcast_to_user(user_id, payload)
                
            except json.JSONDecodeError:
                # Se for enviado como texto puro em vez de JSON
                payload = {
                    "type": "clipboard_update",
                    "sender_device_id": str(device_id),
                    "content": data_raw
                }
                await manager.broadcast_to_user(user_id, payload)

    except WebSocketDisconnect:
        manager.disconnect(user_id, websocket)
        print(f"[ClipSync] Dispositivo {device_id} do usuário {user_id} desconectado.")