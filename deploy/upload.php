<?php
/**
 * MUVI upload endpoint — drop this on markyninox.com at /muvi/upload.php
 * Matches the BeatCam backend contract:
 *   - POST multipart/form-data
 *   - file field:   "file"
 *   - auth header:  "X-Upload-Key: <key>"
 *   - returns JSON: {"ok":true,"url":"https://markyninox.com/muvi/<filename>"}
 *
 * Saves uploads into the same /muvi/ folder this file lives in.
 */

header('Content-Type: application/json');

// ---- CONFIG -----------------------------------------------------------
$UPLOAD_KEY = 'R5ErW04y8tE5WWJKRgU7FOTRnUjNmfyBaMP5FEZ517d2b243';
$PUBLIC_BASE = 'https://markyninox.com/muvi';   // public URL of this folder
$MAX_BYTES = 500 * 1024 * 1024;                 // 500 MB cap
// -----------------------------------------------------------------------

function fail($code, $msg) {
    http_response_code($code);
    echo json_encode(['ok' => false, 'error' => $msg]);
    exit;
}

// Auth
$hdr = $_SERVER['HTTP_X_UPLOAD_KEY'] ?? '';
if (!hash_equals($UPLOAD_KEY, $hdr)) {
    fail(401, 'bad upload key');
}

if (!isset($_FILES['file'])) {
    fail(400, 'no file field');
}
$f = $_FILES['file'];
if ($f['error'] !== UPLOAD_ERR_OK) {
    fail(400, 'upload error ' . $f['error']);
}
if ($f['size'] > $MAX_BYTES) {
    fail(413, 'file too large');
}

// Sanitize filename, force .mp4
$name = basename($f['name']);
$name = preg_replace('/[^A-Za-z0-9._-]/', '-', $name);
if (!preg_match('/\.mp4$/i', $name)) {
    $name .= '.mp4';
}

$dest = __DIR__ . '/' . $name;
if (!move_uploaded_file($f['tmp_name'], $dest)) {
    fail(500, 'could not save file');
}

echo json_encode([
    'ok'  => true,
    'url' => $PUBLIC_BASE . '/' . rawurlencode($name),
]);
