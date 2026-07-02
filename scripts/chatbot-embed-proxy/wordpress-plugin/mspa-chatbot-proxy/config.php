<?php
/**
 * Tùy chọn: ghi đè URL API upstream (ưu tiên hơn cài đặt WordPress).
 * Ví dụ API chạy trên cùng VPS:
 *   return ['upstream' => 'http://127.0.0.1:4000'];
 *
 * API chạy máy dev qua tunnel HTTPS:
 *   return ['upstream' => 'https://your-tunnel.trycloudflare.com'];
 */
return [
    'upstream' => 'http://127.0.0.1:4000',
];
