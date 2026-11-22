# Shakedown: common tasks. Run `make help` for the list.

# The interpreter that creates engine/.venv. The engine needs Python 3.10 or
# newer; CI uses 3.11. Override with: make engine PYTHON=python3.10
PYTHON ?= python3.11
PY := engine/.venv/bin/python
SD := engine/.venv/bin/shakedown

.PHONY: help setup engine web db db-reset dev demo-key demo-runs demo-upload demo test lint stop

help: ## Show this list
	@grep -E '^[a-z-]+:.*##' $(MAKEFILE_LIST) | awk -F':.*## ' '{printf "  %-14s %s\n", $$1, $$2}'

setup: engine web db ## Install everything and start the local database

engine: ## Create the Python environment and install the engine
	test -d engine/.venv || $(PYTHON) -m venv engine/.venv
	$(PY) -m pip install -q --upgrade pip
	$(PY) -m pip install -q -e "engine[lerobot,server,scan,dev]"

web: ## Install the web app's dependencies
	cd apps/web && npm install
	test -f apps/web/.env.local || cp apps/web/.env.example apps/web/.env.local

db: ## Start the local Supabase stack and apply migrations
	supabase start -x imgproxy,edge-runtime,logflare,vector,supavisor
	@echo "Copy the API URL and keys above into apps/web/.env.local"

db-reset: ## Recreate the local database from the migrations
	supabase db reset

dev: ## Run the web app at http://localhost:3400
	cd apps/web && npm run dev

demo-key: ## Create the public demo project and an API key for it
	node scripts/seed-demo.mjs

demo-runs: ## Evaluate the demo policy (about 1.5 hours on an M4 Max)
	./scripts/run-demo-suite.sh

demo-upload: ## Upload the demo runs and rebuild the landing page data
	@for r in act-chunk100 act-chunk50 act-chunk25 act-ensemble; do \
	  SHAKEDOWN_URL=http://localhost:3400 SHAKEDOWN_API_KEY=$$(cat .demo-key) $(SD) upload runs/$$r; \
	done
	python3 scripts/build-demo-fixture.py runs/act-chunk100 runs/act-chunk50 runs/act-chunk25 runs/act-ensemble

demo: demo-key demo-runs demo-upload ## All three demo steps

test: ## Run every test
	$(PY) -m pytest engine/tests -q
	cd apps/web && npm test

lint: ## Lint the engine and the web app
	engine/.venv/bin/ruff check engine
	cd apps/web && npm run lint && npx tsc --noEmit

stop: ## Stop the local database
	supabase stop
