<?php
/**
 * MarketingSpa Chatbot — reverse proxy tới API local (port 4000).
 * Copy thư mục chatbot-api/ vào document root website (cùng cấp wp-config.php).
 * Embed: https://your-site.com/chatbot-api/chatbot/widget.js
 */
declare(strict_types=1);

$upstream = 'http://127.0.0.1:4000';
$configFile = __DIR__ . '/config.php';
if (is_readable($configFile)) {
    $cfg = include $configFile;
    if (is_array($cfg) && !empty($cfg['upstream'])) {
        $upstream = (string) $cfg['upstream'];
    }
}
$upstream = getenv('MSPA_CHATBOT_UPSTREAM') ?: $upstream;
$upstream = rtrim($upstream, '/');

$requestUri = $_SERVER['REQUEST_URI'] ?? '/';
$path = parse_url($requestUri, PHP_URL_PATH) ?: '/';
$path = preg_replace('#^/chatbot-api#', '', $path) ?: '/';
$query = parse_url($requestUri, PHP_URL_QUERY);
$url = $upstream . $path . ($query ? '?' . $query : '');

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'OPTIONS') {
    http_response_code(204);
    header('Access-Control-Allow-Origin: *');
    header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type');
    exit;
}

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$headers = [];
$contentType = $_SERVER['CONTENT_TYPE'] ?? $_SERVER['HTTP_CONTENT_TYPE'] ?? '';
if ($contentType) {
    $headers[] = 'Content-Type: ' . $contentType;
}
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if ($origin) {
    $headers[] = 'Origin: ' . $origin;
}

$body = in_array($method, ['POST', 'PUT', 'PATCH'], true)
    ? file_get_contents('php://input')
    : null;

$ch = curl_init($url);
curl_setopt_array($ch, [
    CURLOPT_CUSTOMREQUEST => $method,
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_HEADER => true,
    CURLOPT_FOLLOWLOCATION => false,
    CURLOPT_TIMEOUT => 60,
    CURLOPT_HTTPHEADER => $headers,
]);
if ($body !== null && $body !== '') {
    curl_setopt($ch, CURLOPT_POSTFIELDS, $body);
}

$response = curl_exec($ch);
if ($response === false) {
    http_response_code(502);
    header('Content-Type: text/plain; charset=utf-8');
    echo 'Chatbot proxy: không kết nối được API tại ' . $upstream;
    exit;
}

$status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
$headerSize = (int) curl_getinfo($ch, CURLINFO_HEADER_SIZE);
curl_close($ch);

$rawHeaders = substr($response, 0, $headerSize);
$respBody = substr($response, $headerSize);

http_response_code($status);

$skip = ['transfer-encoding', 'connection', 'content-encoding', 'content-length'];
foreach (explode("\r\n", $rawHeaders) as $line) {
    if ($line === '' || stripos($line, 'HTTP/') === 0) {
        continue;
    }
    $colon = strpos($line, ':');
    if ($colon === false) {
        continue;
    }
    $name = strtolower(trim(substr($line, 0, $colon)));
    if (in_array($name, $skip, true)) {
        continue;
    }
    header($line, $name === 'set-cookie' ? false : true);
}

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

echo $respBody;
