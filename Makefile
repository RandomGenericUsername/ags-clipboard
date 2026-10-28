.PHONY: help platform-dev deps types test conformance drift ci bundle typecheck gates clean-tags

# The program tuple this app builds/tests against (AD-31/AD-34). v0.3.0 is the
# REQ-008 adoption tuple and is LOCAL-ONLY in this run: local gates symlink it
# from .dev/ (gitignored), CI checks out the tags explicitly once published.
AGS_PLATFORM_VERSION := v0.3.0
CONTRACTS_VERSION := v0.3.0
AGS_PLATFORM_REPO := https://github.com/RandomGenericUsername/ags-platform.git
AGS_PLATFORM_DEV ?=
PLATFORM_FETCH_DIR := $(CURDIR)/.dev/ags-platform/$(AGS_PLATFORM_VERSION)
PLATFORM_SRC := $(if $(AGS_PLATFORM_DEV),$(AGS_PLATFORM_DEV),$(PLATFORM_FETCH_DIR))
CONTRACTS_ROOT ?= $(CURDIR)/../contracts
BUNDLE_FILE := build/ags-clipboard.js

help:
	@echo "make test         pure unit tests (Node only; stock runner)"
	@echo "make conformance  manifest + handler + template conformance"
	@echo "make drift        shared event client <-> contracts drift gate"
	@echo "make typecheck    desktop-stack tsc gate (LOCAL; needs ags + GIR)"
	@echo "make bundle       ags bundle smoke build (LOCAL; needs ags)"
	@echo "make ci           stock-runner gate: test + conformance"
	@echo "make gates        all local gates: test + conformance + bundle + typecheck"
	@echo ""
	@echo "Local-only v0.3.0 tuple: put a checkout/symlink at"
	@echo "  .dev/ags-platform/v0.3.0  (or AGS_PLATFORM_DEV=/path/to/ags-platform)"
	@echo "and a contracts checkout at ../contracts (or set CONTRACTS_ROOT)."

# The platform shortcut. It MUST point outside node_modules: Node refuses to
# type-strip `.ts` under a real node_modules directory, but realpaths a symlink
# whose target sits outside. AGS's esbuild resolves the same bare specifier.
platform-dev:
	@mkdir -p "$(dir $(PLATFORM_FETCH_DIR))" node_modules
	@src=""; \
	if [ -n "$(AGS_PLATFORM_DEV)" ]; then \
		src="$(AGS_PLATFORM_DEV)"; \
	elif [ -f "$(PLATFORM_FETCH_DIR)/index.ts" ]; then \
		src="$(PLATFORM_FETCH_DIR)"; \
	elif [ -f "$(CURDIR)/../ags-platform/index.ts" ]; then \
		echo "==> platform-dev: linking local ags-platform checkout at $(PLATFORM_FETCH_DIR)"; \
		ln -sfn ../../../ags-platform "$(PLATFORM_FETCH_DIR)"; \
		src="$(PLATFORM_FETCH_DIR)"; \
	else \
		echo "==> platform-dev: fetching ags-platform $(AGS_PLATFORM_VERSION) (shallow)"; \
		rm -rf "$(PLATFORM_FETCH_DIR)"; \
		git clone --depth 1 --branch $(AGS_PLATFORM_VERSION) $(AGS_PLATFORM_REPO) "$(PLATFORM_FETCH_DIR)" || exit 1; \
		rm -rf "$(PLATFORM_FETCH_DIR)/.git"; \
		src="$(PLATFORM_FETCH_DIR)"; \
	fi; \
	[ -f "$$src/index.ts" ] || { echo "FAIL: platform-dev: $$src/index.ts is missing" >&2; exit 1; }; \
	ln -sfn "$$src" node_modules/ags-platform; \
	echo "==> platform-dev: node_modules/ags-platform -> $$src"

# TypeScript for the local typecheck and stock test-typecheck. Installed
# --no-save so no lockfile or node_modules is committed.
deps:
	@if [ ! -x node_modules/.bin/tsc ]; then \
		echo "==> deps: installing typescript@5.9 (npm install --no-save, gitignored)"; \
		npm install --no-save --no-package-lock typescript@5.9 >/dev/null || exit 1; \
	fi

# Machine-specific GIR declarations, generated for THIS host. `ags types`
# writes @girs/, env.d.ts and its own tsconfig.json (all gitignored); the
# committed typecheck config is tsconfig.app.json precisely to survive that.
types:
	@command -v ags >/dev/null || { echo "FAIL: types: ags is not on PATH (desktop stack)" >&2; exit 1; }
	@if [ -d "@girs" ]; then \
		echo "==> types: @girs/ already generated, skipping (rm -rf @girs to force)"; \
	else \
		echo "==> types: generating this host's GIR declarations"; \
		ags types -d "$(CURDIR)" -u || exit 1; \
	fi

# Pure unit tests. Node's native type stripping runs the app's real .ts
# modules; nothing reachable imports `gi://*` or `ags/*`.
test: platform-dev
	@command -v node >/dev/null || { echo "FAIL: test: node is not on PATH" >&2; exit 1; }
	@echo "==> test: node --test tests/unit.test.mjs"
	node --test tests/unit.test.mjs

# Manifest/handler/template conformance. The platform's own checkAppRepo gate
# plus the app-specific identity, refresh and namespace assertions.
conformance: platform-dev
	@command -v node >/dev/null || { echo "FAIL: conformance: node is not on PATH" >&2; exit 1; }
	@[ -f "$(CONTRACTS_ROOT)/schemas/ags-app-manifest.schema.json" ] || { \
		echo "FAIL: conformance: no contracts schema at $(CONTRACTS_ROOT) (set CONTRACTS_ROOT)" >&2; exit 1; }
	@echo "==> conformance: node --test tests/app-contract.test.mjs"
	CONTRACTS_ROOT="$(CONTRACTS_ROOT)" node --test tests/app-contract.test.mjs

# Contract drift: the shared event client and the app's pure helpers against
# the canonical contracts v0.3.0 checkout. Stock runner.
drift: platform-dev
	@command -v node >/dev/null || { echo "FAIL: drift: node is not on PATH" >&2; exit 1; }
	@[ -f "$(CONTRACTS_ROOT)/event-contract.json" ] || { \
		echo "FAIL: drift: no event-contract.json at $(CONTRACTS_ROOT) (set CONTRACTS_ROOT)" >&2; exit 1; }
	@echo "==> drift: node tests/event-contract-drift.mjs"
	CONTRACTS_REPO="$(CONTRACTS_ROOT)" node tests/event-contract-drift.mjs

# Stock-runner gate: exactly what CI runs. No AGS, no GTK, no generated GIR.
ci: test conformance drift

# AGS bundle smoke build. This catches an esbuild resolution/import error that
# the pure tests cannot see; it is a LOCAL gate because it needs the ags CLI.
bundle: platform-dev
	@command -v ags >/dev/null || { echo "FAIL: bundle: ags is not on PATH" >&2; exit 1; }
	@mkdir -p build
	@echo "==> bundle: ags bundle app.tsx $(BUNDLE_FILE)"
	ags bundle app.tsx "$(BUNDLE_FILE)"
	@[ -s "$(BUNDLE_FILE)" ] || { echo "FAIL: bundle: $(BUNDLE_FILE) is empty/missing" >&2; exit 1; }
	@echo "    OK: $(BUNDLE_FILE) ($$(wc -c < "$(BUNDLE_FILE)") bytes)"

# Desktop-stack typecheck: zero errors allowed in this repo's tree. Tolerate
# and count the AGS runtime's own /usr/share/ags/js errors (machine/GIR
# dependent) and the external platform unit's (AD-17: its own repo gates it).
typecheck: deps types platform-dev
	@[ -d "@girs" ] || { echo "FAIL: typecheck: @girs missing after types" >&2; exit 1; }
	@[ -x node_modules/.bin/tsc ] || { echo "FAIL: typecheck: typescript missing after deps" >&2; exit 1; }
	@[ -f node_modules/ags-platform/index.ts ] || { echo "FAIL: typecheck: platform link missing" >&2; exit 1; }
	@[ -e node_modules/ags ] || ln -sfn /usr/share/ags/js node_modules/ags
	@[ -e node_modules/gnim ] || ln -sfn /usr/share/ags/js/node_modules/gnim node_modules/gnim
	@echo "==> typecheck: tsc --noEmit -p tsconfig.app.json"
	@log=$$(mktemp); \
	npx tsc --noEmit -p tsconfig.app.json > "$$log" 2>&1; \
	ours=$$(grep 'error TS' "$$log" | grep -E '^(app\.tsx|lib/|ui/|env\.d\.ts)' || true); \
	thirdparty=$$(grep 'error TS' "$$log" | grep -F '/usr/share/ags/js/' || true); \
	platform=$$(grep 'error TS' "$$log" | grep -F 'ags-platform/' || true); \
	other=$$(grep 'error TS' "$$log" | grep -vE '^(app\.tsx|lib/|ui/|env\.d\.ts)' | grep -vF '/usr/share/ags/js/' | grep -vF 'ags-platform/' || true); \
	echo "    tolerated third-party errors (/usr/share/ags/js): $$(printf '%s\n' "$$thirdparty" | grep -c . || true)"; \
	echo "    tolerated ags-platform errors (external unit): $$(printf '%s\n' "$$platform" | grep -c . || true)"; \
	if [ -n "$$other" ]; then \
		echo "FAIL: errors in neither this repo nor the known ags runtime:"; \
		printf '%s\n' "$$other"; rm -f "$$log"; exit 1; \
	fi; \
	if [ -n "$$ours" ]; then \
		echo "FAIL: type errors in the ags-clipboard tree:"; \
		printf '%s\n' "$$ours"; rm -f "$$log"; exit 1; \
	fi; \
	echo "    OK: 0 errors in the ags-clipboard tree"; \
	rm -f "$$log"

gates: test conformance drift bundle typecheck

clean-tags:
	@rm -rf build
