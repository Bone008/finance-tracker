<?php
define('DEBUG_MODE', true);

// Allow overriding storage location from environment.
$envStorage = getenv('FT_STORAGE_DIR');
if ($envStorage && is_dir($envStorage)) {
  define('STORAGE_DIR', rtrim($envStorage, '/') . '/');
}
