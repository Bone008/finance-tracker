<?php
const PYTHON_EXECUTABLE = 'python3';
const PYTHON_SCRIPT_DIR = __DIR__ . '/banksync';
const PYTHON_SCRIPT_SPARKASSE = PYTHON_SCRIPT_DIR . '/sparkasse.py';
const PYTHON_SCRIPT_DKB = PYTHON_SCRIPT_DIR . '/dkb.py';

const EMPTY_RESULT_PLACEHOLDER = '<EMPTY_RESULT_SET>';

/** Returns the name of a temporary file that will be cleaned up automagically. */
function make_tempfile() {
  $name = tempnam(sys_get_temp_dir(), 'ftbanksync');
  register_shutdown_function(function() use ($name) { unlink($name); });
  return $name;
}

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

// Assumes valid input, runs on a single account.
function run_sparkasse($bankUrl, $loginName, $loginPassword, $fromStr, $toStr, $accountIndex, $verbose) {
  $scriptArgs = [
    PYTHON_EXECUTABLE,
    escapeshellarg(PYTHON_SCRIPT_SPARKASSE),
    '--base', escapeshellarg($bankUrl),
    '--from', escapeshellarg($fromStr),
    '--to', escapeshellarg($toStr),
  ];
  if ($verbose) {
    $scriptArgs[] = '-v';
  }
  $scriptCommand = implode(' ', $scriptArgs);

  // Call Python script.
  error_log('Calling script: ' . $scriptCommand);
  $scriptInput = $loginName . "\n" . $loginPassword . "\n" . $accountIndex . "\n";
  $exitCode = run_process($scriptCommand, PYTHON_SCRIPT_DIR, $scriptInput, $stdout, $stderr);

  if ($exitCode !== 0 || empty($stdout)) {
    return [
      'error' => trim($stdout) ?: 'An unknown error occured! Unfortunately we do not know more.',
      'errorDetails' => 'Account index: ' . $accountIndex .
          "\nExit code: " . $exitCode .
          (DEBUG_MODE ? "\nCommand: " . $scriptCommand . "\n" . $stderr : ''),
    ];
  }

  $csvData = $stdout;
  if (trim($stdout) === EMPTY_RESULT_PLACEHOLDER) {
    // Successful, but no transactions exist in this account. Return null.
    $csvData = null;
  }

  // JSON silently fails for invalid characters, so check early to avoid
  // zeroing out the entire response later.
  if (!json_encode([$csvData])) {
    return [
      'error' => 'An error occured trying to encode the exported file to JSON!',
      'errorDetails' => 'The server\'s character encoding settings may be wrong.',
    ];
  }

  return [
    'data' => $csvData,
    'log' => (DEBUG_MODE ? $stderr : ''),
  ];
}

// Assumes valid input, runs on multiple accounts.
function run_dkb($unusedBankUrl, $loginName, $loginPassword, $fromStr, $toStr, $accountIndices, $verbose) {
  if (count($accountIndices) > 1) {
    return [
      'error' => 'Importing multiple accounts is not supported yet for DKB! ' . 
                 'Please open an issue on GitHub if you need this feature.',
    ];
  }

  $scriptArgs = [
    PYTHON_EXECUTABLE,
    escapeshellarg(PYTHON_SCRIPT_DKB),
    $verbose ? '--debug' : '',
    '--userid', escapeshellarg($loginName),
    'download-transactions',
    '--csv',
  ];

  $tempFiles = [];
  foreach ($accountIndices as $accountIndex) {
    $tmp = make_tempfile();
    $tempFiles[] = $tmp;
    $scriptArgs = array_merge($scriptArgs, [
      // TODO: The index is not the correct value for "cardid". Should probably
      // change the Phython script to work on indices instead of ids to support
      // multiple accounts.
      '--cardid', escapeshellarg($accountIndex),
      '--from-date', escapeshellarg($fromStr),
      '--to-date', escapeshellarg($toStr),
      '--output', escapeshellarg($tmp),
    ]);
  }

  $scriptCommand = implode(' ', $scriptArgs);
  $redactedScriptCommand = str_replace($loginName, '***', $scriptCommand);

  // Call Python script.
  error_log('Calling script: ' . $redactedScriptCommand);
  $scriptInput = $loginPassword . "\n";
  $exitCode = run_process($scriptCommand, PYTHON_SCRIPT_DIR, $scriptInput, $stdout, $stderr);
  $scriptLog = $stdout . "\n" . $stderr;

  if ($exitCode !== 0) {
    return [
      'error' => 'An unknown error occured! Unfortunately we do not know more.',
      'errorDetails' => "Exit code: " . $exitCode .
          (DEBUG_MODE
            ? "\nCommand: " . $redactedScriptCommand . "\n" . $scriptLog
            : ''),
    ];
  }

  $results = [];
  foreach ($tempFiles as $tmp) {
    $csvData = file_get_contents($tmp);
    if ($csvData === false) {
      return [
        'error' => 'An error occured after exporting the transactions!',
        'errorDetails' => 'Could not read temporary file.',
      ];
    }
    // JSON silently fails for invalid characters, so check early to avoid
    // zeroing out the entire response later.
    if (!json_encode([$csvData])) {
      return [
        'error' => 'An error occured trying to encode the exported file to JSON!',
        'errorDetails' => 'The server\'s character encoding settings may be wrong.' .
            (DEBUG_MODE ? "\n\n" . $scriptLog : ''),
      ];
    }
    $results[] = [
      'data' => $csvData,
      'log' => (DEBUG_MODE ? $scriptLog : ''),
    ];
  }
  return $results;
}


Flight::route('POST /banksync', function() {
  $data = Flight::request()->data;

  $bankType = trim($data->bankType);
  $bankUrl = trim($data->bankUrl);
  $loginName = trim($data->loginName);
  $loginPassword = (string)$data->loginPassword;
  $maxTransactionAge = (int)$data->maxTransactionAge;
  $accountIndices = $data->accountIndices;
  $verbose = $data->verbose;
  
  // Validate input.
  if (!in_array($bankType, ['sparkasse', 'dkb'])) {
    Flight::json(['error' => 'Unsupported bank type!']);
    return;
  }
  if (empty($bankUrl) || empty($loginName) || empty($loginPassword)
      || !($maxTransactionAge >= 1)
      || !is_array($accountIndices) || empty($accountIndices)) {
    Flight::json(['error' => 'Incomplete request!']);
    return;
  }
  foreach ($accountIndices as $i) {
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

  // Note that the client assumes that $results ALWAYS has the same length as
  // $accountIndices and that entries correspond to the input accordingly!
  $results = [];

  switch ($bankType) {
    case 'sparkasse':
      foreach($accountIndices as $accountIndex) {
        $result = run_sparkasse($bankUrl, $loginName, $loginPassword, $fromStr, $toStr, $accountIndex, $verbose);
        if (isset($result['error'])) {
          // Immediately abort on error, the client cannot handle partial errors.
          Flight::json($result);
          return;
        }
        $results[] = $result;
      }
      break;
    
    case 'dkb':
      $results = run_dkb($bankUrl, $loginName, $loginPassword, $fromStr, $toStr, $accountIndices, $verbose);
      if (isset($results['error'])) {
        Flight::json($results);
        return;
      }
      break;

    default:
      // should never be reached
      Flight::json(['error' => 'Bank type not implemented!']);
      return;
  }

  Flight::json([
    'success' => true,
    'results' => $results,
  ]);
});
