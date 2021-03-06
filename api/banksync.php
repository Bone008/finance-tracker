<?php
const PYTHON_EXECUTABLE = 'python3';
const PYTHON_SCRIPT_DIR = __DIR__ . '/banksync';
const PYTHON_SCRIPT = PYTHON_SCRIPT_DIR . '/sparkasse.py';
const EMPTY_RESULT_PLACEHOLDER = '<EMPTY_RESULT_SET>';

function run_process($command, $cwd, $stdin, &$stdout=null, &$stderr=null) {
  $proc = proc_open($command, [
    0 => ['pipe', 'r'],
    1 => ['pipe', 'w'],
    2 => ['pipe', 'w'],
  ], $pipes, $cwd);

  fwrite($pipes[0], $stdin);
  fclose($pipes[0]);

  $stdout = stream_get_contents($pipes[1]);
  fclose($pipes[1]);
  $stderr = stream_get_contents($pipes[2]);
  fclose($pipes[2]);
  return proc_close($proc);
}

Flight::route('POST /banksync', function() {
  $data = Flight::request()->data;

  $bankUrl = trim($data->bankUrl);
  $loginName = trim($data->loginName);
  $loginPassword = (string)$data->loginPassword;
  $maxTransactionAge = (int)$data->maxTransactionAge;
  $accountIndices = $data->accountIndices;
  $verbose = $data->verbose;
  
  // Validate input.
  if ($data->bankType !== 'sparkasse') {
    Flight::json(['error' => 'Unsupported bank type!']);
    return;
  }
  if (empty($bankUrl) || empty($loginName) || empty($loginPassword)
      || !($maxTransactionAge >= 1)
      || !is_array($accountIndices) || empty($accountIndices)) {
    Flight::json(['error' => 'Incomplete request!']);
    return;
  }
  foreach($accountIndices as $i) {
    if(!is_int($i))  {
      Flight::json(['error' => 'Invalid account index!']);
      return;
    }
  }

  // Infer and format dates as required by Python script.
  $tz = new DateTimeZone('Europe/Berlin');
  $fromDate = new DateTime('now', $tz);
  $fromDate->sub(new DateInterval('P' . $maxTransactionAge . 'D'));
  $toDate = new DateTime('now', $tz);
  // Note: Sparkasse does not allow the "to" date to be in the future.
  
  $toStr = $toDate->format('d.m.Y');
  $fromStr = $fromDate->format('d.m.Y');
  
  $scriptArgs = [
    PYTHON_EXECUTABLE,
    escapeshellarg(PYTHON_SCRIPT),
    '--base', escapeshellarg($bankUrl),
    '--from', escapeshellarg($fromStr),
    '--to', escapeshellarg($toStr),
  ];
  if($verbose) {
    $scriptArgs[] = '-v';
  }
  $scriptCommand = implode(' ', $scriptArgs);

  // Note that the client assumes that $results ALWAYS has the same length as
  // $accountIndices and that entries correspond to the input accordingly!
  $results = [];
  foreach($accountIndices as $accountIndex) {
    // Call Python script.
    error_log('Calling script: ' . $scriptCommand);
    $scriptInput = $loginName . "\n" . $loginPassword . "\n" . $accountIndex . "\n";
    $exitCode = run_process($scriptCommand, PYTHON_SCRIPT_DIR, $scriptInput, $stdout, $stderr);

    if($exitCode !== 0 || empty($stdout)) {
      Flight::json([
        'error' => trim($stdout) ?: 'An unknown error occured! Unfortunately we do not know more.',
        'errorDetails' => 'Account index: ' . $accountIndex .
            "\nExit code: " . $exitCode .
            (DEBUG_MODE ? "\nCommand: " . $scriptCommand . "\n" . $stderr : ''),
      ]);
      return;
    }

    $csvData = $stdout;
    if(trim($stdout) === EMPTY_RESULT_PLACEHOLDER) {
      // Successful, but no transactions exist in this account. Return null.
      $csvData = null;
    }

    // Only gather successful results.
    $results[] = [
      'data' => $csvData,
      'log' => (DEBUG_MODE ? $stderr : ''),
    ];
  }

  Flight::json([
    'success' => true,
    'results' => $results,
  ]);
});
