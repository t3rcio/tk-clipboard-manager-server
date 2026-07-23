from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

SQLALCHEMY_DATABASE_URL = "sqlite:///./clipsync.db"

# connect_args={"check_same_thread": False} para o SQLite no FastAPI
engine = create_engine(
    SQLALCHEMY_DATABASE_URL, 
    connect_args={"check_same_thread": False}
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def get_db():
    '''
    Injeta sessao do banco
    '''
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
