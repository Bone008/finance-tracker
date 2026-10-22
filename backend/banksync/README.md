# Bank sync scrapers

Each module exposes an `export_transactions(...)` function that logs in to an
online banking site and returns transactions as CSV. They raise `BankSyncError`
with a user-facing message on expected failures. The backend calls them from
`app/routes/banksync.py`.

For debugging, every module can also be run as a CLI, e.g.:

```bash
uv run python -m banksync.sparkasse --help
uv run python -m banksync.dkb_via_api --help
```

## DKB only: browser + system packages

`dkb_via_api.py` drives a real Chrome/Chromium browser (via `seleniumbase`) to
solve the Friendly Captcha DKB added to its login and to get its API calls past
the WAF. On a server you therefore also need a browser binary plus `xvfb`.

> **Important: do not use the snap-packaged Chromium.** On Ubuntu (18.10+),
> `apt install chromium-browser` installs a *snap*, which cannot run as a
> service account like `www-data` (no user session / snap confinement). The
> browser then never launches and the sync fails after ~120s with
> `session not created: cannot connect to chrome at 127.0.0.1:9222`.
> Use a real `.deb` browser instead.

The simplest reliable option is Google Chrome's official `.deb`:

```bash
sudo snap remove chromium    # if the unusable snap is installed
wget https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb
sudo apt install ./google-chrome-stable_current_amd64.deb   # -> /usr/bin/google-chrome
sudo apt install xvfb                                       # virtual framebuffer
```

The backend launches the browser inside a virtual framebuffer (headless servers
have no display), which needs the `xvfb` package above. For local development
on a machine with a display, set `FT_DKB_XVFB=false` to watch the browser.

`seleniumbase` downloads/patches a matching chromedriver on first use and caches
it in the running user's home directory. Make sure the service user has a
writable home and cache:

```bash
uv run sbase get chromedriver
```
