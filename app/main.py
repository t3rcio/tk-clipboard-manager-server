from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, status
from typing import List, Dict
from uuid import UUID, uuid4
import json

from app.models import User, UserCreate, Device, DeviceCreate
from app.connection_manager import manager

app = FastAPI(
    title="ClipSync API",
    description="Backend para sincronização de área de transferência multi-dispositivo",
    version="0.2.0"
)

# Apenas um prototipo... tudo em memoria
db_users: Dict[UUID, User] = {}
db_devices: Dict[UUID, Device] = {}


@app.post("/users", response_model=User, status_code=status.HTTP_201_CREATED, tags=["Usuarios"])
async def create_user(user_in: UserCreate):       
    for user in db_users.values():
        if user.email == user_in.email:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="E-mail já cadastrado no sistema."
            )

    new_user = User(
        email=user_in.email,
        # TODO: senha?
    )
    
    db_users[new_user.id] = new_user
    return new_user


@app.get("/users", response_model=List[User], tags=["Usuarios"])
async def list_users():
    return list(db_users.values())


@app.post("/devices", response_model=Device, status_code=status.HTTP_201_CREATED, tags=["Dispositivos"])
async def create_device(device_in: DeviceCreate):
    if device_in.user_id not in db_users:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Usuario informado não encontrado."
        )

    new_device = Device(
        nome=device_in.nome,
        user_id=device_in.user_id
    )

    db_devices[new_device.id] = new_device
    return new_device


@app.get("/users/{user_id}/devices", response_model=List[Device], tags=["Dispositivos"])
async def list_user_devices(user_id: UUID):
    if user_id not in db_users:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Usuario não encontrado."
        )

    user_devices = [device for device in db_devices.values() if device.user_id == user_id]
    return user_devices

@app.websocket("/ws/clipboard/{user_id}/{device_id}")
async def clipboard_websocket_endpoint(
    websocket: WebSocket,
    user_id: UUID,
    device_id: UUID
):
    if user_id not in db_users or device_id not in db_devices:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    await manager.connect(user_id, websocket)
    try:
        await websocket.send_text(json.dumps({
            "type": "system",
            "message": f"Dispositivo '{db_devices[device_id].nome}' conectado com sucesso!"
        }))

        while True:
            data_raw = await websocket.receive_text()
            try:
                data = json.loads(data_raw)
                content = data.get("content", "")
            except json.JSONDecodeError:
                content = data_raw

            payload = {
                "type": "clipboard_update",
                "sender_device_id": str(device_id),
                "sender_device_name": db_devices[device_id].nome,
                "content": content
            }
            
            await manager.broadcast_to_user(user_id, payload)

    except WebSocketDisconnect:
        manager.disconnect(user_id, websocket)
