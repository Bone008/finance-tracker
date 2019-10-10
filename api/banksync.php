<?php
const PYTHON_EXECUTABLE = 'python3';
const PYTHON_SCRIPT_DIR = __DIR__ . '/crawler';
const PYTHON_SCRIPT = __DIR__ . '/crawler/kskmse.py';

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
  $fromDate = new DateTime();
  $fromDate->sub(new DateInterval('P' . $maxTransactionAge . 'D'));
  $toDate = new DateTime();
  $toDate->add(new DateInterval('P7D'));
  
  $fromStr = $fromDate->format('d.m.Y');
  $toStr = $toDate->format('d.m.Y');

  // Call Python script.
  $scriptArgs = [
    PYTHON_EXECUTABLE,
    escapeshellarg(PYTHON_SCRIPT),
    '--base', escapeshellarg($bankUrl),
    '--from', escapeshellarg($fromStr),
    '--to', escapeshellarg($toStr),
  ];
  $scriptInput =
    $loginName . "\n" .
    $loginPassword . "\n" .
    implode(',', $accountIndices) . "\n";
  
  run_process(implode(' ', $scriptArgs), PYTHON_SCRIPT_DIR, $scriptInput, $stdout, $stderr);
  // run_process('python3 -m site', NULL, PYTHON_SCRIPT_DIR, $stdout, $stderr);

  Flight::json([
    'bankUrl' => $bankUrl,
    'loginName' => $loginName,
    'loginPassword' => $loginPassword,
    'from' => $fromStr,
    'to' => $toStr,
    'accountIndices' => $accountIndices,
    'stdout' => $stdout,
    'stderr' => $stderr,
  ]);
});
