# TK-ClipBoard Server

Servidor e API RESTful de sincronização de área de transferência multi-dispositivo construído com **FastAPI**, **SQLAlchemy (SQLite)** e **WebSockets**.

O server atua como o nó central do ClipBoard, gerenciando a autenticação de usuários/dispositivos [futuramente], a distribuição das mensagens em tempo real e mantendo um **Buffer Circular (Replay)** para garantir a entrega de cópias mesmo para dispositivos móveis que perderam temporariamente a conexão.

## BACKEND

- **WebSockets em Tempo Real:** Conexão assíncrona bi-direcional entre PCs, smartphones e daemons.
- **Persistência Relacional:** Usuários e Dispositivos salvos de forma permanente via **SQLAlchemy + SQLite**.
- **Buffer de replay:** Guarda as últimas 20 mensagens por usuário. Se o(s) dispositivo(s) dormir(em) ou trocar(em) de rede Wi-Fi, ao reconectar(em) recebem automaticamente as cópias perdidas.
- **PWA:** Serve a interface web estática (`/static`) direta para o celular sem necessidade de servidores Web extras (Nginx, etc.).
- **User Isolation:** Dispositivos recebem apenas mensagens do canal pertencente ao seu próprio `user_id`.

## ESTRUTURA

```text
tk-clipboard-manager-server/
├── app/
│   ├── __init__.py
│   ├── main.py               # App
│   ├── database.py           # Database engine
│   ├── models.py             # Models
│   ├── connection_manager.py # Gerenciador de WebSockets com Buffer de Replay
│   └── static/               # PWA
│       ├── index.html
│       ├── app.js
│       ├── manifest.json
│       └── sw.js
├── clipsync.db               # Banco
├── requirements.txt          # Dependências do projeto
└── README.md