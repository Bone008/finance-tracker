<?php
// Keep this off for JSON APIs, since if it is enabled
// PHP will generate status code 200 on parse errors.
ini_set('display_errors', 'off');
error_reporting(E_ALL | E_STRICT);

require_once 'ini.php';
require_once 'lib/flight/Flight.php';


// Exception handling, does not include parse errors.
Flight::set('flight.log_errors', true);
Flight::map('error', function(Exception $e) {
	if(DEBUG_MODE) {
		$errorData = [
			"error" => $e->getMessage(),
			"code" => $e->getCode(),
			"stackTrace" => $e->getTraceAsString(),
		];
	} else {
		$errorData = ["error" => "Internal server error"];
	}
	
	Flight::json($errorData, 500);
	exit(1);
});

// Set up routes.
require_once 'storage.php';

Flight::start();