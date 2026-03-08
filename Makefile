# Ads Report Automation CLI
# Run 'make help' to see available commands

.PHONY: help install sync run check-creds verbose no-fetch test logs clean

UV := uv
RUN_ARGS := $(if $(CLIENT),-c $(CLIENT)) $(if $(MONTH),-m $(MONTH)) $(if $(DAYS),-d $(DAYS)) $(ARGS)

help: ## Show this help message
	@echo "Ads Report Automation - Available Commands:"
	@echo ""
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-15s\033[0m %s\n", $$1, $$2}'
	@echo ""
	@echo "Examples:"
	@echo "  make run                    # Interactive mode"
	@echo "  make run CLIENT=nota        # Process specific client"
	@echo "  make run MONTH=2025-01      # Process specific month"
	@echo "  make run DAYS=30            # Last 30 days of data"
	@echo "  make no-fetch CLIENT=nota   # Use cached data only"
	@echo "  make test                   # Run unit/integration tests"

install: sync ## Install dependencies

sync: ## Sync the project environment with uv
	$(UV) sync

run: ## Run the CLI tool (use CLIENT=, MONTH=, DAYS= for options)
	$(UV) run ads-report $(RUN_ARGS)

check-creds: ## Check API credential status
	$(UV) run ads-report --check-creds

verbose: ## Run in verbose mode
	$(UV) run ads-report -v $(RUN_ARGS)

no-fetch: ## Run without fetching new data (use cached data)
	$(UV) run ads-report --no-fetch $(RUN_ARGS)

test: ## Run unit and integration tests
	$(UV) run python -m unittest discover -s tests -v

logs: ## Tail the log file
	tail -f logs/ads_report.log

clean: ## Remove generated files and caches
	rm -rf __pycache__ src/__pycache__ .pytest_cache
	rm -rf *.egg-info build dist
	find . -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
	find . -type f -name "*.pyc" -delete 2>/dev/null || true
