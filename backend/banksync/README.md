# Server-side bank sync — Python setup

The scripts in this folder (`dkb_via_api.py`, `sparkasse.py`, …) are executed by
the PHP API (`../banksync.php`) as subprocesses. They run under the web server
user (e.g. `www-data`), using the Python interpreter at `PYTHON_EXECUTABLE`.

`PYTHON_EXECUTABLE` is derived in [`../ini.php`](../ini.php) from the
`FT_PYTHON_VENV` environment variable:

- If `FT_PYTHON_VENV` points to an existing directory, the interpreter is
  `$FT_PYTHON_VENV/bin/python`.
- Otherwise it falls back to `python3` on `PATH`.

So the setup is: **create a Python 3.12+ virtualenv, install `requirements.txt`
into it, and point `FT_PYTHON_VENV` at it.**

## 1. Get Python 3.12+

Any Python ≥ 3.12 works. If your distro doesn't ship one, [pyenv](https://github.com/pyenv/pyenv)
is a convenient option:

```bash
pyenv install 3.12
```

It does **not** matter which user installs the interpreter or creates the venv.
A venv created by your own user can be used by `www-data`, as long as the venv
directory is readable and executable by that user (the usual default).

## 2. Create the virtualenv

```bash
# with the Python you want (e.g. a pyenv shim, or any python3.12+)
python3.12 -m venv /path/to/your/venv
```

Pick any stable location outside the web root.

## 3. Install the requirements

Using [uv](https://github.com/astral-sh/uv) (fast):

```bash
uv pip install --python /path/to/your/venv/bin/python -r requirements.txt
```

…or plain pip:

```bash
/path/to/your/venv/bin/pip install -r requirements.txt
```

## 4. Point the API at the venv

Set `FT_PYTHON_VENV` in the environment of the PHP process (same mechanism as
`FT_STORAGE_DIR`). For example, with Apache + mod_php in the vhost/`.htaccess`:

```apache
SetEnv FT_PYTHON_VENV /path/to/your/venv
```

Restart the web server afterwards.

## 5. DKB only: browser + system packages

`dkb_via_api.py` drives a real Chrome/Chromium browser (via `seleniumbase`) to
solve the Friendly Captcha DKB added to its login and to get its API calls past
the WAF. On a server you therefore also need a browser binary plus `xvfb`.

> **Important: do not use the snap-packaged Chromium.** On Ubuntu (18.10+),
> `apt install chromium-browser` installs a *snap*, which cannot run as a
> service account like `www-data` (no user session / snap confinement). The
> browser then never launches and the script fails after ~120s with
> `session not created: cannot connect to chrome at 127.0.0.1:9222`.
> Use a real `.deb` browser instead.

The simplest reliable option is Google Chrome's official `.deb`:

```bash
sudo snap remove chromium    # if the unusable snap is installed
wget https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb
sudo apt install ./google-chrome-stable_current_amd64.deb   # -> /usr/bin/google-chrome
sudo apt install xvfb                                       # virtual framebuffer
```

`banksync.php` runs the script with `--captcha-xvfb`, which launches the browser
inside a virtual framebuffer (headless servers have no display). This needs the
`xvfb` package above.

`seleniumbase` downloads/patches a matching chromedriver on first use and caches
it in the running user's home directory. Make sure `www-data` has a writable
home and cache:

```bash
/path/to/your/venv/bin/sbase get chromedriver
```

## Verify

```bash
# As the web server user, confirm the interpreter and deps resolve:
sudo -H -u www-data /path/to/your/venv/bin/python -c "import pandas, seleniumbase; print('ok')"
```

Then trigger a bank sync from the app; with DEBUG mode on, the API surfaces the
script's stderr on failure.
