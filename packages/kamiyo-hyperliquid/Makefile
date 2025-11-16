# ============================================================================
# KAMIYO Hyperliquid - Makefile
# ============================================================================
# Common operations for development and deployment

.PHONY: help install dev prod test clean logs restart health backup

# Default target
.DEFAULT_GOAL := help

## help: Display this help message
help:
	@echo "KAMIYO Hyperliquid - Make Commands"
	@echo ""
	@echo "Usage: make [target]"
	@echo ""
	@echo "Targets:"
	@grep -E '^## ' $(MAKEFILE_LIST) | sed 's/^## /  /' | column -t -s ':' | sed 's/^/  /'

## install: Install Python dependencies
install:
	pip install --upgrade pip
	pip install -r requirements.txt

## dev: Start development environment
dev:
	@echo "Starting development environment..."
	docker-compose up -d postgres redis
	@sleep 3
	@echo "Starting API in development mode..."
	uvicorn api.main:app --reload --host 0.0.0.0 --port 8000

## prod: Start production environment
prod:
	@echo "Starting production environment..."
	./scripts/quick-start.sh

## docker-up: Start all Docker services
docker-up:
	docker-compose up -d

## docker-down: Stop all Docker services
docker-down:
	docker-compose down

## docker-rebuild: Rebuild and restart Docker containers
docker-rebuild:
	docker-compose down
	docker-compose build --no-cache
	docker-compose up -d

## monitoring: Start with monitoring stack (Prometheus + Grafana)
monitoring:
	docker-compose --profile monitoring up -d

## admin: Start with admin tools (PgAdmin)
admin:
	docker-compose --profile admin up -d

## websocket-start: Start WebSocket real-time monitor
websocket-start:
	@echo "Starting WebSocket real-time monitor..."
	docker-compose up -d websocket

## websocket-stop: Stop WebSocket monitor
websocket-stop:
	@echo "Stopping WebSocket monitor..."
	docker-compose stop websocket

## websocket-logs: View WebSocket monitor logs
websocket-logs:
	docker-compose logs -f websocket

## websocket-restart: Restart WebSocket monitor
websocket-restart:
	docker-compose restart websocket

## websocket-test: Test WebSocket connection (60 seconds)
websocket-test:
	@echo "Testing WebSocket connection for 60 seconds..."
	python websocket/runner.py --duration 60

## websocket-status: Check WebSocket monitor status
websocket-status:
	@docker-compose ps websocket

## test: Run all tests (unit + integration)
test:
	@echo "Running all tests..."
	python tests/run_tests.py

## test-unit: Run unit tests only
test-unit:
	@echo "Running unit tests..."
	python -m unittest discover -s tests/unit -p "test_*.py" -v

## test-integration: Run integration tests only
test-integration:
	@echo "Running integration tests..."
	python tests/test_production_readiness.py
	python tests/test_historical_hlp_incident.py

## test-coverage: Run tests with coverage report
test-coverage:
	@echo "Running tests with coverage..."
	coverage run -m pytest tests/
	coverage report -m
	coverage html
	@echo "Coverage report generated in htmlcov/index.html"

## test-docker: Run tests in Docker
test-docker:
	docker-compose exec api python tests/run_tests.py

## test-quick: Run quick sanity tests
test-quick:
	@echo "Running quick sanity tests..."
	python -m unittest tests.unit.test_hlp_monitor.TestHLPVaultMonitor.test_initialization -v
	python -m unittest tests.unit.test_oracle_monitor.TestOracleMonitor.test_initialization -v
	python -m unittest tests.unit.test_alert_manager.TestAlertManager.test_initialization -v

## logs: Tail logs from API server
logs:
	docker-compose logs -f api

## logs-all: Tail logs from all services
logs-all:
	docker-compose logs -f

## restart: Restart API server
restart:
	docker-compose restart api

## restart-all: Restart all services
restart-all:
	docker-compose restart

## health: Check service health
health:
	@echo "Checking API health..."
	@curl -sf http://localhost:8000/health | jq || echo "API is not responding"
	@echo ""
	@echo "Checking database health..."
	@docker-compose exec -T postgres pg_isready -U kamiyo || echo "Database is not responding"
	@echo ""
	@echo "Checking Redis health..."
	@docker-compose exec -T redis redis-cli ping || echo "Redis is not responding"

## dashboard: Open security dashboard
dashboard:
	@echo "Security Dashboard:"
	@curl -s http://localhost:8000/security/dashboard | jq

## hlp-vault: Check HLP vault health
hlp-vault:
	@echo "HLP Vault Health:"
	@curl -s http://localhost:8000/security/hlp-vault | jq

## oracle: Check oracle deviations
oracle:
	@echo "Oracle Deviations:"
	@curl -s http://localhost:8000/security/oracle-deviations | jq

## stats: Display exploit statistics
stats:
	@echo "Exploit Statistics:"
	@curl -s http://localhost:8000/stats | jq

## db-init: Initialize database schema
db-init:
	docker-compose exec -T postgres psql -U kamiyo -d kamiyo_hyperliquid -f /docker-entrypoint-initdb.d/01-schema.sql

## db-shell: Open database shell
db-shell:
	docker-compose exec postgres psql -U kamiyo -d kamiyo_hyperliquid

## db-backup: Backup database
db-backup:
	@mkdir -p backups
	@echo "Creating database backup..."
	docker-compose exec -T postgres pg_dump -U kamiyo -d kamiyo_hyperliquid -F c > backups/backup_$(shell date +%Y%m%d_%H%M%S).dump
	@echo "Backup saved to backups/"

## db-restore: Restore database from latest backup
db-restore:
	@echo "Restoring from latest backup..."
	@latest=$$(ls -t backups/*.dump | head -1); \
	if [ -z "$$latest" ]; then \
		echo "No backups found in backups/"; \
		exit 1; \
	fi; \
	echo "Restoring from $$latest"; \
	docker-compose exec -T postgres pg_restore -U kamiyo -d kamiyo_hyperliquid -c < $$latest

## clean: Clean up containers, volumes, and cache
clean:
	@echo "Cleaning up..."
	docker-compose down -v
	find . -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
	find . -type f -name "*.pyc" -delete 2>/dev/null || true
	find . -type d -name "*.egg-info" -exec rm -rf {} + 2>/dev/null || true
	@echo "Cleanup complete"

## clean-all: Clean everything including Docker images
clean-all: clean
	docker-compose down --rmi all -v
	@echo "Full cleanup complete"

## ps: Show running containers
ps:
	docker-compose ps

## shell: Open shell in API container
shell:
	docker-compose exec api /bin/sh

## python-shell: Open Python shell with application context
python-shell:
	docker-compose exec api python

## format: Format code with black
format:
	black aggregators/ api/ database/ models/ monitors/ tests/

## lint: Lint code with flake8
lint:
	flake8 aggregators/ api/ database/ models/ monitors/ tests/ --max-line-length=120

## docs: Generate API documentation
docs:
	@echo "API documentation available at:"
	@echo "http://localhost:8000/docs (Swagger UI)"
	@echo "http://localhost:8000/redoc (ReDoc)"

## security-check: Run security checks
security-check:
	@echo "Running security checks..."
	@echo "1. Checking for exposed secrets..."
	@grep -r "password\|secret\|key" .env 2>/dev/null || echo "No .env file found (good for security)"
	@echo ""
	@echo "2. Checking Docker security..."
	@docker scan kamiyo-api:latest 2>/dev/null || echo "Docker scan not available"
	@echo ""
	@echo "3. Checking dependencies..."
	pip list --outdated

## update-deps: Update all dependencies
update-deps:
	pip install --upgrade -r requirements.txt
	pip freeze > requirements.txt

## port-check: Check if required ports are available
port-check:
	@echo "Checking required ports..."
	@for port in 5432 6379 8000 9090 3000 5050; do \
		if lsof -Pi :$$port -sTCP:LISTEN -t >/dev/null 2>&1; then \
			echo "  Port $$port: OCCUPIED"; \
		else \
			echo "  Port $$port: AVAILABLE"; \
		fi; \
	done

## quick-start: Run quick start script
quick-start:
	./scripts/quick-start.sh

## grafana: Open Grafana dashboard
grafana:
	@echo "Opening Grafana..."
	@open http://localhost:3000 2>/dev/null || xdg-open http://localhost:3000 2>/dev/null || echo "Grafana: http://localhost:3000"

## prometheus: Open Prometheus dashboard
prometheus:
	@echo "Opening Prometheus..."
	@open http://localhost:9090 2>/dev/null || xdg-open http://localhost:9090 2>/dev/null || echo "Prometheus: http://localhost:9090"

## pgadmin: Open PgAdmin
pgadmin:
	@echo "Opening PgAdmin..."
	@open http://localhost:5050 2>/dev/null || xdg-open http://localhost:5050 2>/dev/null || echo "PgAdmin: http://localhost:5050"
