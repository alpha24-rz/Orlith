.PHONY: help dev dev-docker build test lint clean setup logs stop restart \
        backend-dev frontend-dev backend-test frontend-test

# ─── Variables ────────────────────────────────────────────────────────────────
COMPOSE         := docker compose
COMPOSE_DEV     := docker compose -f docker-compose.yml -f docker-compose.dev.yml
BACKEND_DIR     := ./backend
FRONTEND_DIR    := ./frontend
PYTHON          := python3
NPM             := npm

# ─── Default Target ───────────────────────────────────────────────────────────
help: ## Show this help message
	@echo ""
	@echo "  DocuMind AI — Makefile Commands"
	@echo "  ────────────────────────────────"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
		| sort \
		| awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-22s\033[0m %s\n", $$1, $$2}'
	@echo ""

# ─── Development ──────────────────────────────────────────────────────────────
dev: ## Run both services locally (without Docker) — requires Python venv + Node
	@echo "→ Starting backend and frontend concurrently..."
	@$(MAKE) -j2 backend-dev frontend-dev

backend-dev: ## Run FastAPI backend with hot-reload (local, no Docker)
	@echo "→ Starting FastAPI backend on :8000..."
	@cd $(BACKEND_DIR) && \
		([ -d venv ] || $(PYTHON) -m venv venv) && \
		. venv/bin/activate && \
		pip install -q -r requirements.txt && \
		uvicorn main:app --host 0.0.0.0 --port 8000 --reload

frontend-dev: ## Run Next.js frontend with hot-reload (local, no Docker)
	@echo "→ Starting Next.js frontend on :3000..."
	@cd $(FRONTEND_DIR) && $(NPM) run dev

dev-docker: ## Run both services with Docker Compose + hot-reload (dev overrides)
	@$(MAKE) env-check
	@$(MAKE) build
	@$(COMPOSE_DEV) up

# ─── Build ────────────────────────────────────────────────────────────────────
build: ## Build production Docker images for both services using host network
	@$(MAKE) env-check
	@echo "→ Building production Docker images using host network..."
	@echo "→ Building backend image..."
	docker build --network=host -t documind-ai-backend:latest ./backend
	@echo "→ Building frontend image..."
	docker build --network=host --build-arg NEXT_PUBLIC_API_URL=$$(grep NEXT_PUBLIC_API_URL .env | cut -d '=' -f2- || echo "") -t documind-ai-frontend:latest ./frontend
	@echo "✓ Build complete."

# ─── Production ───────────────────────────────────────────────────────────────
up: ## Start all services in the background (production mode)
	@$(MAKE) env-check
	@$(COMPOSE) up -d
	@echo "✓ Services started:"
	@echo "   Frontend → http://localhost:3000"
	@echo "   Backend  → http://localhost:8000"
	@echo "   API Docs → http://localhost:8000/docs"

stop: ## Stop all running services
	@$(COMPOSE) down
	@echo "✓ Services stopped."

restart: ## Restart all services
	@$(COMPOSE) restart

logs: ## Tail logs from all services
	@$(COMPOSE) logs -f

logs-backend: ## Tail backend logs only
	@$(COMPOSE) logs -f backend

logs-frontend: ## Tail frontend logs only
	@$(COMPOSE) logs -f frontend

# ─── Testing ──────────────────────────────────────────────────────────────────
test: ## Run all tests (backend + frontend)
	@$(MAKE) backend-test frontend-test

backend-test: ## Run backend pytest suite
	@echo "→ Running backend tests..."
	@cd $(BACKEND_DIR) && \
		([ -d venv ] || $(PYTHON) -m venv venv) && \
		. venv/bin/activate && \
		pip install -q -r requirements.txt pytest pytest-asyncio httpx && \
		$(PYTHON) -m pytest tests/ -v --tb=short
	@echo "✓ Backend tests done."

frontend-test: ## Run frontend lint check (no Jest configured yet)
	@echo "→ Running frontend lint..."
	@cd $(FRONTEND_DIR) && $(NPM) run lint
	@echo "✓ Frontend lint done."

# ─── Code Quality ─────────────────────────────────────────────────────────────
lint: ## Lint backend (ruff) and frontend (eslint)
	@echo "→ Linting backend..."
	@cd $(BACKEND_DIR) && \
		([ -d venv ] || $(PYTHON) -m venv venv) && \
		. venv/bin/activate && \
		pip install -q ruff && \
		ruff check . || true
	@echo "→ Linting frontend..."
	@cd $(FRONTEND_DIR) && $(NPM) run lint || true
	@echo "✓ Lint complete."

format: ## Auto-format backend (ruff) code
	@cd $(BACKEND_DIR) && \
		([ -d venv ] || $(PYTHON) -m venv venv) && \
		. venv/bin/activate && \
		pip install -q ruff && \
		ruff format .
	@echo "✓ Backend formatting done."

# ─── Setup ────────────────────────────────────────────────────────────────────
setup: ## First-time setup: create .env, install deps (local)
	@echo "→ DocuMind AI — First-time Setup"
	@if [ ! -f .env ]; then \
		cp .env.example .env; \
		echo "✓ Created .env from .env.example — edit it before running."; \
	else \
		echo "  .env already exists, skipping copy."; \
	fi
	@echo "→ Installing backend Python dependencies..."
	@cd $(BACKEND_DIR) && \
		([ -d venv ] || $(PYTHON) -m venv venv) && \
		. venv/bin/activate && \
		pip install -q -r requirements.txt
	@echo "→ Installing frontend Node dependencies..."
	@cd $(FRONTEND_DIR) && $(NPM) install --silent
	@echo ""
	@echo "✓ Setup complete! Next steps:"
	@echo "  1. Edit .env — set SECRET_KEY and your LLM provider API keys"
	@echo "  2. Run \`make dev\`        — local dev (no Docker)"
	@echo "     or \`make dev-docker\`  — dev with Docker + hot-reload"
	@echo "     or \`make up\`          — production mode"

env-check: ## Verify .env file exists
	@if [ ! -f .env ]; then \
		echo "⚠  No .env file found. Run \`make setup\` first, or:"; \
		echo "   cp .env.example .env"; \
		exit 1; \
	fi

# ─── Cleanup ──────────────────────────────────────────────────────────────────
clean: ## Remove Docker containers and images
	@$(COMPOSE) down --rmi local --remove-orphans
	@echo "✓ Docker resources cleaned."

clean-data: ## ⚠ Delete all persistent data (DB, vectors, uploads)
	@echo "⚠  This will DELETE ./data/ — all documents and DB records!"
	@read -p "Are you sure? [y/N] " confirm && [ "$$confirm" = "y" ] || exit 1
	@rm -rf ./data
	@echo "✓ Data directory removed."

clean-all: clean ## Remove Docker resources AND local venv/node_modules
	@rm -rf $(BACKEND_DIR)/venv $(BACKEND_DIR)/__pycache__
	@rm -rf $(FRONTEND_DIR)/node_modules $(FRONTEND_DIR)/.next
	@echo "✓ Full clean done."

# ─── Health Check ─────────────────────────────────────────────────────────────
health: ## Check health of running services
	@echo "→ Backend health check:"
	@curl -s http://localhost:8000/health | python3 -m json.tool || echo "  Backend unreachable"
	@echo ""
	@echo "→ Frontend availability:"
	@curl -s -o /dev/null -w "  HTTP %{http_code}\n" http://localhost:3000 || echo "  Frontend unreachable"
