<?php
define('STORAGE_DIR', __DIR__ . '/storage/');

function getFileFromId($id) {
	return STORAGE_DIR . $id . '.bin';
}

Flight::route('GET /storage/@id:[0-9a-f-]+', function($id) {
	$binFile = getFileFromId($id);
	
	if(file_exists($binFile)) {
		Flight::response()->header('Content-Type', 'application/octet-stream');
		readfile($binFile);
	} else {
		Flight::notFound();
	}
});

Flight::route('POST /storage/@id', function($id) {
	// Note: Not using $_POST because the data is coming in in raw binary form.
	$postData = file_get_contents('php://input');
	
	// TODO: Add versioning/backups of existing files.
	file_put_contents(getFileFromId($id), $postData);
	
	Flight::json(['success' => true]);
});
