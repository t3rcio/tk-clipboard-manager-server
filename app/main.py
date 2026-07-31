from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, Depends, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from typing import List, Optional, Dict
from uuid import UUID

import os
import json
import hashlib
import random
import time

import app.settings as settings
from app.database import engine, Base, get_db
from app.models import (
    UserDB, 
    DeviceDB, 
    User, 
    UserResponse, 
    UserLogin, 
    UserCreate, 
    Device, 
    DeviceCreate, 
    DeviceCreateSimple,
    DeviceCodeRequest,
    PairApproveRequest
)

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

pairing_codes: Dict[str, dict] = {}
MAX_PIN_EXPIRES = 300 # seconds

def hash_password(password:str) -> str:
    '''
    Hash helper function
    '''
    salt = settings.STATIC_SALT_V1
    return hashlib.pbkdf2_hmac(
        'sha256',
        password.encode('utf-8'),
        salt,
        settings.SALT_ITER_HASH
    )

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return hash_password(plain_password) == hashed_password

@app.post("/api/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED, tags=["Auth"])
def register(user_in: UserCreate, db: Session = Depends(get_db)):
    db_user = db.query(UserDB).filter(UserDB.email == user_in.email).first()
    if db_user:
        raise HTTPException(status_code=400, detail="E-mail já cadastrado.")

    new_user = UserDB(
        email=user_in.email,
        hashed_password=hash_password(user_in.password)
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return new_user

@app.post("/api/login", response_model=UserResponse, tags=["Auth"])
def login(credentials: UserLogin, db: Session = Depends(get_db)):
    user = db.query(UserDB).filter(UserDB.email == credentials.email).first()
    if not user or not verify_password(credentials.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="E-mail ou senha incorretos.")
    
    return user

@app.post("/api/devices/quick-add", tags=["Dispositivos"])
def quick_add_device(device_in: DeviceCreateSimple, db: Session = Depends(get_db)):
    user = db.query(UserDB).filter(UserDB.id == device_in.user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Usuário não encontrado.")

    # Gera UUID automaticamente no backend
    new_device = DeviceDB(
        nome=device_in.nome,
        user_id=device_in.user_id
    )
    db.add(new_device)
    db.commit()
    db.refresh(new_device)

    return {
        "device_id": new_device.id,
        "nome": new_device.nome,
        "user_id": new_device.user_id
    }

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
    last_msg_id: Optional[int] = None,
    db: Session = Depends(get_db)
):

    # Necessario aceitar primeiro a conexao para evitar 403
    await websocket.accept()
    u_id_str = str(user_id).lower()
    d_id_str = str(device_id).lower()

    device = db.query(DeviceDB).filter(
        DeviceDB.id == str(d_id_str),
        DeviceDB.user_id == str(u_id_str)
    ).first()

    print("DEVICE FOUND: ", device, "USER_ID:", user_id, "DEVICE_ID:", device_id)

    if not device:
        await websocket.send_text(json.dumps({"type": "error", "message": "Dispositivo ou usuário não cadastrado no banco."}))
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    await manager.connect(user_id, websocket)
    try:
        if last_msg_id:
            await manager.sync_missed_messages(user_id, websocket, last_msg_id)
        
        await websocket.send_text(json.dumps({
            "type": "system",
            "message": f"Dispositivo '{device.nome}' conectado"
        }))

        while True:
            data_raw = await websocket.receive_text()
            print("DADOS RECEBIDOS: ", data_raw)
            try:
                data = json.loads(data_raw)
                if data.get("type") == "sync_request":
                    client_last_id = data.get("last_msg_id", 0)
                    await manager.sync_missed_messages(user_id, websocket, client_last_id)
                    continue                
                
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

@app.post("/api/auth/device-code", tags=["Pareamento"])
def generate_device_code(req: DeviceCodeRequest):
    '''
    Gera pin de 6 digitos
    '''
    code = f"{random.randint(100000, 999999)}"
    
    pairing_codes[code] = {
        "device_name": req.device_name,
        "expires_at": time.time() + MAX_PIN_EXPIRES,  # 5 mins
        "user_id": None,
        "device_id": None,
        "status": "pending"
    }
    return {"code": code, "expires_in": MAX_PIN_EXPIRES}

@app.get("/api/auth/device-code/{code}/status", tags=["Pareamento"])
def check_device_code_status(code: str, db: Session = Depends(get_db)):
    data = pairing_codes.get(code)
    
    if not data:
        raise HTTPException(status_code=404, detail="Código inválido ou expirado.")
    
    if time.time() > data["expires_at"]:
        del pairing_codes[code]
        raise HTTPException(status_code=410, detail="Código expirado.")
    
    if data["status"] == "approved":
        # Retorna as credenciais e remove o código da memória
        res = {
            "status": "approved",
            "user_id": data["user_id"],
            "device_id": data["device_id"]
        }
        del pairing_codes[code]
        return res
    
    return {"status": "pending"}

@app.post("/api/auth/pair-device", tags=["Pareamento"])
def approve_pair_device(req: PairApproveRequest, db: Session = Depends(get_db)):
    data = pairing_codes.get(req.code)
    
    if not data or time.time() > data["expires_at"]:
        raise HTTPException(status_code=400, detail="Código inválido ou expirado.")
    
    user = db.query(UserDB).filter(UserDB.id == req.user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Usuário não encontrado.")

    new_device = DeviceDB(
        nome=data["device_name"],
        user_id=req.user_id
    )
    db.add(new_device)
    db.commit()
    db.refresh(new_device)

    data["user_id"] = req.user_id
    data["device_id"] = new_device.id
    data["status"] = "approved"

    return {"message": "Dispositivo pareado com sucesso!", "device_id": new_device.id}
    