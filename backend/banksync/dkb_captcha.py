# pylint: disable=broad-except
"""
Drive a real (undetected) Chromium browser to log in to DKB.

Since 2025-11-01 the DKB login is protected by a Friendly Captcha plus a
MyraSecurity WAF that fingerprints the TLS handshake and request shape. A plain
HTTP client (requests / curl_cffi) gets served "503 Security Check" / "502"
interstitials. Instead of fighting the WAF, we keep a real browser open for the
whole session and issue the DKB JSON-API calls as in-page ``fetch()`` requests:
they automatically inherit the browser's WAF clearance, TLS fingerprint,
cookies and XSRF token, while still returning clean JSON for the existing
parsing logic.

This mirrors the browser-wrapper approach discussed upstream in
grindsa/dkb-robo (issue #92). ``seleniumbase`` must be installed and a
Chromium/Chrome binary must be available. On a headless Linux server, run with
``xvfb=True`` (requires the ``xvfb`` package).
"""
from __future__ import annotations

import json
import logging
import os
import shutil
import tempfile
import time
from urllib.parse import urlencode

logger = logging.getLogger(__name__)

FRC_INPUT_SELECTOR = 'input[name="frc-captcha-response"]'
FRC_WIDGET_SELECTOR = "iframe.frc-i-widget"
DKB_LOGIN_URL = "https://banking.dkb.de/login"
API_BASE_URL = "https://banking.dkb.de/api"

# A Friendly Captcha token is long (~470 chars). Anything shorter is the empty
# placeholder value or an intermediate state.
MIN_TOKEN_LENGTH = 400

# JS run inside the DKB page. `p` (url/method/headers/body) is injected by the
# caller. The result is stashed on window so Python can poll for it, sidestepping
# any quirks around awaiting promises through the CDP bridge.
_FETCH_JS = """
window.__dkb_done = false;
window.__dkb_result = null;
var headers = p.headers || {};
var m = document.cookie.match(/__Host-xsrf=([^;]+)/);
if (m) { headers['x-xsrf-token'] = decodeURIComponent(m[1]); }
var opts = { method: p.method, headers: headers, credentials: 'include' };
if (p.body !== null) { opts.body = p.body; }
fetch(p.url, opts).then(function (r) {
  var status = r.status;
  var ct = r.headers.get('content-type') || '';
  return r.text().then(function (t) {
    window.__dkb_result = { status: status, body: t, ct: ct };
    window.__dkb_done = true;
  });
}).catch(function (e) {
  window.__dkb_result = { status: -1, body: String(e), ct: '' };
  window.__dkb_done = true;
});
"""


class ApiError(Exception):
    """Raised when a DKB API call returns a non-2xx status."""


class _Response:
    """Minimal requests-like response wrapper around an in-page fetch result."""

    def __init__(self, status_code: int, text: str, content_type: str):
        self.status_code = status_code
        self.text = text
        self.content_type = content_type

    def json(self):
        return json.loads(self.text)


class DkbBrowser:
    """A DKB session backed by a real browser; issues API calls via in-page fetch."""

    def __init__(
        self,
        captcha_timeout: int = 120,
        request_timeout: int = 60,
        headless: bool = False,
        xvfb: bool = False,
    ):
        self.captcha_timeout = captcha_timeout
        self.request_timeout = request_timeout
        self.headless = headless
        self.xvfb = xvfb
        self.captcha_token: str | None = None
        self._sb_cm = None
        self.sb = None
        self._workdir: str | None = None
        self._orig_cwd: str | None = None
        self._orig_home: str | None = None
        self._home_was_set: bool = False

    # -- lifecycle ---------------------------------------------------------

    def __enter__(self) -> "DkbBrowser":
        try:
            from seleniumbase import SB
        except ImportError as exc:  # pragma: no cover - environment dependent
            raise RuntimeError(
                "seleniumbase is required to log in to DKB. Install it with "
                "'pip install seleniumbase' and make sure a Chromium/Chrome "
                "binary is available."
            ) from exc

        # SeleniumBase creates scratch folders (downloaded_files/, latest_logs/)
        # in the current working directory. That is the banksync folder, which
        # is intentionally not writable by the web server user -- and we don't
        # need browser downloads anyway. So run from a private temp directory.
        # Imports are unaffected: Python resolves them via the script's own
        # directory (sys.path[0]), not the CWD.
        self._orig_cwd = os.getcwd()
        self._workdir = tempfile.mkdtemp(prefix="dkb_banksync_")
        os.chdir(self._workdir)

        # Chrome writes its profile, cache and NSS cert DB under $HOME on launch.
        # The web server user (www-data) typically cannot create new dirs in its
        # real home (e.g. /var/www is root-owned), so Chrome crashes before the
        # remote-debugging port opens -> "chrome not reachable". Point HOME at our
        # writable temp dir so all of Chrome's ~/.* writes succeed.
        self._orig_home = os.environ.get("HOME")
        self._home_was_set = "HOME" in os.environ
        os.environ["HOME"] = self._workdir

        try:
            self._sb_cm = SB(uc=True, locale="de", headless=self.headless, xvfb=self.xvfb)
            self.sb = self._sb_cm.__enter__()
            self._open_and_solve_captcha()
        except BaseException:
            # __exit__ is not called if __enter__ raises; clean up here.
            self.__exit__(None, None, None)
            raise
        return self

    def __exit__(self, *exc_info):
        try:
            if self._sb_cm is not None:
                return self._sb_cm.__exit__(*exc_info)
            return False
        finally:
            if self._orig_cwd:
                os.chdir(self._orig_cwd)
            if self._home_was_set:
                os.environ["HOME"] = self._orig_home
            else:
                os.environ.pop("HOME", None)
            if self._workdir:
                shutil.rmtree(self._workdir, ignore_errors=True)

    # -- captcha -----------------------------------------------------------

    def _open_and_solve_captcha(self) -> None:
        logger.info("Opening DKB login page and solving Friendly Captcha ...")
        self.sb.open(DKB_LOGIN_URL)

        # A plain JS .click() does not propagate into the cross-origin iframe,
        # so we use a real mouse click that reaches the checkbox inside it.
        for _ in range(30):
            self._dismiss_cookie_banner()
            try:
                elem = self.sb.cdp.find_element(FRC_WIDGET_SELECTOR)
                elem.scroll_into_view()
                time.sleep(0.5)
                elem.mouse_click()
                logger.debug("captcha: widget clicked")
                break
            except Exception:
                time.sleep(1)

        self.captcha_token = self._poll_frc_token()
        if not self.captcha_token:
            raise RuntimeError(
                "Failed to obtain a Friendly Captcha token from the DKB login "
                "page. The captcha widget may have changed, or the browser was "
                "detected as a bot."
            )

    def _dismiss_cookie_banner(self) -> None:
        for button in ("button.uc-deny-button", "button.uc-accept-button"):
            try:
                self.sb.cdp.evaluate(
                    "document.querySelector('#usercentrics-cmp-ui')"
                    f".shadowRoot.querySelector('{button}').click()"
                )
                logger.debug("captcha: cookie banner dismissed via %s", button)
                return
            except Exception:
                continue

    def _poll_frc_token(self) -> str | None:
        logger.debug("captcha: waiting up to %ds for token", self.captcha_timeout)
        for _ in range(self.captcha_timeout):
            try:
                val = self.sb.cdp.evaluate(
                    f"document.querySelector('{FRC_INPUT_SELECTOR}').value"
                )
                if val and len(val) > MIN_TOKEN_LENGTH:
                    logger.debug("captcha: token obtained (%d chars)", len(val))
                    return val
            except Exception:
                pass
            time.sleep(1)
        logger.error("captcha: timed out waiting for token")
        return None

    # -- HTTP transport (in-page fetch) ------------------------------------

    def request(
        self, method: str, path: str, data: dict | None = None, json_body: dict | None = None
    ) -> _Response:
        """Issue an API call from inside the browser page and return the response."""
        headers: dict[str, str] = {}
        body: str | None = None
        if json_body is not None:
            body = json.dumps(json_body)
            # The server chokes on a plain application/json content type.
            headers["Content-Type"] = "application/vnd.api+json"
        elif data is not None:
            body = urlencode(data)
            headers["Content-Type"] = "application/x-www-form-urlencoded"

        payload = {
            "url": API_BASE_URL + path,
            "method": method.upper(),
            "headers": headers,
            "body": body,
        }
        script = "(function(){var p=" + json.dumps(payload) + ";" + _FETCH_JS + "})();"
        self.sb.cdp.evaluate(script)

        for _ in range(self.request_timeout * 2):
            if self.sb.cdp.evaluate("window.__dkb_done === true"):
                break
            time.sleep(0.5)
        else:
            raise TimeoutError(f"In-browser fetch to {path} timed out")

        raw = self.sb.cdp.evaluate("JSON.stringify(window.__dkb_result)")
        result = json.loads(raw)
        status = result.get("status")
        text = result.get("body") or ""
        logger.debug("Response: %s - %s", status, text[:100])

        if status is None or not 200 <= status < 300:
            raise ApiError(
                f"Unsuccessful response code for {path}: {status} - {text[:200]}"
            )
        return _Response(status, text, result.get("ct") or "")
