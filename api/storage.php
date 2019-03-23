<?php
define('STORAGE_DIR', __DIR__ . '/storage/');
define('HASH_ALGORITHM', 'sha256');

function getFileFromId($id) {
	return STORAGE_DIR . $id . '.bin';
}
function getVersionedFileFromId($id, $version) {
	return STORAGE_DIR . $id . '__' . $version . '.bin';
}

Flight::route('GET /storage/@id:[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}', function($id) {
	$binFile = getFileFromId($id);
	
	if(file_exists($binFile)) {
		$fileHash = hash_file(HASH_ALGORITHM, $binFile);
		Flight::etag($fileHash);
		Flight::response()->header('Content-Type', 'application/octet-stream');
		readfile($binFile);
	} else {
		Flight::notFound();
	}
});


function legacyPostStorage($id) {
	// Note: Not using $_POST because the data is coming in raw binary form.
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
}

Flight::route('POST /storage/@id:[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}', function($id) {
	$filesData = Flight::request()->files->data;
	$lastKnownHash = Flight::request()->data->lastKnownHash;
	
	if (!isset($filesData['error']) || is_array($filesData['error'])) {
		// For now, assume it is an old client and fall back to legacy storage.
		legacyPostStorage($id);
        //Flight::json(['error' => 'Invalid parameters.']);
		return;
    }
	if(!is_string($lastKnownHash)) {
        Flight::json(['error' => 'Invalid parameters: Hash missing.']);
		return;
	}
    switch ($filesData['error']) {
        case UPLOAD_ERR_OK:
            break;
        case UPLOAD_ERR_NO_FILE:
            Flight::json(['error' => 'No file sent.']);
			return;
        case UPLOAD_ERR_INI_SIZE:
        case UPLOAD_ERR_FORM_SIZE:
            Flight::json(['error' => 'File size limit exceeded.']);
			return;
        default:
            throw new RuntimeException('Unknown upload error.');
    }
	
	$binFile = getFileFromId($id);
	
	// Validate the sent hash.
	$currentHash = null;
	if(file_exists($binFile)) {
		$currentHash = hash_file(HASH_ALGORITHM, $binFile);
		if($lastKnownHash !== $currentHash) {
            Flight::json(['error' => 'Local database out of date. Please reload.']);
			return;
		}
	}
	
	// Create backup of old file.
	if(file_exists($binFile)) {
		$oldVersion = date('Y-m-d-H-i-s', filemtime($binFile));
		if(!rename($binFile, getVersionedFileFromId($id, $oldVersion))) {
			Flight::json(['error' => 'Could not back up existing file.']);
			return;
		}
	}
	
	if(!move_uploaded_file($filesData['tmp_name'], $binFile)) {
		Flight::json(['error' => 'Failed to accept uploaded file!']);
		return;
	}
	$newHash = hash_file(HASH_ALGORITHM, $binFile);
	
	Flight::json([
		'success' => true,
		'oldHash' => $currentHash,
		'newHash' => $newHash
	]);
});
