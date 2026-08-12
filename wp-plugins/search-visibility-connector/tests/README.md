# Connector tests

The plugin's PHPUnit tests target the **WordPress core test suite**. They cannot
run standalone (no PHP runtime is shipped in this monorepo); run them inside a
WordPress development environment:

## Setup

```bash
# 1. Clone the WP develop test environment (once)
git clone --depth 1 https://github.com/WordPress/wordpress-develop.git /tmp/wordpress-develop

# 2. In this plugin's directory, run the tests
WP_TESTS_DIR=/tmp/wordpress-develop/tests/phpunit \
  /tmp/wordpress-develop/vendor/bin/phpunit --testsuite default
```

or use the WP-CLI scaffold which wires this up for you:

```bash
wp scaffold plugin-tests search-visibility-connector
wp plugin install-search-visibility-connector # copy plugin into the test env
bash bin/install-wp-tests.sh <db> <user> <pass> <host> latest
cd /tmp/wordpress-develop/wp-content/plugins/search-visibility-connector && phpunit
```

## Coverage

`tests/test-connector.php` verifies:

- plugin header / namespace constant,
- every required REST route is registered under `search-visibility-connector/v1`,
- unauthenticated requests return `401`,
- `/health`, `/permissions`, `/rank-math` response contracts,
- the `/posts` listing contract (incl. **no raw content** unless requested),
- draft creation + status update,
- content write round-trip + content hash,
- SEO metadata write (expects `409` when Rank Math is absent),
- internal-links extraction (same-site vs external),
- robots allowlist validation.

Tests marked Rank Math-dependent adapt to whether Rank Math is active in the
test environment.
