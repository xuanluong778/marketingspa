<?php
/**
 * Plugin Name: MarketingSpa Chatbot Proxy
 * Description: Proxy HTTPS /chatbot-api/* tới MarketingSpa API (widget + chatbot public API).
 * Version: 1.0.0
 * Author: MarketingSpa
 */

if (!defined('ABSPATH')) {
    exit;
}

define('MSPA_CHATBOT_PROXY_VERSION', '1.0.0');

final class Mspa_Chatbot_Proxy {
    private const OPTION_UPSTREAM = 'mspa_chatbot_upstream';
    private const QUERY_VAR = 'mspa_chatbot_proxy';

    public static function init(): void {
        add_action('init', [self::class, 'register_rewrite']);
        add_filter('query_vars', [self::class, 'register_query_var']);
        add_action('template_redirect', [self::class, 'handle_proxy']);
        add_action('admin_menu', [self::class, 'admin_menu']);
        add_action('admin_init', [self::class, 'register_settings']);

        $stored = (string) get_option(self::OPTION_UPSTREAM, '');
        if ($stored === '') {
            update_option(self::OPTION_UPSTREAM, 'http://127.0.0.1:4000');
        }
    }

    public static function activate(): void {
        self::register_rewrite();
        flush_rewrite_rules();
    }

    public static function deactivate(): void {
        flush_rewrite_rules();
    }

    public static function register_rewrite(): void {
        add_rewrite_rule('^chatbot-api/(.*)$', 'index.php?' . self::QUERY_VAR . '=$1', 'top');
    }

    public static function register_query_var(array $vars): array {
        $vars[] = self::QUERY_VAR;
        return $vars;
    }

    public static function upstream(): string {
        $local = __DIR__ . '/config.php';
        if (is_readable($local)) {
            $cfg = include $local;
            if (is_array($cfg) && !empty($cfg['upstream'])) {
                return rtrim((string) $cfg['upstream'], '/');
            }
        }
        return rtrim((string) get_option(self::OPTION_UPSTREAM, 'http://127.0.0.1:4000'), '/');
    }

    public static function handle_proxy(): void {
        $path = get_query_var(self::QUERY_VAR);
        if ($path === '' || $path === false) {
            return;
        }

        if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
            status_header(204);
            header('Access-Control-Allow-Origin: *');
            header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
            header('Access-Control-Allow-Headers: Content-Type');
            exit;
        }

        $upstream = self::upstream();
        $path = '/' . ltrim((string) $path, '/');
        $query = !empty($_SERVER['QUERY_STRING']) ? '?' . $_SERVER['QUERY_STRING'] : '';
        $url = $upstream . $path . $query;

        $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
        $headers = [];
        $contentType = $_SERVER['CONTENT_TYPE'] ?? ($_SERVER['HTTP_CONTENT_TYPE'] ?? '');
        if ($contentType) {
            $headers[] = 'Content-Type: ' . $contentType;
        }

        $body = in_array($method, ['POST', 'PUT', 'PATCH'], true)
            ? file_get_contents('php://input')
            : null;

        if (!function_exists('curl_init')) {
            status_header(500);
            header('Content-Type: text/plain; charset=utf-8');
            echo 'PHP cURL extension is required.';
            exit;
        }

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
            status_header(502);
            header('Content-Type: text/plain; charset=utf-8');
            echo 'Chatbot proxy: không kết nối được API tại ' . esc_html($upstream)
                . '. Cấu hình URL API trong Settings → MarketingSpa Chatbot.';
            exit;
        }

        $status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $headerSize = (int) curl_getinfo($ch, CURLINFO_HEADER_SIZE);
        curl_close($ch);

        $rawHeaders = substr($response, 0, $headerSize);
        $respBody = substr($response, $headerSize);

        status_header($status);
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
        exit;
    }

    public static function admin_menu(): void {
        add_options_page(
            'MarketingSpa Chatbot',
            'MarketingSpa Chatbot',
            'manage_options',
            'mspa-chatbot-proxy',
            [self::class, 'settings_page'],
        );
    }

    public static function register_settings(): void {
        register_setting('mspa_chatbot_proxy', self::OPTION_UPSTREAM, [
            'type' => 'string',
            'sanitize_callback' => static function ($value) {
                return rtrim(trim((string) $value), '/');
            },
        ]);
    }

    public static function settings_page(): void {
        if (!current_user_can('manage_options')) {
            return;
        }
        $upstream = self::upstream();
        $testWidget = home_url('/chatbot-api/chatbot/widget.js');
        ?>
        <div class="wrap">
            <h1>MarketingSpa Chatbot Proxy</h1>
            <p>Proxy HTTPS <code>/chatbot-api/*</code> tới server API MarketingSpa.</p>
            <form method="post" action="options.php">
                <?php settings_fields('mspa_chatbot_proxy'); ?>
                <table class="form-table">
                    <tr>
                        <th><label for="mspa_chatbot_upstream">URL API upstream</label></th>
                        <td>
                            <input type="url" class="regular-text" id="mspa_chatbot_upstream"
                                   name="<?php echo esc_attr(self::OPTION_UPSTREAM); ?>"
                                   value="<?php echo esc_attr($upstream); ?>"
                                   placeholder="http://127.0.0.1:4000" />
                            <p class="description">
                                API chạy trên cùng VPS: <code>http://127.0.0.1:4000</code><br>
                                API chạy máy khác: IP/tunnel HTTPS (vd. Cloudflare Tunnel).
                            </p>
                        </td>
                    </tr>
                </table>
                <?php submit_button('Lưu'); ?>
            </form>
            <p>Kiểm tra: <a href="<?php echo esc_url($testWidget); ?>" target="_blank" rel="noreferrer"><?php echo esc_html($testWidget); ?></a></p>
        </div>
        <?php
    }
}

Mspa_Chatbot_Proxy::init();
register_activation_hook(__FILE__, ['Mspa_Chatbot_Proxy', 'activate']);
register_deactivation_hook(__FILE__, ['Mspa_Chatbot_Proxy', 'deactivate']);
