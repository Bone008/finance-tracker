import requests
import time
import random
import sys
from lxml import html

# TODO: Pass externally.
user_id = str(random.randint(20000000, 29999999))
user_pass = '00000'
date_range = ['01.09.2019', '01.10.2019']
account_index = 0
out_file = 'muhdata.csv'

def wait():
  print('(Throttling ...)')
  time.sleep(2 + 3*random.random())


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
  return session.post(url, data=form_data)


def do_login(session: requests.Session, user_id: str, user_pass: str):
  print('Loading www.kskmse.de ...')
  url = 'https://www.kskmse.de/de/home.html'
  r = session.get(url)
  doc = to_html(r)

  login_form = doc.forms[0]
  # Fill out form. Input names are randomly generated, so we have to infer them.
  for input_elem in login_form.inputs:
    if input_elem.label is not None and input_elem.label.text == 'Anmeldename':
      input_elem.value = user_id
    elif input_elem.type == 'password':
      input_elem.value = user_pass
    #print(input_elem.name, '->', input_elem.value)
  
  wait()
  print('Logging in...')
  r = submit_form(session, login_form)
  print('[D] Response URL:', r.url)
  
  if 'finanzstatus.html' in r.url:
    print('Login successful!')
    return True
  else:
    doc = to_html(r)
    errors = [e.text_content() for e in doc.cssselect('.msgerror')]
    if errors:
      print('Login error:', ' && '.join(errors), file=sys.stderr)
    else:
      print('Login error: Unknown!', file=sys.stderr)
    return False


def do_load_transactions(session: requests.Session, date_from: str, date_to: str, account_index: int):
  print('Navigating to transactions page ...')
  url = 'https://www.kskmse.de/de/home/onlinebanking/umsaetze/umsaetze.html?n=true&stref=hnav'
  r = session.get(url)
  doc = to_html(r)

  # Locate form.
  search_form = find_form_by_value(doc, 'Aktualisieren')
  if search_form is None:
    print('Could not locate search form!', file=sys.stderr)
    return None
  
  # Fill out form.
  found_date_from = False
  for input_elem in search_form.inputs:
    # Drop all submits other than the one we want to click.
    if input_elem.tag == 'input' and input_elem.type == 'submit' and input_elem.value != 'Aktualisieren':
      input_elem.drop_tree()
      continue
    
    #print(input_elem.name, '->', input_elem.value, '|', input_elem.value_options if input_elem.tag == 'select' else input_elem.type)
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
    print('Could not locate date input!', file=sys.stderr)
    return None
  
  wait()
  print('Submitting search for %s - %s ...' % (date_from, date_to))
  r = submit_form(session, search_form)
  if 'CSV-CAMT-Format' in r.text:
    return to_html(r)
  else:
    print('Search did not return the CSV export button unexpectedly!', file=sys.stderr)
    return None


def do_export_csv(session: requests.Session, transactions_doc: html.HtmlElement):
  # Locate form.
  search_form = find_form_by_value(transactions_doc, 'CSV-CAMT-Format')
  if search_form is None:
    print('Could not locate search form!', file=sys.stderr)
    return None
  
  # Fill out form.
  for input_elem in search_form.inputs:
    # Drop all submits other than the one we want to click.
    if input_elem.tag == 'input' and input_elem.type == 'submit' and input_elem.value != 'CSV-CAMT-Format':
      input_elem.drop_tree()
      continue
    
    #print(input_elem.name, '->', input_elem.value, '|', input_elem.value_options if input_elem.tag == 'select' else input_elem.type)
    # Set the "was already submitted" indicator.
    if input_elem.value == '0':
      input_elem.value = '1'
  
  print('Requesting CSV export ...')
  r = submit_form(session, search_form)
  print('[D] Response URL: ', r.url)
  print('[D] Response length: ', len(r.text))
  return r.text


def do_logout(session: requests.Session, last_doc: html.HtmlElement):
  print('Logging out ...')

  logout_form = find_form_by_value(last_doc, 'Abmelden')
  # We do not really care if it worked.
  r = submit_form(session, logout_form)
  print('[D] Logout URL:', r.url)

def main():
  user_agent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:69.0) Gecko/20100101 Firefox/69.0'
  session = requests.Session()
  session.headers.update({'User-Agent': user_agent})
  
  success = do_login(session, user_id, user_pass)
  if not success:
    return False
  
  wait()
  transactions_doc = \
    do_load_transactions(session, date_range[0], date_range[1], account_index)
  if transactions_doc is None:
    return False
  
  wait()
  csv_data = do_export_csv(session, transactions_doc)

  print('Writing to output file: %s ...', out_file)
  with open(out_file, 'w') as f:
    f.write(csv_data)
  print('Done!')
  print()
  
  wait()
  do_logout(session, transactions_doc)
  session.close()
  return True


if __name__ == "__main__":
  exit(0 if main() else 0)