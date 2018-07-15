<?php
Flight::route('GET /blobstore/@id', function($id) {
	Flight::json([
		'status' => 'Retrieving blob ' . $id,
	]);
});

Flight::route('POST /blobstore/@id', function($id) {
	Flight::json([
		'status' => 'Storing blob ' . $id,
	]);
});
