from pydantic import BaseModel, EmailStr, Field
from uuid import UUID, uuid4
from datetime import datetime
from typing import Optional, List

# Users
class UserBase(BaseModel):
    email: EmailStr

class UserCreate(UserBase):
    password: str

class User(UserBase):
    id: UUID = Field(default_factory=uuid4)
    created_at: datetime = Field(default_factory=datetime.now)

    class Config:
        from_attributes = True


# Devices
class DeviceBase(BaseModel):
    nome: str

class DeviceCreate(DeviceBase):
    user_id: UUID

class Device(DeviceBase):
    id: UUID = Field(default_factory=uuid4)
    user_id: UUID
    last_seen: Optional[datetime] = None

    class Config:
        from_attributes = True

# Paylod for websockets
class ClipboardPayload(BaseModel):
    user_id: UUID
    device_id: UUID
    content: str
    timestamp: datetime = Field(default_factory=datetime.now)
