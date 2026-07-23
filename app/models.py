from sqlalchemy import Column, String, ForeignKey, DateTime
from sqlalchemy.orm import relationship
from pydantic import BaseModel, EmailStr, Field
from datetime import datetime
from uuid import UUID, uuid4

from app.database import Base

class UserDB(Base):
    __tablename__ = "users"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid4()))
    email = Column(String, unique=True, index=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    devices = relationship("DeviceDB", back_populates="owner", cascade="all, delete-orphan")


class DeviceDB(Base):
    __tablename__ = "devices"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid4()))
    nome = Column(String, nullable=False)
    user_id = Column(String(36), ForeignKey("users.id"), nullable=False)
    last_seen = Column(DateTime, default=datetime.utcnow)
    owner = relationship("UserDB", back_populates="devices")


class UserBase(BaseModel):
    email: EmailStr

class UserCreate(UserBase):
    password: str

class User(UserBase):
    id: UUID
    created_at: datetime

    class Config:
        from_attributes = True

class DeviceBase(BaseModel):
    nome: str

class DeviceCreate(DeviceBase):
    user_id: UUID

class Device(DeviceBase):
    id: UUID
    user_id: UUID

    class Config:
        from_attributes = True