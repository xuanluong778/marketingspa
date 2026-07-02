PRAGMA foreign_keys=OFF;
BEGIN TRANSACTION;
CREATE TABLE chatbot_bots (
	id INTEGER NOT NULL, 
	user_id INTEGER NOT NULL, 
	website_url VARCHAR(2000), 
	bot_name VARCHAR(120) NOT NULL, 
	business_name VARCHAR(160), 
	industry VARCHAR(120), 
	hotline VARCHAR(64), 
	main_services TEXT, 
	consultation_tone VARCHAR(64), 
	greeting VARCHAR(500), 
	status VARCHAR(32) DEFAULT 'draft' NOT NULL, 
	created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	updated_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL, allowed_domains VARCHAR(2000), 
	PRIMARY KEY (id), 
	FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE
);
COMMIT;
PRAGMA foreign_keys=OFF;
BEGIN TRANSACTION;
CREATE TABLE chatbot_knowledge_sources (
	id INTEGER NOT NULL, 
	bot_id INTEGER NOT NULL, 
	user_id INTEGER NOT NULL, 
	source_type VARCHAR(32) NOT NULL, 
	title VARCHAR(160) NOT NULL, 
	url VARCHAR(2000), 
	content TEXT, 
	status VARCHAR(32) DEFAULT 'pending' NOT NULL, 
	crawl_error VARCHAR(500), 
	created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	updated_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(bot_id) REFERENCES chatbot_bots (id) ON DELETE CASCADE, 
	FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE
);
COMMIT;
PRAGMA foreign_keys=OFF;
BEGIN TRANSACTION;
CREATE TABLE chatbot_conversations (
	id INTEGER NOT NULL, 
	bot_id INTEGER NOT NULL, 
	user_id INTEGER NOT NULL, 
	session_id VARCHAR(64) NOT NULL, 
	visitor_name VARCHAR(120), 
	visitor_phone VARCHAR(32), 
	status VARCHAR(32) DEFAULT 'open' NOT NULL, 
	created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	updated_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL, channel VARCHAR(32) NOT NULL DEFAULT 'website', external_user_id VARCHAR(64), channel_ref VARCHAR(64), last_user_message_at TIMESTAMP WITH TIME ZONE, 
	PRIMARY KEY (id), 
	FOREIGN KEY(bot_id) REFERENCES chatbot_bots (id) ON DELETE CASCADE, 
	FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE
);
COMMIT;
PRAGMA foreign_keys=OFF;
BEGIN TRANSACTION;
CREATE TABLE chatbot_messages (
	id INTEGER NOT NULL, 
	conversation_id INTEGER NOT NULL, 
	user_id INTEGER NOT NULL, 
	role VARCHAR(16) NOT NULL, 
	message TEXT NOT NULL, 
	created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(conversation_id) REFERENCES chatbot_conversations (id) ON DELETE CASCADE, 
	FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE
);
COMMIT;
PRAGMA foreign_keys=OFF;
BEGIN TRANSACTION;
CREATE TABLE chatbot_leads (
	id INTEGER NOT NULL, 
	bot_id INTEGER NOT NULL, 
	conversation_id INTEGER, 
	user_id INTEGER NOT NULL, 
	name VARCHAR(120), 
	phone VARCHAR(32), 
	need TEXT, 
	page_url VARCHAR(2000), 
	status VARCHAR(32) DEFAULT 'new' NOT NULL, 
	created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(bot_id) REFERENCES chatbot_bots (id) ON DELETE CASCADE, 
	FOREIGN KEY(conversation_id) REFERENCES chatbot_conversations (id) ON DELETE SET NULL, 
	FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE
);
COMMIT;
PRAGMA foreign_keys=OFF;
BEGIN TRANSACTION;
CREATE TABLE chatbot_usage (
	id INTEGER NOT NULL, 
	user_id INTEGER NOT NULL, 
	bot_id INTEGER, 
	month VARCHAR(7) NOT NULL, 
	ai_replies INTEGER DEFAULT 0 NOT NULL, 
	credits_used INTEGER DEFAULT 0 NOT NULL, 
	updated_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	PRIMARY KEY (id), 
	CONSTRAINT uq_chatbot_usage_user_bot_month UNIQUE (user_id, bot_id, month), 
	FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE, 
	FOREIGN KEY(bot_id) REFERENCES chatbot_bots (id) ON DELETE SET NULL
);
COMMIT;
PRAGMA foreign_keys=OFF;
BEGIN TRANSACTION;
CREATE TABLE chatbot_facebook_pages (
	id INTEGER NOT NULL, 
	user_id INTEGER NOT NULL, 
	bot_id INTEGER NOT NULL, 
	page_id VARCHAR(64) NOT NULL, 
	page_name VARCHAR(200) NOT NULL, 
	page_access_token_encrypted TEXT NOT NULL, 
	ai_enabled BOOLEAN DEFAULT true NOT NULL, 
	status VARCHAR(32) DEFAULT 'connected' NOT NULL, 
	webhook_subscribed BOOLEAN DEFAULT false NOT NULL, 
	created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	updated_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	PRIMARY KEY (id), 
	CONSTRAINT uq_chatbot_fb_page_id UNIQUE (page_id), 
	FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE, 
	FOREIGN KEY(bot_id) REFERENCES chatbot_bots (id) ON DELETE CASCADE
);
COMMIT;
PRAGMA foreign_keys=OFF;
BEGIN TRANSACTION;
CREATE TABLE chatbot_cskh_credit_logs (
	id INTEGER NOT NULL, 
	user_id INTEGER NOT NULL, 
	admin_id INTEGER, 
	delta INTEGER NOT NULL, 
	balance_after INTEGER NOT NULL, 
	reason VARCHAR(500) NOT NULL, 
	internal_note TEXT, 
	created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE, 
	FOREIGN KEY(admin_id) REFERENCES users (id) ON DELETE SET NULL
);
COMMIT;
PRAGMA foreign_keys=OFF;
BEGIN TRANSACTION;
CREATE TABLE chatbot_kb_maps (
	id INTEGER NOT NULL, 
	user_id INTEGER NOT NULL, 
	bot_id INTEGER NOT NULL, 
	title VARCHAR(160) DEFAULT 'Sơ đồ tri thức' NOT NULL, 
	status VARCHAR(32) DEFAULT 'draft' NOT NULL, 
	created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	updated_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE, 
	FOREIGN KEY(bot_id) REFERENCES chatbot_bots (id) ON DELETE CASCADE
);
COMMIT;
PRAGMA foreign_keys=OFF;
BEGIN TRANSACTION;
CREATE TABLE chatbot_kb_nodes (
	id INTEGER NOT NULL, 
	map_id INTEGER NOT NULL, 
	parent_id INTEGER, 
	node_type VARCHAR(32) DEFAULT 'node' NOT NULL, 
	title VARCHAR(200) NOT NULL, 
	content TEXT, 
	tags VARCHAR(500), 
	priority INTEGER DEFAULT 0 NOT NULL, 
	is_active BOOLEAN DEFAULT true NOT NULL, 
	created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	updated_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(map_id) REFERENCES chatbot_kb_maps (id) ON DELETE CASCADE, 
	FOREIGN KEY(parent_id) REFERENCES chatbot_kb_nodes (id) ON DELETE SET NULL
);
COMMIT;
PRAGMA foreign_keys=OFF;
BEGIN TRANSACTION;
CREATE TABLE chatbot_kb_edges (
	id INTEGER NOT NULL, 
	map_id INTEGER NOT NULL, 
	source_node_id INTEGER NOT NULL, 
	target_node_id INTEGER NOT NULL, 
	relation_type VARCHAR(32) DEFAULT 'child' NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(map_id) REFERENCES chatbot_kb_maps (id) ON DELETE CASCADE, 
	FOREIGN KEY(source_node_id) REFERENCES chatbot_kb_nodes (id) ON DELETE CASCADE, 
	FOREIGN KEY(target_node_id) REFERENCES chatbot_kb_nodes (id) ON DELETE CASCADE
);
COMMIT;
