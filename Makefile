# Database tasks for the Guildhouse. `make` on its own lists them.
#
# Production commands read two lines from .env.production (never committed):
#   SUPABASE_PROJECT_REF=<the project's reference id, the first part of its URL>
#   SUPABASE_DB_PASSWORD=<the database password, written exactly as it is>
# The password needs no quotes or escaping; whatever follows the = is used as typed.
#
# On a network without IPv6 the direct database address cannot be reached. Add a third line with
# the Session pooler host from the dashboard's Connect button, for example:
#   SUPABASE_DB_HOST=aws-0-us-east-1.pooler.supabase.com

SHELL := /bin/bash
.DEFAULT_GOAL := help
.PHONY: help db-push-prod db-status-prod db-push-local

PROD_ENV := .env.production

# Reads one setting from the production file as plain text, so a password full of symbols is safe.
setting = $$(sed -n 's/^$(1)=//p' $(PROD_ENV) | tail -1 | sed -e 's/[[:space:]]*$$//' -e "s/^'\(.*\)'$$/\1/" -e 's/^"\(.*\)"$$/\1/')

# Builds the production database address and stops with an explanation if anything needed is missing.
# Through the pooler the user name carries the project; straight to the database it is plain postgres.
define with_prod
	command -v supabase >/dev/null || { echo "The Supabase CLI is not installed: brew install supabase/tap/supabase"; exit 1; }; \
	test -f $(PROD_ENV) || { echo "$(PROD_ENV) is missing. Create it with the two lines described at the top of the Makefile."; exit 1; }; \
	ref="$(call setting,SUPABASE_PROJECT_REF)"; password="$(call setting,SUPABASE_DB_PASSWORD)"; host="$(call setting,SUPABASE_DB_HOST)"; \
	test -n "$$ref" || { echo "SUPABASE_PROJECT_REF is not set in $(PROD_ENV); see the top of the Makefile."; exit 1; }; \
	test -n "$$password" || { echo "SUPABASE_DB_PASSWORD is not set in $(PROD_ENV); see the top of the Makefile."; exit 1; }; \
	encoded=$$(python3 -c 'import sys, urllib.parse; print(urllib.parse.quote(sys.argv[1], safe=""))' "$$password"); \
	if [ -n "$$host" ]; then user="postgres.$$ref"; else user="postgres"; host="db.$$ref.supabase.co"; fi; \
	SUPABASE_DB_URL="postgresql://$$user:$$encoded@$$host:5432/postgres"; \
	echo "Production project: $$ref"
endef

help: ## List these commands
	@grep -E '^[a-z-]+:.*## ' $(MAKEFILE_LIST) | awk -F ':.*## ' '{ printf "  make %-16s %s\n", $$1, $$2 }'

db-push-prod: ## Apply new migrations to the production database, after showing them and asking
	@$(with_prod); \
	echo "Checking production for migrations it does not have yet..."; \
	plan=$$(supabase db push --db-url "$$SUPABASE_DB_URL" --dry-run 2>&1) || { echo "$$plan"; echo; echo "Could not reach production. Check the settings in $(PROD_ENV); on a network without IPv6, see SUPABASE_DB_HOST at the top of the Makefile."; exit 1; }; \
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
