#!/bin/bash
# Run this script when you are running the API on Apache.
# Since the Python scripts are called from a PHP script,
# they are invoked by the 'www-data' user by default, so Python
# dependencies need to be installed as that user.

sudo mkdir /var/www/.local
sudo mkdir /var/www/.cache
sudo chown www-data.www-data /var/www/.local
sudo chown www-data.www-data /var/www/.cache

sudo -H -u www-data pip install -r requirements.txt
