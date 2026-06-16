# ORLITH AI Setup & Deployment Guide (Self-Hosted)

ORLITH AI is designed to be easily self-hosted, either using Docker Compose or manually. This guide provides step-by-step instructions for installation, configuration, running, securing, and maintaining your own ORLITH AI instance.

---

## Table of Contents
1. [System Prerequisites](#1-system-prerequisites)
2. [Initial Preparation](#2-initial-preparation)
3. [Method 1: Using Docker Compose (Highly Recommended)](#3-method-1-using-docker-compose-highly-recommended)
4. [Method 2: Manual Setup (Without Docker)](#4-method-2-manual-setup-without-docker)
5. [Environment Configuration Guide (.env)](#5-environment-configuration-guide-env)
6. [Local LLM Integration (Ollama)](#6-local-llm-integration-ollama)
7. [Data Storage, Backup, & Restore](#7-data-storage-backup--restore)
8. [Production Best Practices (Nginx, SSL, Security)](#8-production-best-practices-nginx-ssl-security)
9. [Troubleshooting](#9-troubleshooting)

---

## 1. System Prerequisites

Before starting the installation process, ensure your system/server meets the following minimum requirements:

*   **Operating System**: Linux (Ubuntu 20.04 LTS / 22.04 LTS is highly recommended), macOS, or Windows with WSL2.
*   **Minimum Hardware Specifications**:
    *   **CPU**: 2 Cores
    *   **RAM**: 4 GB (8 GB or more highly recommended if you intend to run local LLMs/Ollama on the same machine)
    *   **Storage**: 10 GB+ free space (depending on the number and size of documents you upload)
*   **Software**:
    *   **Docker Method**: Docker Engine v20.10+ & Docker Compose v2.0+
    *   **Manual Method**: Python 3.10+ (or Python 3.12) & Node.js 18+ with npm 9+
    *   **OCR Engine (Optional but important)**: Tesseract OCR (pre-packaged if using Docker; must be installed manually if running without Docker) to extract text from scanned PDFs or images.

---

## 2. Initial Preparation

Clone the ORLITH AI repository to your server or local machine:

```bash
git clone https://github.com/yourusername/orlith.git
cd orlith
```

---

## 3. Method 1: Using Docker Compose (Highly Recommended)

Using Docker Compose is the easiest and fastest way to run ORLITH AI in a production environment. All dependencies, including Python, Node.js, and Tesseract OCR, are neatly packaged inside the Docker images.

### Deployment Steps:

1.  **Initialize Environment File (`.env`)**
    Copy the `.env.example` template file to `.env` in the root project directory:
    ```bash
    cp .env.example .env
    ```
    Or use the Makefile helper command if `make` is installed on your machine:
    ```bash
    make setup
    ```

2.  **Configure Key Variables**
    Open the newly created `.env` file using a text editor (e.g., `nano .env`) and ensure you update the following values:
    
    > [!IMPORTANT]
    > Change the `SECRET_KEY` value to a random string of at least 32 characters to secure the encryption of API Keys and JWT authentication tokens. Do not leave the default value!
    > You can generate one by running this Python snippet:
    > ```bash
    > python3 -c "import secrets; print(secrets.token_hex(32))"
    > ```

    *   **Remote/VPS Usage**: If you are deploying ORLITH AI on a cloud server (not localhost), locate the `NEXT_PUBLIC_API_URL` variable and change `localhost` to your server's Domain or Public IP so client browsers can communicate with the backend:
        ```env
        NEXT_PUBLIC_API_URL=http://<YOUR_SERVER_PUBLIC_IP>:8000
        ```

3.  **Build & Run Docker Containers**
    Run the following command to pull/build the images and start all services in the background (detached mode):
    ```bash
    docker compose up -d
    ```
    Or with Makefile:
    ```bash
    make up
    ```

4.  **Access the Application**
    Once the containers are running successfully, your services will be available at the following addresses:
    *   **ORLITH UI (Frontend)**: [http://localhost:3000](http://localhost:3000) (or replace with your server's IP/Domain)
    *   **Backend API**: [http://localhost:8000](http://localhost:8000)
    *   **Swagger API Documentation**: [http://localhost:8000/docs](http://localhost:8000/docs)

5.  **Monitoring Logs**
    To monitor for any errors while the containers are running, view the real-time logs with:
    ```bash
    docker compose logs -f
    ```

---

## 4. Method 2: Manual Setup (Without Docker)

If you wish to run the services directly on the host machine without containers, you must install all dependencies manually.

### Step A: Install Tesseract OCR on Host System
For ORLITH AI to perform OCR (*Optical Character Recognition*) on image/scanned documents, install Tesseract OCR according to your OS:

*   **Ubuntu / Debian**:
    ```bash
    sudo apt-get update
    sudo apt-get install -y tesseract-ocr libtesseract-dev build-essential
    ```
*   **macOS (via Homebrew)**:
    ```bash
    brew install tesseract
    ```
*   **Windows**:
    Download the Tesseract installer from the official repository and add the Tesseract installation path to your system's `PATH` variable.

---

### Step B: Backend Setup (FastAPI)

1.  Navigate to the backend directory:
    ```bash
    cd backend
    ```
2.  Create a Python Virtual Environment (`venv`) and activate it:
    ```bash
    python3 -m venv venv
    source venv/bin/activate
    ```
3.  Install the required Python libraries:
    ```bash
    pip install -r requirements.txt
    ```
4.  Run the backend server using Uvicorn:
    ```bash
    uvicorn main:app --host 0.0.0.0 --port 8000
    ```
    > [!NOTE]
    > The SQLite Database (`documind.db`), file upload directories, and ChromaDB vector indices will be automatically created under the `./data` directory when the backend is run for the first time.

---

### Step C: Frontend Setup (Next.js)

1.  Open a new terminal, navigate to the frontend directory:
    ```bash
    cd frontend
    ```
2.  Install all Node.js packages:
    ```bash
    npm install
    ```
3.  Run Next.js according to your needs:
    *   **Development Mode** (with hot reload):
        ```bash
        npm run dev
        ```
    *   **Production Mode** (highly recommended for optimal performance on production servers):
        ```bash
        npm run build
        npm run start
        ```

---

## 5. Environment Configuration Guide (`.env`)

Here are some of the critical environment variables you can configure in the `.env` file:

| Variable | Default Value | Description |
| :--- | :--- | :--- |
| `ENVIRONMENT` | `production` | Determines the application environment (`production` / `development` / `testing`). |
| `SECRET_KEY` | `replace-this-...` | **Must change!** Secret encryption key for JWTs and workspace API key credentials stored in the database. |
| `NEXT_PUBLIC_API_URL` | `http://localhost:8000` | The Backend API URL that the client browser will contact. If deployed publicly, point to your server IP or HTTPS domain (e.g., `https://api.orlith.com`). |
| `BACKEND_URL` | `http://backend:8000` | Internal backend URL for Next.js server-side communication. Use the service name `http://backend:8000` if using Docker, or `http://localhost:8000` if without Docker. |
| `DATABASE_URL` | `sqlite+aiosqlite:///./data/documind.db` | Connection string to the asynchronous SQLite database. |
| `CHROMA_PERSIST_DIR` | `./data/chroma` | Directory for storing ChromaDB vector indices. |
| `STORAGE_LOCAL_PATH` | `./data/uploads` | Local storage location for uploaded physical files. |
| `CORS_ORIGINS` | `http://localhost:3000,http://127.0.0.1:3000` | List of allowed origins for requests to the backend. Use `*` only for dev purposes, and set your specific domains in production. |
| `RATE_LIMIT_PER_MINUTE` | `60` | Maximum number of requests per IP Address per minute to prevent server overload. Set to `0` to disable. |

---

## 6. Local LLM Integration (Ollama)

To run a fully private ORLITH AI instance (without sending your document data out to the internet / *Air-Gapped*), you can use Ollama on your local machine or server.

1.  Ensure Ollama is installed and running on your host machine (`ollama serve`).
2.  Download your preferred LLM model and embedding model, for example:
    ```bash
    ollama pull llama3
    ollama pull nomic-embed-text
    ```
3.  **Configuring the Ollama Endpoint in ORLITH:**
    *   **If using Docker Compose**:
        Docker containers run in an isolated network. To contact Ollama installed on the host system:
        *   **macOS / Windows**: Enter the following Ollama URL in the ORLITH UI: `http://host.docker.internal:11434`
        *   **Linux**: Add the `extra_hosts` parameter in the `docker-compose.yml` file under the `backend` service:
            ```yaml
            extra_hosts:
              - "host.docker.internal:host-gateway"
            ```
            Then enter `http://host.docker.internal:11434` as the Ollama base URL in the ORLITH UI.
    *   **If using Manual Setup**:
        Use the direct local address: `http://localhost:11434`
4.  Open **Workspace Settings** in the ORLITH dashboard, select the **AI Provider** tab, activate the **Ollama (Local)** provider, and enter the base URL from above.

---

## 7. Data Storage, Backup, & Restore

ORLITH AI stores all critical data (SQLite database, metadata, document chunks, original files, and vector indices) in a single folder: the `./data` directory. In Docker Compose, this directory is mapped to the host so data is not lost when containers restart.

The `./data` folder structure is as follows:
*   `./data/documind.db` - SQLite relational database (contains user data, chat histories, workspace settings, etc.).
*   `./data/chroma/` - ChromaDB vector database files (stores text embeddings for semantic search).
*   `./data/uploads/` - Original raw documents (PDF, DOCX, TXT) uploaded by users.

### Backup Procedure
To backup all your application data, simply create an archive of the `./data` directory when the system is not actively uploading or processing documents:

```bash
# Stop containers first to avoid database corruption
docker compose down

# Create backup archive
tar -czvf orlith-backup-$(date +%F).tar.gz ./data

# Restart containers
docker compose up -d
```

### Restore Procedure
1.  Stop the ORLITH AI services (`docker compose down` or `make stop`).
2.  Extract your backup file into the root project directory:
    ```bash
    tar -xzvf orlith-backup-YYYY-MM-DD.tar.gz -C .
    ```
3.  Ensure file permissions are correct (see the troubleshooting section).
4.  Restart the ORLITH AI services (`docker compose up -d` or `make up`).

---

## 8. Production Best Practices (Nginx, SSL, Security)

To publish ORLITH AI publicly on the internet or within your company's private network, it is recommended to place a web server like **Nginx** as a Reverse Proxy in front of the application. This simplifies SSL certificate (HTTPS) management and improves security.

### Example Nginx Reverse Proxy Configuration

Create a new site configuration file at `/etc/nginx/sites-available/orlith`:

```nginx
server {
    listen 80;
    server_name orlith.company.com;
    
    # Automatic HTTP to HTTPS redirect
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name orlith.company.com;

    # SSL Certificates (e.g., from Let's Encrypt / Certbot)
    ssl_certificate /etc/letsencrypt/live/orlith.company.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/orlith.company.com/privkey.pem;

    # Optimal SSL Configuration
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    # 1. Routing to Next.js Frontend
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    # 2. Routing to FastAPI Backend (and WebSockets support)
    # Note: The trailing '/' on proxy_pass is important to strip the '/api' prefix
    location /api/ {
        proxy_pass http://127.0.0.1:8000/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # Longer timeouts to prevent WebSocket streaming chat disconnections
        proxy_read_timeout 86400;
        proxy_send_timeout 86400;
    }
}
```

Activate the configuration and reload Nginx:
```bash
sudo ln -s /etc/nginx/sites-available/orlith /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

> [!TIP]
> If you enable HTTPS, ensure you change the `NEXT_PUBLIC_API_URL` value in your `.env` file to use the secure HTTPS protocol, for example `NEXT_PUBLIC_API_URL=https://orlith.company.com/api` (if the backend is proxied under the `/api/` path like the Nginx example above).

---

## 9. Troubleshooting

### Q: Next.js Frontend displays "Failed to fetch" error or cannot call the Backend API.
*   **Cause**: The `NEXT_PUBLIC_API_URL` variable is misconfigured or inaccessible from the user's browser.
*   **Solution**: Variables prefixed with `NEXT_PUBLIC_` are embedded in the client browser during page load. If accessing ORLITH from another laptop on the local network, you cannot set the URL to `localhost`. Change it to your server's LAN IP address (e.g., `http://192.168.1.15:8000`).

### Q: Encountering "SQLite DB is locked" error or database write operations fail.
*   **Cause**: The `./data` volume folder lacks appropriate read/write permissions for the Docker user.
*   **Solution**: Run the following commands on the host server to grant correct permissions to the storage directory:
    ```bash
    sudo chmod -R 775 ./data
    sudo chown -R $USER:docker ./data
    ```

### Q: PDF upload or processing is slow or fails midway.
*   **Cause**: Your PDF documents may be very large or consist of scanned images, triggering the backend to launch the Tesseract OCR process which is highly CPU-intensive.
*   **Solution**: Ensure adequate CPU allocation for your container/server. Additionally, you may need to increase the HTTP request timeout on your Nginx reverse proxy if you are using one.

### Q: The ingestion progress bar in the UI isn't moving in real-time.
*   **Cause**: WebSocket connections are being blocked by your reverse proxy or firewall.
*   **Solution**: Ensure your Nginx configuration includes the following connection upgrade headers for the backend path:
    ```nginx
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    ```
