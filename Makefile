# Database tasks for the Guildhouse. `make` on its own lists them.
#
# Production commands read the database address from .env.production (never committed):
#   SUPABASE_DB_URL='postgresql://postgres.<project-ref>:<password>@<host>:5432/postgres'
# Copy it from the Supabase dashboard: Connect, Session pooler. Keep the single quotes, and
# percent-encode any special characters in the password (for example @ becomes %40).

SHELL := /bin/bash
.DEFAULT_GOAL := help
.PHONY: help db-push-prod db-status-prod db-push-local

PROD_ENV := .env.production

# Loads the production settings and stops with an explanation if anything needed is missing.
define with_prod
	command -v supabase >/dev/null || { echo "The Supabase CLI is not installed: brew install supabase/tap/supabase"; exit 1; }; \
	test -f $(PROD_ENV) || { echo "$(PROD_ENV) is missing. Create it with a SUPABASE_DB_URL line; see the top of the Makefile."; exit 1; }; \
	set -a; . ./$(PROD_ENV); set +a; \
	test -n "$$SUPABASE_DB_URL" || { echo "SUPABASE_DB_URL is not set in $(PROD_ENV); see the top of the Makefile."; exit 1; }; \
	case "$$SUPABASE_DB_URL" in *127.0.0.1*|*localhost*) echo "SUPABASE_DB_URL in $(PROD_ENV) points at this machine, not production."; exit 1;; esac
endef

help: ## List these commands
	@grep -E '^[a-z-]+:.*## ' $(MAKEFILE_LIST) | awk -F ':.*## ' '{ printf "  make %-16s %s\n", $$1, $$2 }'

db-push-prod: ## Apply new migrations to the production database, after showing them and asking
	@$(with_prod); \
	echo "Checking production for migrations it does not have yet..."; \
	plan=$$(supabase db push --db-url "$$SUPABASE_DB_URL" --dry-run 2>&1) || { echo "$$plan"; echo; echo "Could not reach production. Check SUPABASE_DB_URL in $(PROD_ENV)."; exit 1; }; \
	echo "$$plan" | grep -v -i -e 'new version of supabase' -e 'recommend updating'; \
	if echo "$$plan" | grep -q -i 'up to date'; then exit 0; fi; \
	read -r -p "Apply these to PRODUCTION? Type yes to go ahead: " answer; \
	[ "$$answer" = "yes" ] || { echo "Nothing was changed."; exit 1; }; \
	supabase db push --db-url "$$SUPABASE_DB_URL" --yes

db-status-prod: ## Show which migrations production has and which it is missing
	@$(with_prod); \
	supabase migration list --db-url "$$SUPABASE_DB_URL"

db-push-local: ## Apply new migrations to the local database (needs `supabase start`)
	@supabase migration up --local
