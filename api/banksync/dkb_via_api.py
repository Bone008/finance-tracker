#!/usr/bin/python3
from __future__ import annotations

import argparse
import logging
import os
import sys
import time
from dataclasses import dataclass
from getpass import getpass

import pandas as pd

from dkb_captcha import DkbBrowser

logger = logging.getLogger(__name__)

# All API calls go through a real browser (DkbBrowser) via in-page fetch, so we
# inherit DKB's MyraSecurity WAF clearance, TLS fingerprint, cookies and XSRF
# token. The active browser session is stored here for do_get/do_post to use.
browser: DkbBrowser | None = None


def _parse(resp) -> object | str:
    # Some endpoints (e.g. /revoke) reply 2xx with an empty body; don't try to
    # JSON-decode that.
    if resp.text and "json" in resp.content_type:
        return resp.json()
    return resp.text


def do_get(url: str) -> object | str:
    return _parse(browser.request("GET", url))


def do_post(url: str, data: dict | None = None, json: dict | None = None) -> object | str:
    return _parse(browser.request("POST", url, data=data, json_body=json))


def get_password() -> str:
    if os.isatty(0):
        pwd = ""
        while not pwd.strip():
            pwd = getpass("Password: ")
        return pwd
    else:
        return sys.stdin.read().strip()


def flatten_dict(d: dict, parent_key: str = "", sep: str = ".") -> dict:
    """
    Flattens a nested dictionary into a single level dictionary.
    """
    items = []
    for k, v in d.items():
        new_key = f"{parent_key}{sep}{k}" if parent_key else k
        if isinstance(v, dict):
            items.extend(flatten_dict(v, new_key, sep=sep).items())
        else:
            items.append((new_key, v))
    return dict(items)


@dataclass
class PrepareLoginResult:
    access_token: str
    mfa_id: str
    challenge_id: str


def prepare_login(
    username: str, password: str, captcha_token: str
) -> PrepareLoginResult:
    # Initialise the server-side session. The browser stores the __Host-xsrf
    # cookie; the in-page fetch transport sends it back as x-xsrf-token.
    do_get("/session")

    token_data = do_post(
        "/token",
        data={
            # Since 2025-11-01 DKB requires a Friendly Captcha token here.
            "captcha_token": captcha_token,
            "grant_type": "banking_user_sca",
            "username": username,
            "password": password,
            "sca_type": "web-login",
        },
    )
    mfa_id = token_data["mfa_id"]
    logger.info("Login successful! Preparing MFA challenge ...")

    mfa_data = do_get(f"/mfa/mfa/{mfa_id}/methods?filter%5BmethodType%5D=seal_one")
    # An account can have several enrolled devices. Pick the most recently
    # enrolled one (the newest phone) rather than blindly the first.
    method = max(
        mfa_data["data"],
        key=lambda m: m["attributes"].get("enrolledAt", ""),
    )
    logger.info(
        "Using MFA device '%s' (enrolled %s)",
        method["attributes"].get("deviceName", "?"),
        method["attributes"].get("enrolledAt", "?"),
    )
    challenges_data = do_post(
        "/mfa/mfa/challenges",
        json={
            "data": {
                "attributes": {
                    "methodId": method["id"],
                    "methodType": "seal_one",
                    "mfaId": mfa_id,
                },
                "type": "mfa-challenge",
            }
        },
    )
    challenge_id = challenges_data["data"]["id"]
    logger.info("Challenge prepared!")

    return PrepareLoginResult(
        access_token=token_data["access_token"],
        mfa_id=mfa_id,
        challenge_id=challenge_id,
    )


def wait_for_mfa_success(challenge_id: str) -> None:
    MAX_DURATION = 60  # seconds
    POLL_INTERVAL = 3  # seconds

    attempts = 0
    while True:
        attempts += 1
        challenge_data = do_get(f"/mfa/mfa/challenges/{challenge_id}")
        status = challenge_data["data"]["attributes"]["verificationStatus"]
        if status == "processed":
            logger.info("MFA successful!")
            break
        elif status == "processing":
            logger.info("MFA still pending ...")
            if attempts > MAX_DURATION / POLL_INTERVAL:
                raise TimeoutError("MFA challenge took too many attempts!")
            time.sleep(POLL_INTERVAL)
        else:
            raise ValueError(f"Unexpected challenge status: {status}")


def complete_login(mfa_id: str, access_token: str):
    # need to generate yet another token, using access_token from login
    token_data2 = do_post(
        "/token",
        data={
            "grant_type": "banking_user_mfa",
            "mfa_id": mfa_id,
            "access_token": access_token,
        },
    )
    logger.info("Login completed!")
    return token_data2
    # Side note: Could in theory refresh token if long-term access is needed:
    # do_post("/refresh", data={"grant_type": "refresh_token", "refresh_token": ""})


def login(username: str, password: str):
    # The browser has already loaded the login page and solved the captcha.
    login_data = prepare_login(username, password, browser.captcha_token)
    wait_for_mfa_success(login_data.challenge_id)
    complete_login(login_data.mfa_id, login_data.access_token)


def logout():
    try:
        do_post("/revoke", data={"token": "no-token"})
        logger.info("Logged out.")
    except Exception:
        logger.exception("Failed to log out, but ignoring error!")


def load_transactions(account_index: int) -> list[dict]:
    accounts_data = do_get("/accounts/accounts")
    account_id = accounts_data["data"][account_index]["id"]
    logger.info(f"Loading from account {account_index}: {account_id}")

    transactions_data = do_get(
        f"/accounts/accounts/{account_id}/transactions?expand=Merchant"
    )
    return transactions_data["data"]


def export_transactions(transactions: list[dict], output_file: str, from_date: str):
    df = pd.DataFrame(
        {"id": value["id"], **flatten_dict(value["attributes"])}
        for value in transactions
    )

    def get_who(row) -> str:
        return "debtor" if float(row["amount.value"]) > 0 else "creditor"

    def get_other_name(row) -> str:
        who = get_who(row)
        return row[f"{who}.name"]

    def get_other_iban(row) -> str:
        who = get_who(row)
        return row[f"{who}.{who}Account.iban"]

    df["other.name"] = df.apply(get_other_name, axis=1)
    df["other.iban"] = df.apply(get_other_iban, axis=1)

    # Pick columns which will be included in the CSV.
    df_filtered = df[
        [
            "id",
            "status",
            # date
            "bookingDate",
            "valueDate",  # <-- probably the one i want
            # amount
            "amount.currencyCode",
            "amount.value",
            # reason
            "description",
            # who
            "other.name",
            "other.iban",
            # bookingText
            "transactionType",
        ]
    ]

    # Filter transactions by date.
    df_export = df_filtered[
        (df_filtered["status"] != "pending") & (df_filtered["valueDate"] >= from_date)
    ]
    logger.info(f"Found {len(df_export)} transactions since {from_date}.")

    df_export.to_csv(output_file, index=False)
    logger.info(f"Exported transactions to {output_file}")


def main():
    parser = argparse.ArgumentParser(description="Exports bank transactions from DKB.")
    parser.add_argument(
        "--username",
        required=True,
        help="Username to log in with.",
    )
    parser.add_argument(
        "--from-date",
        required=True,
        help="Begin of date range to export in YYYY-MM-DD format.",
    )
    parser.add_argument(
        "--account-index",
        action="append",
        required=True,
        help="Index of account to export. Can be specified multiple times.",
    )
    parser.add_argument(
        "--output",
        "-o",
        action="append",
        required=True,
        help="File to write the exported data to. Can be specified multiple times.",
    )
    parser.add_argument(
        "-v",
        "--verbose",
        action="store_true",
        help="Enable verbose logging.",
    )
    parser.add_argument(
        "--captcha-xvfb",
        action="store_true",
        help="Run the browser inside a virtual framebuffer (xvfb). Recommended "
        "on headless Linux servers; requires the 'xvfb' package.",
    )
    parser.add_argument(
        "--captcha-headless",
        action="store_true",
        help="Run the browser in headless mode. Easier to set up but more "
        "likely to be detected as a bot than --captcha-xvfb.",
    )

    args = parser.parse_args()
    if len(args.account_index) != len(args.output):
        parser.error("Number of account indices and output files must match.")

    # Keep the root logger (and thus the chatty browser-automation stack: CDP
    # websocket frames etc.) at WARNING, and only raise verbosity for our own
    # modules. This avoids having to enumerate every noisy third-party logger.
    # Note: run as a script, this module's logger is named "__main__".
    logging.basicConfig(level=logging.WARNING, format="[%(levelname)s] %(message)s")
    app_level = logging.DEBUG if args.verbose else logging.INFO
    logger.setLevel(app_level)
    logging.getLogger("dkb_captcha").setLevel(app_level)

    global browser
    password = get_password()
    # The browser stays open for the whole session: every API call is issued as
    # an in-page fetch so it inherits the browser's WAF clearance and TLS
    # fingerprint. Entering the context also solves the login captcha.
    with DkbBrowser(
        headless=args.captcha_headless, xvfb=args.captcha_xvfb
    ) as browser:
        login(args.username, password)
        for account_index, output_file in zip(args.account_index, args.output):
            transactions = load_transactions(int(account_index))
            export_transactions(transactions, output_file, args.from_date)
        logout()


if __name__ == "__main__":
    main()
