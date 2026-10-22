"""Scrapers that export bank transactions as CSV, for server-side bank sync."""


class BankSyncError(Exception):
  """An expected failure during bank sync, with a message suitable for the user."""
