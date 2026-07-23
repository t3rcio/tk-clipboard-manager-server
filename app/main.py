from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, Depends, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from typing import List
from uuid import UUID

import os
import json

from app.database import engine, Base, get_db
from app.models import UserDB, DeviceDB, User, UserCreate, Device, DeviceCreate
from app.connection_manager import manager

Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="ClipSync API",
    description="Backend para sincronização de área de transferência multi-dispositivo",
    version="0.2.1"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  #TODO: set the server name
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.post("/users", response_model=User, status_code=status.HTTP_201_CREATED, tags=["Usuários"])
def create_user(user_in: UserCreate, db: Session = Depends(get_db)):
    existing_user = db.query(UserDB).filter(UserDB.email == user_in.email).first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="E-mail já cadastrado."
        )

    db_user = UserDB(email=user_in.email)
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    return db_user


@app.get("/users", response_model=List[User], tags=["Usuários"])
def list_users(db: Session = Depends(get_db)):
    return db.query(UserDB).all()


@app.post("/devices", response_model=Device, status_code=status.HTTP_201_CREATED, tags=["Dispositivos"])
def create_device(device_in: DeviceCreate, db: Session = Depends(get_db)):    
    user = db.query(UserDB).filter(UserDB.id == str(device_in.user_id)).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Usuário informado não encontrado."
        )

    db_device = DeviceDB(
        nome=device_in.nome,
        user_id=str(device_in.user_id)
    )
    db.add(db_device)
    db.commit()
    db.refresh(db_device)
    return db_device


@app.get("/users/{user_id}/devices", response_model=List[Device], tags=["Dispositivos"])
def list_user_devices(user_id: UUID, db: Session = Depends(get_db)):
    user = db.query(UserDB).filter(UserDB.id == str(user_id)).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Usuário não encontrado."
        )

    return db.query(DeviceDB).filter(DeviceDB.user_id == str(user_id)).all()


@app.websocket("/ws/clipboard/{user_id}/{device_id}")
async def clipboard_websocket_endpoint(
    websocket: WebSocket,
    user_id: UUID,
    device_id: UUID,
    db: Session = Depends(get_db)
):
    device = db.query(DeviceDB).filter(
        DeviceDB.id == str(device_id),
        DeviceDB.user_id == str(user_id)
    ).first()

    if not device:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    await manager.connect(user_id, websocket)
    try:
        await websocket.send_text(json.dumps({
            "type": "system",
            "message": f"Dispositivo '{device.nome}' conectado"
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
                "sender_device_name": device.nome,
                "content": content
            }
            
            await manager.broadcast_to_user(user_id, payload)

    except WebSocketDisconnect:
        manager.disconnect(user_id, websocket)


static_dir = os.path.join(os.path.dirname(__file__), "static")
app.mount("/static", StaticFiles(directory=static_dir), name="static")

@app.get("/", response_class=FileResponse, tags=["Web App"])
async def read_index():
    return os.path.join(static_dir, "index.html")
    