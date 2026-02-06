const fs = require('fs');
const path = require('path');

const LOG_AND_PRINT = 'both';
const LOG_ONLY = 'log';
const PRINT_ONLY = 'print';

let _mode = LOG_AND_PRINT;
let _fileStream = null;
let _logPath = null;

function _ensureDir(dir) {
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch (e) {
    // ignore if already exists or other race
  }
}

function _openStream(logDir, logFile) {
  const full = path.join(logDir, logFile);
  if (_fileStream && _logPath === full) return;
  if (_fileStream) {
    try { _fileStream.end(); } catch (e) { /* ignore */ }
    _fileStream = null;
  }
  _ensureDir(logDir);
  _fileStream = fs.createWriteStream(full, { flags: 'a' });
  _logPath = full;
}

function _format(msg) {
  return String(msg) + '\n';
}

function Configure(logDir, logFile, mode) {
  _mode = mode || LOG_AND_PRINT;
  if (_mode === LOG_AND_PRINT || _mode === LOG_ONLY) {
    _openStream(logDir, logFile);
  }
}

function NewLine() {
  Message('');
}

function Message(msg) {
  const out = _format(msg);
  if (_mode === LOG_AND_PRINT || _mode === PRINT_ONLY) {
    console.log(String(msg));
  }
  if ((_mode === LOG_AND_PRINT || _mode === LOG_ONLY) && _fileStream) {
    _fileStream.write(out);
  }
}

function Error(err) {
  const text = 'ERROR [' + String(err) + ']';
  if (_mode === LOG_AND_PRINT || _mode === PRINT_ONLY) {
    console.error(text);
  }
  if ((_mode === LOG_AND_PRINT || _mode === LOG_ONLY) && _fileStream) {
    _fileStream.write(_format(text));
  }
  process.exit(1);
}

function Unsupported(val) {
  const text = 'unsupported [' + String(val) + ']';
  if (_mode === LOG_AND_PRINT || _mode === PRINT_ONLY) {
    console.error(text);
  }
  if ((_mode === LOG_AND_PRINT || _mode === LOG_ONLY) && _fileStream) {
    _fileStream.write(_format(text));
  }
  throw new Error(text);
}

function KeyVal(key, val) {
  Message(String(key) + ' [' + String(val) + ']');
}

module.exports = {
  LOG_AND_PRINT,
  LOG_ONLY,
  PRINT_ONLY,
  Configure,
  NewLine,
  Message,
  Error,
  Unsupported,
  KeyVal,
};
