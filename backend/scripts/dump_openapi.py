"""Write the OpenAPI schema of the API to a file, without a database or a running server.

Used by the frontend (`npm run gen:api`) to generate its TypeScript types:

    uv run python scripts/dump_openapi.py ../frontend/openapi.json

The app is built with fixed settings (no `.env`, no environment) so the schema does not depend on
the machine: demo routes are left out on purpose (they exist only with DEV_AUTH=1) and the
lifespan is never started, so nothing connects to Postgres, Google or the AI provider.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

# Allow `python scripts/dump_openapi.py` from the backend directory without installing the package.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.core.settings import Settings
from app.main import create_app


def main(argv: list[str]) -> int:
    if len(argv) != 2:
        print("uso: python scripts/dump_openapi.py <percorso/openapi.json>", file=sys.stderr)
        return 2
    settings = Settings(
        _env_file=None,  # type: ignore[call-arg]
        app_env="development",
        dev_auth=False,
        assistant_provider="none",
    )
    schema = create_app(settings).openapi()
    target = Path(argv[1])
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(schema, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"OpenAPI {schema['info']['version']}: {len(schema.get('paths', {}))} percorsi → {target}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
