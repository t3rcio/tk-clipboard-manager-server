FROM python:3.11-slim-bookworm

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
# Adiciona o diretório de binários locais do root ao PATH
ENV PATH="/root/.local/bin:/code/.venv/bin:$PATH"

WORKDIR /code

# Instala o uv via pip
RUN pip install --no-cache-dir uv

# Copia a declaração de dependências
COPY pyproject.toml ./

# Instala as dependências globalmente no container usando uv
RUN uv venv
RUN uv sync
# RUN uv pip install --system --no-cache -r pyproject.toml

# Copia o código da aplicação
COPY app/ /code/app/

# Diretório para a persistência do SQLite
RUN mkdir -p /code/data

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]