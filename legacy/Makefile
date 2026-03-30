# Ads Report Automation CLI

.PHONY: help sync fetch check brief no-fetch check-creds test clean

UV := uv
CLIENT_ARG := $(if $(CLIENT),$(CLIENT))
DATE_ARGS := $(if $(MONTH),--month $(MONTH)) $(if $(DAYS),--days $(DAYS))
BRAND_ARGS := $(if $(BRAND),--brand "$(BRAND)")
EXTRA_ARGS := $(ARGS)

help: ## Show available commands
	@echo "Ads Report Automation - Available Commands:"
	@echo ""
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-15s\033[0m %s\n", $$1, $$2}'
	@echo ""
	@echo "Examples:"
	@echo "  make fetch CLIENT=nota MONTH=2026-01"
	@echo "  make check CLIENT=nota BRAND=\"Nota Cafe\" MONTH=2026-01"
	@echo "  make brief CLIENT=nota MONTH=2026-01"
	@echo "  make no-fetch CLIENT=nota MONTH=2026-01"
	@echo "  make test"

sync: ## Sync the project environment with uv
	$(UV) sync

fetch: ## Fetch configured sources for a client
	$(UV) run campaign fetch $(CLIENT_ARG) $(DATE_ARGS) $(EXTRA_ARGS)

check: ## Run health checks for a client
	$(UV) run campaign check $(CLIENT_ARG) $(BRAND_ARGS) $(DATE_ARGS) $(EXTRA_ARGS)

brief: ## Generate internal + client summary reports
	$(UV) run campaign brief $(CLIENT_ARG) $(BRAND_ARGS) $(DATE_ARGS) $(EXTRA_ARGS)

no-fetch: ## Generate reports from cached data only
	$(UV) run campaign brief $(CLIENT_ARG) $(BRAND_ARGS) $(DATE_ARGS) --no-fetch $(EXTRA_ARGS)

check-creds: ## Check API credential status
	$(UV) run campaign config check-creds

test: ## Run unit and integration tests
	$(UV) run python -m unittest discover -s tests -v

clean: ## Remove generated files and caches
	rm -rf __pycache__ src/__pycache__ .pytest_cache
	rm -rf *.egg-info build dist
	find . -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
	find . -type f -name "*.pyc" -delete 2>/dev/null || true
