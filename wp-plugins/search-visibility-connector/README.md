# Search Visibility Connector

WordPress plugin that exposes an authenticated REST API used by the **Creative SEO**
platform. It performs health checks, site/plugin/Rank Math detection, post &
page import, and Rank Math SEO metadata read/write.

**No Yoast support.** The plugin only ever reads/writes **Rank Math** metadata.

## Requirements

- WordPress 5.6+ (for Application Passwords)
- PHP 7.2+
- Rank Math (optional — read/write of SEO metadata is gated on Rank Math being active)

## Install

1. Copy the `search-visibility-connector` folder to `wp-content/plugins/`.
2. Activate the plugin from the Plugins screen.
3. In **Users → Profile**, create an **Application Password** for the user that the
   platform will authenticate as. Give that user an administrator role, or create a
   dedicated role/editor and grant it the `manage_options` capability (customisable
   via the `svc_required_capability` filter).
4. Give the platform the site URL, the username, and the application password.

## Authentication

- The connector only responds to **authenticated** requests (`is_user_logged_in()`)
  from a user holding the required capability (default `manage_options`).
- It is designed for **server-to-server** use with WordPress **Application Passwords**,
  which authenticate via HTTP Basic auth:
  `Authorization: Basic base64(user:app_password)`.
- There are **no unauthenticated routes**. Every route uses the same
  `permission_callback`; unauthenticated or low-privilege calls return `401`.
- Write handlers additionally verify the concrete capability (e.g. `edit_post`)
  and return `403` when the authenticated user cannot perform the action.

## Base URL

```
https://example.com/wp-json/search-visibility-connector/v1
```

## Endpoints

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/health` | Connector liveness: WP/PHP versions, DB ping, timestamp |
| `GET` | `/info` | Site information: name, url, locale, versions, timezone, connector version |
| `GET` | `/plugins` | Plugin detection: active plugins (slug, name, version) |
| `GET` | `/rank-math` | Rank Math detection: `{detected, version, meta_keys}` |
| `GET` | `/permissions` | Onboarding step 5: `{authenticated, can_read, can_write, can_manage}` |
| `GET` | `/post-types` | Public post types incl. custom (name, label, rest_base, hierarchical) |
| `GET` | `/posts` | List posts/pages/custom types. Query: `post_type`, `status`, `page`, `per_page`, `include_content` |
| `POST` | `/posts` | Create a draft: `{title, content, post_type, status, slug, excerpt}` |
| `GET` | `/posts/{id}` | Single post incl. SEO metadata (`?include_content=1` for body) |
| `PATCH` | `/posts/{id}` | Update content/title/slug/excerpt/status |
| `GET` / `PATCH` | `/posts/{id}/status` | Read/update post status |
| `GET` | `/content/{id}` | Raw content read (+ `content_hash`) |
| `PUT` | `/content/{id}` | Content write: `{content}` |
| `GET` | `/content/{id}/internal-links` | Internal (same-site) links found in content |
| `GET` / `PUT` | `/seo/{id}` | Read/write all Rank Math metadata |
| `GET` / `PUT` | `/seo/{id}/title` | SEO title |
| `GET` / `PUT` | `/seo/{id}/meta-description` | Meta description |
| `GET` / `PUT` | `/seo/{id}/canonical` | Canonical URL |
| `GET` / `PUT` | `/seo/{id}/robots` | Robots rules array |
| `GET` / `PUT` | `/seo/{id}/focus-keywords` | Focus keywords |
| `GET` / `PUT` | `/seo/{id}/schema` | Schema metadata (only when Rank Math active) |

### Pagination

`GET /posts` returns:

```json
{
  "items": [ { "wp_post_id": 42, "post_type": "post", "url": "https://...", "slug": "...", "status": "publish", "title": "...", "content_hash": "sha1...", "modified": "...", "modified_ts": 1710000000, "seo": { "available": true, "title": "...", "description": "...", "canonical": "...", "robots": [], "focus_keywords": "...", "schema": { "type": "", "schemas": {} } } } ],
  "total": 120,
  "page": 1,
  "per_page": 50,
  "total_pages": 3
}
```

`content` is omitted unless `include_content=1`. The platform imports posts using
`content_hash` and never receives raw content during initial import.

## Rank Math metadata

The connector reads/writes these standard Rank Math post meta keys:

| Field | Meta key |
| --- | --- |
| SEO title | `rank_math_title` |
| Meta description | `rank_math_description` |
| Canonical | `rank_math_canonical_url` |
| Robots | `rank_math_robots` |
| Focus keywords | `rank_math_focus_keyword` |
| Schema type | `rank_math_schema_type` |
| Schema values | `rank_math_schema_*` |

Schema is the most version-variant surface, so it is exposed as an opaque
`{type, schemas}` structure. Writing schema returns `409` when Rank Math is not
active. Robots rules are validated against an allowlist (`index`, `noindex`,
`nofollow`, `noarchive`, `noimageindex`, `nosnippet`, `notranslate`, …).

## Security

- Every route requires authentication + the required capability.
- Content is sanitised with `wp_kses_post` before storage.
- Post types and statuses are validated against WordPress registrations.
- Schema/robots/canonical inputs are validated and whitelisted.
- The plugin stores **no** credentials — authentication uses WordPress
  Application Passwords and never touches the database.
- Customise the required capability with the `svc_required_capability` filter.

## Filters

| Filter | Default | Purpose |
| --- | --- | --- |
| `svc_required_capability` | `manage_options` | Capability required for any connector call |
| `svc_rank_math_written` | — | Action fired after SEO metadata is written |

## Tests

The plugin ships PHPUnit tests for the WordPress test suite (`WP_UnitTestCase`).
See `tests/README.md` for setup and `wp scaffold plugin-tests` usage.
