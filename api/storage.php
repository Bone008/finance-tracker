<?php
define('STORAGE_DIR', __DIR__ . '/storage/');

function getFileFromId($id) {
	return STORAGE_DIR . $id . '.bin';
}
function getVersionedFileFromId($id, $version) {
	return STORAGE_DIR . $id . '__' . $version . '.bin';
}

Flight::route('GET /storage/@id:[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}', function($id) {
	$binFile = getFileFromId($id);
	
	if(file_exists($binFile)) {
		Flight::response()->header('Content-Type', 'application/octet-stream');
		readfile($binFile);
	} else {
		Flight::notFound();
	}
});

Flight::route('POST /storage/@id:[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}', function($id) {
	// Note: Not using $_POST because the data is coming in in raw binary form.
	$postData = file_get_contents('php://input');
	
	if(empty($postData)) {
		Flight::json(['error' => 'Received empty data']);
		return;
	}
	
	$binFile = getFileFromId($id);
	
	if(file_exists($binFile)) {
		$oldVersion = date('Y-m-d-H-i-s', filemtime($binFile));
		if(!rename($binFile, getVersionedFileFromId($id, $oldVersion))) {
			Flight::json(['error' => 'Could not back up existing file.']);
			return;
		}
	}
	
	$result = file_put_contents($binFile, $postData);
	if($result === false) {
		Flight::json(['error' => 'Failed to write to file!']);
		return;
	}
	Flight::json(['success' => true]);
});
