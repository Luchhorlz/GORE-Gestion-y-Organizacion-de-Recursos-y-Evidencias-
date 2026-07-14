import os

import uvicorn
from backend.app import app


def main() -> None:
    port = int(os.environ.get("APP_PORT", os.environ.get("PORT", "3010")))
    uvicorn.run(app, host="127.0.0.1", port=port, log_level="info")


if __name__ == "__main__":
    main()
