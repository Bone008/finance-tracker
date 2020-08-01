import argparse
import getpass
import logging
import random
import sys
import time
from urllib.parse import urljoin

import requests
from lxml import html

# This is the encoding that Sparkasse uses for their CSV files.
SERVER_FILE_ENCODING = 'windows-1252'
# This is the encoding that we use to write CSV data to STDOUT.
# In order for PHP to successfully encode it to JSON, it seems like this needs
# to be set to UTF-8.
OUTPUT_ENCODING = 'utf-8'

ACCEPTED_EXPORT_BUTTONS = ['CSV-CAMT-Format', 'CSV-Format']
THROTTLE_DELAY_RANGE = (1, 2.5)

def log_result_error(*msg):
  logging.error(' '.join(str(s) for s in msg))
  print(*msg)

def log_info(*msg):
  logging.info(' '.join(str(s) for s in msg))

def log_debug(*msg):
  logging.debug(' '.join(str(s) for s in msg))


def wait():
  log_info('(Throttling ...)')
  time.sleep(random.uniform(*THROTTLE_DELAY_RANGE))


def to_html(response: requests.Response):
  doc = html.fromstring(response.text)
  doc.make_links_absolute(response.url)
  return doc


def find_form_by_value(doc: html.HtmlElement, value: str) -> html.FormElement:
  for form in doc.forms:
    if value in form.fields.values():
      return form
  return None


def submit_form(session: requests.Session, form: html.FormElement):
  url = form.action
  form_data = dict(form.fields)
  redacted_form_data = {k: '...' if v else v for k, v in form_data.items()}
  log_debug('Submitting form to URL:', url)
  log_debug('Form data:', redacted_form_data)
  return session.post(url, data=form_data)


def infer_msgerror(doc: html.HtmlElement) -> str:
  """Extract error messages from HTML document, or return a generic error.
  Only use when it is already known that an error occured."""

  errors = [e.text_content() for e in doc.cssselect('.msgerror')]
  if not errors:
    return 'Cause unknown!'
  for i in range(len(errors)):
    if errors[i].startswith('Fehlermeldung:'):
      errors[i] = errors[i][len('Fehlermeldung:'):]
  return ' && '.join(errors)


def do_login(session: requests.Session, base_url: str, user_id: str, user_pass: str):
  url = urljoin(base_url, '/de/home.html')
  log_info('Loading %s ...' % url)
  r = session.get(url)
  doc = to_html(r)

  login_form = find_form_by_value(doc, 'Anmelden')
  if login_form is None:
    log_result_error('Could not locate login form!')
    return None
  # Fill out form. Input names are randomly generated, so we have to infer them.
  for input_elem in login_form.inputs:
    if input_elem.label is not None and input_elem.label.text == 'Anmeldename':
      input_elem.value = user_id
    elif input_elem.type == 'password':
      input_elem.value = user_pass
    #log_debug(input_elem.name + ' -> ' + input_elem.value)
  
  wait()
  log_info('Logging in...')
  r = submit_form(session, login_form)
  log_debug('Response URL:', r.url)
  
  if 'finanzstatus.html' in r.url:
    log_info('Login successful!')
    return True
  elif 'pin-sperre-aufheben.html' in r.url:
    log_result_error('Login error: Too many failed login attempts!')
    return False
  elif 'sca-legitimation.html' in r.url:
    log_result_error('Login error: TAN required! Please log in manually.')
    return False
  else:
    doc = to_html(r)
    log_result_error('Login error:', infer_msgerror(doc))
    return False


def do_load_transactions(session: requests.Session, base_url: str, date_from: str, date_to: str, account_index: int):
  log_info('Navigating to transactions page ...')
  url = urljoin(base_url, '/de/home/onlinebanking/umsaetze/umsaetze.html?n=true&stref=hnav')
  r = session.get(url)
  doc = to_html(r)

  # Locate form.
  search_form = find_form_by_value(doc, 'Aktualisieren')
  if search_form is None:
    log_result_error('Could not locate search form!')
    return None
  
  # Fill out form.
  found_date_from = False
  for input_elem in search_form.inputs:
    # Drop all submits other than the one we want to click.
    if input_elem.tag == 'input' and input_elem.type == 'submit' and input_elem.value != 'Aktualisieren':
      input_elem.drop_tree()
      continue
    
    #log_debug(input_elem.name, '->', input_elem.value, '|', input_elem.value_options if input_elem.tag == 'select' else input_elem.type)
    # Set the "was already submitted" indicator.
    if input_elem.value == '0':
      input_elem.value = '1'
    # Select respective account.
    elif input_elem.tag == 'select':
      input_elem.value = input_elem.value_options[1 + account_index]
    # Fill date fields.
    elif input_elem.attrib.get('placeholder') == 'TT.MM.JJJJ':
      input_elem.value = date_to if found_date_from else date_from
      found_date_from = True
  
  if not found_date_from:
    log_result_error('Could not locate date input!')
    return None
  
  wait()
  log_info('Submitting search for %s - %s ...' % (date_from, date_to))
  r = submit_form(session, search_form)
  if any([button in r.text for button in ACCEPTED_EXPORT_BUTTONS]):
    return to_html(r)
  else:
    doc = to_html(r)
    log_result_error('Search did not return the CSV export button unexpectedly!',
        infer_msgerror(doc))
    return None


def do_export_csv(session: requests.Session, transactions_doc: html.HtmlElement) -> bytes:
  # Locate form.
  for button in ACCEPTED_EXPORT_BUTTONS:
    search_form = find_form_by_value(transactions_doc, button)
    if not search_form is None:
      break
  
  if search_form is None:
    log_result_error('Could not locate search form!')
    return None
  
  # Fill out form.
  for input_elem in search_form.inputs:
    # Drop all submits other than the one we want to click.
    if input_elem.tag == 'input' and input_elem.type == 'submit' and input_elem.value not in ACCEPTED_EXPORT_BUTTONS:
      input_elem.drop_tree()
      continue
    
    #log_debug(input_elem.name, '->', input_elem.value, '|', input_elem.value_options if input_elem.tag == 'select' else input_elem.type)
    # Set the "was already submitted" indicator.
    if input_elem.value == '0':
      input_elem.value = '1'
  
  log_info('Requesting CSV export ...')
  r = submit_form(session, search_form)
  log_debug('Response URL: ', r.url)
  log_debug('Response length: ', len(r.content), 'bytes')
  if not 'services/download?' in r.url:
    doc = to_html(r)
    log_result_error('Form did not lead to a download link!', infer_msgerror(doc))
    return None
  
  # Return raw content to avoid picking any charset. Just return the data as-is.
  return r.content


def do_logout(session: requests.Session, last_doc: html.HtmlElement):
  log_info('Logging out ...')

  logout_form = find_form_by_value(last_doc, 'Abmelden')
  # We do not really care if it worked.
  r = submit_form(session, logout_form)
  log_debug('Post logout URL:', r.url)

def main():
  parser = argparse.ArgumentParser(description='Exports bank statements from Sparkasse online banking.')
  parser.add_argument('--base', required=True, help='Base URL of the Sparkasse website.')
  parser.add_argument('--from', required=True, help='Begin of date range to export in DD.MM.YYYY format.')
  parser.add_argument('--to', required=True, help='End of date range to export in DD.MM.YYYY format.')
  parser.add_argument('-v', '--verbose', action='store_true', help='Enable verbose logging.')

  args = parser.parse_args()
  base_url = args.base
  date_from = getattr(args, 'from')
  date_to = args.to

  logging.basicConfig(
    level=logging.DEBUG if args.verbose else logging.INFO,
    format='[%(levelname)s] %(message)s'
  )

  if sys.stderr.isatty():
    # Only print prompts when connected to terminal. Note that we want to print
    # to stderr, which is not supported by 'input' natively.
    print('User ID: ', file=sys.stderr, end='')
    user_id = input()
    print('Password: ', file=sys.stderr, end='', flush=True)
    user_pass = getpass.getpass('')
    print('Account index (0=first): ', file=sys.stderr, end='')
    raw_account_index = input()
  else:
    user_id = input()
    user_pass = input()
    raw_account_index = input()
  account_index = int(raw_account_index)


  user_agent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:69.0) Gecko/20100101 Firefox/69.0'
  session = requests.Session()
  session.headers.update({'User-Agent': user_agent})
  
  success = do_login(session, base_url, user_id, user_pass)
  if not success:
    return False
  
  wait()
  transactions_doc = \
    do_load_transactions(session, base_url, date_from, date_to, account_index)
  if transactions_doc is None:
    return False
  
  wait()
  csv_bytes = do_export_csv(session, transactions_doc)
  if csv_bytes is None:
    return False

  reencoded_bytes = csv_bytes.decode(SERVER_FILE_ENCODING).encode(OUTPUT_ENCODING)
  sys.stdout.buffer.write(reencoded_bytes)
  sys.stdout.buffer.flush()
  log_info('Done! Written %d bytes to stdout.' % len(csv_bytes))
  
  wait()
  do_logout(session, transactions_doc)
  session.close()
  return True


if __name__ == "__main__":
  exit(0 if main() else 2)
