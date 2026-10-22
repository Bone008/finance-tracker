"""Server-side bank sync: logs in to online banking and exports transactions as CSV."""

import io
import logging
import threading
from collections.abc import Iterator
from contextlib import contextmanager
from datetime import datetime, timedelta
from typing import Annotated, Literal
from zoneinfo import ZoneInfo

from fastapi import APIRouter
from pydantic import BaseModel, ConfigDict, Field, StringConstraints
from pydantic.alias_generators import to_camel

from app.settings import settings
from banksync import BankSyncError, dkb_via_api, sparkasse

router = APIRouter(tags=["banksync"])
logger = logging.getLogger(__name__)

# Let all records through; capture_logs() decides what to keep.
logging.getLogger("banksync").setLevel(logging.DEBUG)

NonEmptyStr = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1)]


class BankSyncRequest(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel)

    bank_type: Literal["sparkasse", "dkb"]
    bank_url: NonEmptyStr
    login_name: NonEmptyStr
    login_password: Annotated[str, Field(min_length=1)]
    max_transaction_age: Annotated[int, Field(ge=1)]
    account_indices: Annotated[list[Annotated[int, Field(ge=0)]], Field(min_length=1)]
    verbose: bool = False


@contextmanager
def capture_logs(verbose: bool) -> Iterator[io.StringIO]:
    """Collects log output of the banksync package from the current thread."""
    buffer = io.StringIO()
    handler = logging.StreamHandler(buffer)
    handler.setLevel(logging.DEBUG if verbose else logging.INFO)
    handler.setFormatter(logging.Formatter("[%(levelname)s] %(message)s"))
    # Ignore records from concurrent requests handled by other threads.
    thread_id = threading.get_ident()
    handler.addFilter(lambda record: record.thread == thread_id)

    banksync_logger = logging.getLogger("banksync")
    banksync_logger.addHandler(handler)
    try:
        yield buffer
    finally:
        banksync_logger.removeHandler(handler)


@router.post("/banksync")
def banksync(request: BankSyncRequest) -> dict:
    """Exports the transactions of the requested accounts.

    Note that the client assumes that the results ALWAYS have the same length as
    the requested account indices and that entries correspond accordingly!
    """
    today = datetime.now(ZoneInfo("Europe/Berlin")).date()
    from_date = today - timedelta(days=request.max_transaction_age)
    # Note: Sparkasse does not allow the "to" date to be in the future.
    to_date = today

    with capture_logs(request.verbose) as log:
        try:
            match request.bank_type:
                case "sparkasse":
                    csv_results = [
                        sparkasse.export_transactions(
                            request.bank_url,
                            request.login_name,
                            request.login_password,
                            account_index,
                            from_date,
                            to_date,
                        )
                        for account_index in request.account_indices
                    ]
                case "dkb":
                    if len(request.account_indices) > 1:
                        return {
                            "error": "Importing multiple accounts is not supported yet for DKB! "
                            "Please open an issue on GitHub if you need this feature."
                        }
                    csv_results = dkb_via_api.export_transactions(
                        request.login_name,
                        request.login_password,
                        from_date,
                        request.account_indices,
                        xvfb=settings.dkb_xvfb,
                    )
        except BankSyncError as e:
            logger.warning("Bank sync failed: %s", e)
            return {
                "error": str(e),
                "errorDetails": log.getvalue() if settings.debug else None,
            }
        except Exception as e:
            logger.exception("Bank sync failed unexpectedly")
            return {
                "error": f"An unexpected error occurred: {e}",
                "errorDetails": log.getvalue() if settings.debug else None,
            }

    return {
        "success": True,
        "results": [
            {"data": csv_data, "log": log.getvalue() if settings.debug else ""}
            for csv_data in csv_results
        ],
    }
