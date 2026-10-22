from pathlib import Path

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Configuration, read from environment variables prefixed with FT_."""

    model_config = SettingsConfigDict(env_prefix="FT_")

    # Folder in which the (usually encrypted) databases sent by clients are stored.
    storage_dir: Path = Path(__file__).parent.parent / "storage"
    # If set, the frontend build in this folder is served under /.
    frontend_dir: Path | None = None
    # Exposes error details (stack traces, bank sync logs) to clients.
    debug: bool = False
    # Run the browser for DKB bank sync inside a virtual framebuffer. Required on
    # headless servers, needs the 'xvfb' system package.
    dkb_xvfb: bool = True

    @field_validator("storage_dir")
    @classmethod
    def _make_absolute(cls, path: Path) -> Path:
        # Bank sync may change the CWD of the process, so never rely on it.
        return path.resolve()


settings = Settings()
