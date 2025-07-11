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
import requests

BASE_URL = "https://banking.dkb.de/api"

logger = logging.getLogger(__name__)
session = requests.Session()


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


def extract_response_data(resp: requests.Response) -> object | str:
    logger.debug("Response: %d - %s", resp.status_code, resp.text[:100])
    if not 200 <= resp.status_code < 300:
        raise Exception(
            f"Unsuccessful response code for {resp.request.url}: "
            f"{resp.status_code} - {resp.text[:100]}"
        )
    if "json" in resp.headers.get("content-type", ""):
        return resp.json()
    else:
        return resp.text


def do_get(url: str, **kwargs) -> object | str:
    resp = session.get(BASE_URL + url, **kwargs)
    return extract_response_data(resp)


def do_post(
    url: str, data: dict | None = None, json: dict | None = None, **kwargs
) -> object | str:
    # important, the server chokes with default value of application/json lol
    headers = {"Content-Type": "application/vnd.api+json"} if json is not None else None
    resp = session.post(BASE_URL + url, data=data, json=json, headers=headers, **kwargs)
    return extract_response_data(resp)


@dataclass
class PrepareLoginResult:
    access_token: str
    mfa_id: str
    challenge_id: str


def prepare_login(username: str, password: str) -> PrepareLoginResult:
    do_get("/session")
    xsrf = session.cookies.get("__Host-xsrf", None)
    logger.debug(f"xsrf: {xsrf}")
    session.headers.update({"x-xsrf-token": xsrf})

    token_data = do_post(
        "/token",
        data={
            "grant_type": "banking_user_sca",
            "username": username,
            "password": password,
            "sca_type": "web-login",
        },
    )
    mfa_id = token_data["mfa_id"]
    logger.info("Login successful! Preparing MFA challenge ...")

    mfa_data = do_get(f"/mfa/mfa/{mfa_id}/methods?filter%5BmethodType%5D=seal_one")
    challenges_data = do_post(
        "/mfa/mfa/challenges",
        json={
            "data": {
                "attributes": {
                    "methodId": mfa_data["data"][0]["id"],
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


def login(username: str):
    password = get_password()
    login_data = prepare_login(username, password)
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

    args = parser.parse_args()
    if len(args.account_index) != len(args.output):
        parser.error("Number of account indices and output files must match.")

    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="[%(levelname)s] %(message)s",
    )

    login(args.username)
    for account_index, output_file in zip(args.account_index, args.output):
        transactions = load_transactions(int(account_index))
        export_transactions(transactions, output_file, args.from_date)
    logout()


if __name__ == "__main__":
    main()
