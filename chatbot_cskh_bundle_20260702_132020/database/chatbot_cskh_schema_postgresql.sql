--
-- PostgreSQL database dump
--

\restrict oAxhcZ6ryBXhJc3dp0SUn6jJ6609MofccGy3HK7G3C9UEDlkD5ZCClAmITjck9M

-- Dumped from database version 16.14 (Ubuntu 16.14-0ubuntu0.24.04.1)
-- Dumped by pg_dump version 16.14 (Ubuntu 16.14-0ubuntu0.24.04.1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: chatbot_bots; Type: TABLE; Schema: public; Owner: digiseo
--

CREATE TABLE public.chatbot_bots (
    id integer NOT NULL,
    user_id integer NOT NULL,
    website_url character varying(2000),
    bot_name character varying(120) NOT NULL,
    business_name character varying(160),
    industry character varying(120),
    hotline character varying(64),
    status character varying(32) DEFAULT 'draft'::character varying NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    main_services text,
    consultation_tone character varying(64),
    greeting character varying(500),
    allowed_domains character varying(2000)
);


ALTER TABLE public.chatbot_bots OWNER TO digiseo;

--
-- Name: chatbot_bots_id_seq; Type: SEQUENCE; Schema: public; Owner: digiseo
--

CREATE SEQUENCE public.chatbot_bots_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.chatbot_bots_id_seq OWNER TO digiseo;

--
-- Name: chatbot_bots_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: digiseo
--

ALTER SEQUENCE public.chatbot_bots_id_seq OWNED BY public.chatbot_bots.id;


--
-- Name: chatbot_conversations; Type: TABLE; Schema: public; Owner: digiseo
--

CREATE TABLE public.chatbot_conversations (
    id integer NOT NULL,
    bot_id integer NOT NULL,
    user_id integer NOT NULL,
    session_id character varying(64) NOT NULL,
    visitor_name character varying(120),
    visitor_phone character varying(32),
    status character varying(32) DEFAULT 'open'::character varying NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    channel character varying(32) DEFAULT 'website'::character varying NOT NULL,
    external_user_id character varying(64),
    channel_ref character varying(64),
    last_user_message_at timestamp with time zone
);


ALTER TABLE public.chatbot_conversations OWNER TO digiseo;

--
-- Name: chatbot_conversations_id_seq; Type: SEQUENCE; Schema: public; Owner: digiseo
--

CREATE SEQUENCE public.chatbot_conversations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.chatbot_conversations_id_seq OWNER TO digiseo;

--
-- Name: chatbot_conversations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: digiseo
--

ALTER SEQUENCE public.chatbot_conversations_id_seq OWNED BY public.chatbot_conversations.id;


--
-- Name: chatbot_cskh_credit_logs; Type: TABLE; Schema: public; Owner: digiseo
--

CREATE TABLE public.chatbot_cskh_credit_logs (
    id integer NOT NULL,
    user_id integer NOT NULL,
    admin_id integer,
    delta integer NOT NULL,
    balance_after integer NOT NULL,
    reason character varying(500) NOT NULL,
    internal_note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.chatbot_cskh_credit_logs OWNER TO digiseo;

--
-- Name: chatbot_cskh_credit_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: digiseo
--

CREATE SEQUENCE public.chatbot_cskh_credit_logs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.chatbot_cskh_credit_logs_id_seq OWNER TO digiseo;

--
-- Name: chatbot_cskh_credit_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: digiseo
--

ALTER SEQUENCE public.chatbot_cskh_credit_logs_id_seq OWNED BY public.chatbot_cskh_credit_logs.id;


--
-- Name: chatbot_facebook_pages; Type: TABLE; Schema: public; Owner: digiseo
--

CREATE TABLE public.chatbot_facebook_pages (
    id integer NOT NULL,
    user_id integer NOT NULL,
    bot_id integer NOT NULL,
    page_id character varying(64) NOT NULL,
    page_name character varying(200) NOT NULL,
    page_access_token_encrypted text NOT NULL,
    ai_enabled boolean DEFAULT true NOT NULL,
    status character varying(32) DEFAULT 'connected'::character varying NOT NULL,
    webhook_subscribed boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.chatbot_facebook_pages OWNER TO digiseo;

--
-- Name: chatbot_facebook_pages_id_seq; Type: SEQUENCE; Schema: public; Owner: digiseo
--

CREATE SEQUENCE public.chatbot_facebook_pages_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.chatbot_facebook_pages_id_seq OWNER TO digiseo;

--
-- Name: chatbot_facebook_pages_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: digiseo
--

ALTER SEQUENCE public.chatbot_facebook_pages_id_seq OWNED BY public.chatbot_facebook_pages.id;


--
-- Name: chatbot_kb_edges; Type: TABLE; Schema: public; Owner: digiseo
--

CREATE TABLE public.chatbot_kb_edges (
    id integer NOT NULL,
    map_id integer NOT NULL,
    source_node_id integer NOT NULL,
    target_node_id integer NOT NULL,
    relation_type character varying(32) DEFAULT 'child'::character varying NOT NULL
);


ALTER TABLE public.chatbot_kb_edges OWNER TO digiseo;

--
-- Name: chatbot_kb_edges_id_seq; Type: SEQUENCE; Schema: public; Owner: digiseo
--

CREATE SEQUENCE public.chatbot_kb_edges_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.chatbot_kb_edges_id_seq OWNER TO digiseo;

--
-- Name: chatbot_kb_edges_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: digiseo
--

ALTER SEQUENCE public.chatbot_kb_edges_id_seq OWNED BY public.chatbot_kb_edges.id;


--
-- Name: chatbot_kb_maps; Type: TABLE; Schema: public; Owner: digiseo
--

CREATE TABLE public.chatbot_kb_maps (
    id integer NOT NULL,
    user_id integer NOT NULL,
    bot_id integer NOT NULL,
    title character varying(160) DEFAULT 'Sơ đồ tri thức'::character varying NOT NULL,
    status character varying(32) DEFAULT 'draft'::character varying NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.chatbot_kb_maps OWNER TO digiseo;

--
-- Name: chatbot_kb_maps_id_seq; Type: SEQUENCE; Schema: public; Owner: digiseo
--

CREATE SEQUENCE public.chatbot_kb_maps_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.chatbot_kb_maps_id_seq OWNER TO digiseo;

--
-- Name: chatbot_kb_maps_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: digiseo
--

ALTER SEQUENCE public.chatbot_kb_maps_id_seq OWNED BY public.chatbot_kb_maps.id;


--
-- Name: chatbot_kb_nodes; Type: TABLE; Schema: public; Owner: digiseo
--

CREATE TABLE public.chatbot_kb_nodes (
    id integer NOT NULL,
    map_id integer NOT NULL,
    parent_id integer,
    node_type character varying(32) DEFAULT 'node'::character varying NOT NULL,
    title character varying(200) NOT NULL,
    content text,
    tags character varying(500),
    priority integer DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.chatbot_kb_nodes OWNER TO digiseo;

--
-- Name: chatbot_kb_nodes_id_seq; Type: SEQUENCE; Schema: public; Owner: digiseo
--

CREATE SEQUENCE public.chatbot_kb_nodes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.chatbot_kb_nodes_id_seq OWNER TO digiseo;

--
-- Name: chatbot_kb_nodes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: digiseo
--

ALTER SEQUENCE public.chatbot_kb_nodes_id_seq OWNED BY public.chatbot_kb_nodes.id;


--
-- Name: chatbot_knowledge_sources; Type: TABLE; Schema: public; Owner: digiseo
--

CREATE TABLE public.chatbot_knowledge_sources (
    id integer NOT NULL,
    bot_id integer NOT NULL,
    user_id integer NOT NULL,
    source_type character varying(32) NOT NULL,
    title character varying(160) NOT NULL,
    url character varying(2000),
    content text,
    status character varying(32) DEFAULT 'active'::character varying NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone,
    crawl_error character varying(500)
);


ALTER TABLE public.chatbot_knowledge_sources OWNER TO digiseo;

--
-- Name: chatbot_knowledge_sources_id_seq; Type: SEQUENCE; Schema: public; Owner: digiseo
--

CREATE SEQUENCE public.chatbot_knowledge_sources_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.chatbot_knowledge_sources_id_seq OWNER TO digiseo;

--
-- Name: chatbot_knowledge_sources_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: digiseo
--

ALTER SEQUENCE public.chatbot_knowledge_sources_id_seq OWNED BY public.chatbot_knowledge_sources.id;


--
-- Name: chatbot_leads; Type: TABLE; Schema: public; Owner: digiseo
--

CREATE TABLE public.chatbot_leads (
    id integer NOT NULL,
    bot_id integer NOT NULL,
    conversation_id integer,
    user_id integer NOT NULL,
    name character varying(120),
    phone character varying(32),
    need text,
    page_url character varying(2000),
    status character varying(32) DEFAULT 'new'::character varying NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.chatbot_leads OWNER TO digiseo;

--
-- Name: chatbot_leads_id_seq; Type: SEQUENCE; Schema: public; Owner: digiseo
--

CREATE SEQUENCE public.chatbot_leads_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.chatbot_leads_id_seq OWNER TO digiseo;

--
-- Name: chatbot_leads_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: digiseo
--

ALTER SEQUENCE public.chatbot_leads_id_seq OWNED BY public.chatbot_leads.id;


--
-- Name: chatbot_messages; Type: TABLE; Schema: public; Owner: digiseo
--

CREATE TABLE public.chatbot_messages (
    id integer NOT NULL,
    conversation_id integer NOT NULL,
    user_id integer NOT NULL,
    role character varying(16) NOT NULL,
    message text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.chatbot_messages OWNER TO digiseo;

--
-- Name: chatbot_messages_id_seq; Type: SEQUENCE; Schema: public; Owner: digiseo
--

CREATE SEQUENCE public.chatbot_messages_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.chatbot_messages_id_seq OWNER TO digiseo;

--
-- Name: chatbot_messages_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: digiseo
--

ALTER SEQUENCE public.chatbot_messages_id_seq OWNED BY public.chatbot_messages.id;


--
-- Name: chatbot_usage; Type: TABLE; Schema: public; Owner: digiseo
--

CREATE TABLE public.chatbot_usage (
    id integer NOT NULL,
    user_id integer NOT NULL,
    bot_id integer,
    month character varying(7) NOT NULL,
    ai_replies integer DEFAULT 0 NOT NULL,
    credits_used integer DEFAULT 0 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.chatbot_usage OWNER TO digiseo;

--
-- Name: chatbot_usage_id_seq; Type: SEQUENCE; Schema: public; Owner: digiseo
--

CREATE SEQUENCE public.chatbot_usage_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.chatbot_usage_id_seq OWNER TO digiseo;

--
-- Name: chatbot_usage_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: digiseo
--

ALTER SEQUENCE public.chatbot_usage_id_seq OWNED BY public.chatbot_usage.id;


--
-- Name: chatbot_bots id; Type: DEFAULT; Schema: public; Owner: digiseo
--

ALTER TABLE ONLY public.chatbot_bots ALTER COLUMN id SET DEFAULT nextval('public.chatbot_bots_id_seq'::regclass);


--
-- Name: chatbot_conversations id; Type: DEFAULT; Schema: public; Owner: digiseo
--

ALTER TABLE ONLY public.chatbot_conversations ALTER COLUMN id SET DEFAULT nextval('public.chatbot_conversations_id_seq'::regclass);


--
-- Name: chatbot_cskh_credit_logs id; Type: DEFAULT; Schema: public; Owner: digiseo
--

ALTER TABLE ONLY public.chatbot_cskh_credit_logs ALTER COLUMN id SET DEFAULT nextval('public.chatbot_cskh_credit_logs_id_seq'::regclass);


--
-- Name: chatbot_facebook_pages id; Type: DEFAULT; Schema: public; Owner: digiseo
--

ALTER TABLE ONLY public.chatbot_facebook_pages ALTER COLUMN id SET DEFAULT nextval('public.chatbot_facebook_pages_id_seq'::regclass);


--
-- Name: chatbot_kb_edges id; Type: DEFAULT; Schema: public; Owner: digiseo
--

ALTER TABLE ONLY public.chatbot_kb_edges ALTER COLUMN id SET DEFAULT nextval('public.chatbot_kb_edges_id_seq'::regclass);


--
-- Name: chatbot_kb_maps id; Type: DEFAULT; Schema: public; Owner: digiseo
--

ALTER TABLE ONLY public.chatbot_kb_maps ALTER COLUMN id SET DEFAULT nextval('public.chatbot_kb_maps_id_seq'::regclass);


--
-- Name: chatbot_kb_nodes id; Type: DEFAULT; Schema: public; Owner: digiseo
--

ALTER TABLE ONLY public.chatbot_kb_nodes ALTER COLUMN id SET DEFAULT nextval('public.chatbot_kb_nodes_id_seq'::regclass);


--
-- Name: chatbot_knowledge_sources id; Type: DEFAULT; Schema: public; Owner: digiseo
--

ALTER TABLE ONLY public.chatbot_knowledge_sources ALTER COLUMN id SET DEFAULT nextval('public.chatbot_knowledge_sources_id_seq'::regclass);


--
-- Name: chatbot_leads id; Type: DEFAULT; Schema: public; Owner: digiseo
--

ALTER TABLE ONLY public.chatbot_leads ALTER COLUMN id SET DEFAULT nextval('public.chatbot_leads_id_seq'::regclass);


--
-- Name: chatbot_messages id; Type: DEFAULT; Schema: public; Owner: digiseo
--

ALTER TABLE ONLY public.chatbot_messages ALTER COLUMN id SET DEFAULT nextval('public.chatbot_messages_id_seq'::regclass);


--
-- Name: chatbot_usage id; Type: DEFAULT; Schema: public; Owner: digiseo
--

ALTER TABLE ONLY public.chatbot_usage ALTER COLUMN id SET DEFAULT nextval('public.chatbot_usage_id_seq'::regclass);


--
-- Name: chatbot_bots chatbot_bots_pkey; Type: CONSTRAINT; Schema: public; Owner: digiseo
--

ALTER TABLE ONLY public.chatbot_bots
    ADD CONSTRAINT chatbot_bots_pkey PRIMARY KEY (id);


--
-- Name: chatbot_conversations chatbot_conversations_pkey; Type: CONSTRAINT; Schema: public; Owner: digiseo
--

ALTER TABLE ONLY public.chatbot_conversations
    ADD CONSTRAINT chatbot_conversations_pkey PRIMARY KEY (id);


--
-- Name: chatbot_cskh_credit_logs chatbot_cskh_credit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: digiseo
--

ALTER TABLE ONLY public.chatbot_cskh_credit_logs
    ADD CONSTRAINT chatbot_cskh_credit_logs_pkey PRIMARY KEY (id);


--
-- Name: chatbot_facebook_pages chatbot_facebook_pages_pkey; Type: CONSTRAINT; Schema: public; Owner: digiseo
--

ALTER TABLE ONLY public.chatbot_facebook_pages
    ADD CONSTRAINT chatbot_facebook_pages_pkey PRIMARY KEY (id);


--
-- Name: chatbot_kb_edges chatbot_kb_edges_pkey; Type: CONSTRAINT; Schema: public; Owner: digiseo
--

ALTER TABLE ONLY public.chatbot_kb_edges
    ADD CONSTRAINT chatbot_kb_edges_pkey PRIMARY KEY (id);


--
-- Name: chatbot_kb_maps chatbot_kb_maps_pkey; Type: CONSTRAINT; Schema: public; Owner: digiseo
--

ALTER TABLE ONLY public.chatbot_kb_maps
    ADD CONSTRAINT chatbot_kb_maps_pkey PRIMARY KEY (id);


--
-- Name: chatbot_kb_nodes chatbot_kb_nodes_pkey; Type: CONSTRAINT; Schema: public; Owner: digiseo
--

ALTER TABLE ONLY public.chatbot_kb_nodes
    ADD CONSTRAINT chatbot_kb_nodes_pkey PRIMARY KEY (id);


--
-- Name: chatbot_knowledge_sources chatbot_knowledge_sources_pkey; Type: CONSTRAINT; Schema: public; Owner: digiseo
--

ALTER TABLE ONLY public.chatbot_knowledge_sources
    ADD CONSTRAINT chatbot_knowledge_sources_pkey PRIMARY KEY (id);


--
-- Name: chatbot_leads chatbot_leads_pkey; Type: CONSTRAINT; Schema: public; Owner: digiseo
--

ALTER TABLE ONLY public.chatbot_leads
    ADD CONSTRAINT chatbot_leads_pkey PRIMARY KEY (id);


--
-- Name: chatbot_messages chatbot_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: digiseo
--

ALTER TABLE ONLY public.chatbot_messages
    ADD CONSTRAINT chatbot_messages_pkey PRIMARY KEY (id);


--
-- Name: chatbot_usage chatbot_usage_pkey; Type: CONSTRAINT; Schema: public; Owner: digiseo
--

ALTER TABLE ONLY public.chatbot_usage
    ADD CONSTRAINT chatbot_usage_pkey PRIMARY KEY (id);


--
-- Name: chatbot_facebook_pages uq_chatbot_fb_page_id; Type: CONSTRAINT; Schema: public; Owner: digiseo
--

ALTER TABLE ONLY public.chatbot_facebook_pages
    ADD CONSTRAINT uq_chatbot_fb_page_id UNIQUE (page_id);


--
-- Name: chatbot_usage uq_chatbot_usage_user_bot_month; Type: CONSTRAINT; Schema: public; Owner: digiseo
--

ALTER TABLE ONLY public.chatbot_usage
    ADD CONSTRAINT uq_chatbot_usage_user_bot_month UNIQUE (user_id, bot_id, month);


--
-- Name: ix_chatbot_bots_user_created; Type: INDEX; Schema: public; Owner: digiseo
--

CREATE INDEX ix_chatbot_bots_user_created ON public.chatbot_bots USING btree (user_id, created_at);


--
-- Name: ix_chatbot_bots_user_id; Type: INDEX; Schema: public; Owner: digiseo
--

CREATE INDEX ix_chatbot_bots_user_id ON public.chatbot_bots USING btree (user_id);


--
-- Name: ix_chatbot_bots_user_status; Type: INDEX; Schema: public; Owner: digiseo
--

CREATE INDEX ix_chatbot_bots_user_status ON public.chatbot_bots USING btree (user_id, status);


--
-- Name: ix_chatbot_conv_bot; Type: INDEX; Schema: public; Owner: digiseo
--

CREATE INDEX ix_chatbot_conv_bot ON public.chatbot_conversations USING btree (bot_id);


--
-- Name: ix_chatbot_conv_session; Type: INDEX; Schema: public; Owner: digiseo
--

CREATE INDEX ix_chatbot_conv_session ON public.chatbot_conversations USING btree (session_id);


--
-- Name: ix_chatbot_conv_user_created; Type: INDEX; Schema: public; Owner: digiseo
--

CREATE INDEX ix_chatbot_conv_user_created ON public.chatbot_conversations USING btree (user_id, created_at);


--
-- Name: ix_chatbot_conversations_bot_id; Type: INDEX; Schema: public; Owner: digiseo
--

CREATE INDEX ix_chatbot_conversations_bot_id ON public.chatbot_conversations USING btree (bot_id);


--
-- Name: ix_chatbot_conversations_user_id; Type: INDEX; Schema: public; Owner: digiseo
--

CREATE INDEX ix_chatbot_conversations_user_id ON public.chatbot_conversations USING btree (user_id);


--
-- Name: ix_chatbot_cskh_credit_logs_admin_id; Type: INDEX; Schema: public; Owner: digiseo
--

CREATE INDEX ix_chatbot_cskh_credit_logs_admin_id ON public.chatbot_cskh_credit_logs USING btree (admin_id);


--
-- Name: ix_chatbot_cskh_credit_logs_user_id; Type: INDEX; Schema: public; Owner: digiseo
--

CREATE INDEX ix_chatbot_cskh_credit_logs_user_id ON public.chatbot_cskh_credit_logs USING btree (user_id);


--
-- Name: ix_chatbot_facebook_pages_bot_id; Type: INDEX; Schema: public; Owner: digiseo
--

CREATE INDEX ix_chatbot_facebook_pages_bot_id ON public.chatbot_facebook_pages USING btree (bot_id);


--
-- Name: ix_chatbot_facebook_pages_user_id; Type: INDEX; Schema: public; Owner: digiseo
--

CREATE INDEX ix_chatbot_facebook_pages_user_id ON public.chatbot_facebook_pages USING btree (user_id);


--
-- Name: ix_chatbot_fb_user_bot; Type: INDEX; Schema: public; Owner: digiseo
--

CREATE INDEX ix_chatbot_fb_user_bot ON public.chatbot_facebook_pages USING btree (user_id, bot_id);


--
-- Name: ix_chatbot_kb_edges_map; Type: INDEX; Schema: public; Owner: digiseo
--

CREATE INDEX ix_chatbot_kb_edges_map ON public.chatbot_kb_edges USING btree (map_id);


--
-- Name: ix_chatbot_kb_edges_map_id; Type: INDEX; Schema: public; Owner: digiseo
--

CREATE INDEX ix_chatbot_kb_edges_map_id ON public.chatbot_kb_edges USING btree (map_id);


--
-- Name: ix_chatbot_kb_edges_source_node_id; Type: INDEX; Schema: public; Owner: digiseo
--

CREATE INDEX ix_chatbot_kb_edges_source_node_id ON public.chatbot_kb_edges USING btree (source_node_id);


--
-- Name: ix_chatbot_kb_edges_target_node_id; Type: INDEX; Schema: public; Owner: digiseo
--

CREATE INDEX ix_chatbot_kb_edges_target_node_id ON public.chatbot_kb_edges USING btree (target_node_id);


--
-- Name: ix_chatbot_kb_maps_bot_id; Type: INDEX; Schema: public; Owner: digiseo
--

CREATE INDEX ix_chatbot_kb_maps_bot_id ON public.chatbot_kb_maps USING btree (bot_id);


--
-- Name: ix_chatbot_kb_maps_bot_status; Type: INDEX; Schema: public; Owner: digiseo
--

CREATE INDEX ix_chatbot_kb_maps_bot_status ON public.chatbot_kb_maps USING btree (bot_id, status);


--
-- Name: ix_chatbot_kb_maps_user_bot; Type: INDEX; Schema: public; Owner: digiseo
--

CREATE INDEX ix_chatbot_kb_maps_user_bot ON public.chatbot_kb_maps USING btree (user_id, bot_id);


--
-- Name: ix_chatbot_kb_maps_user_id; Type: INDEX; Schema: public; Owner: digiseo
--

CREATE INDEX ix_chatbot_kb_maps_user_id ON public.chatbot_kb_maps USING btree (user_id);


--
-- Name: ix_chatbot_kb_nodes_map; Type: INDEX; Schema: public; Owner: digiseo
--

CREATE INDEX ix_chatbot_kb_nodes_map ON public.chatbot_kb_nodes USING btree (map_id);


--
-- Name: ix_chatbot_kb_nodes_map_active; Type: INDEX; Schema: public; Owner: digiseo
--

CREATE INDEX ix_chatbot_kb_nodes_map_active ON public.chatbot_kb_nodes USING btree (map_id, is_active);


--
-- Name: ix_chatbot_kb_nodes_map_id; Type: INDEX; Schema: public; Owner: digiseo
--

CREATE INDEX ix_chatbot_kb_nodes_map_id ON public.chatbot_kb_nodes USING btree (map_id);


--
-- Name: ix_chatbot_kb_nodes_parent; Type: INDEX; Schema: public; Owner: digiseo
--

CREATE INDEX ix_chatbot_kb_nodes_parent ON public.chatbot_kb_nodes USING btree (parent_id);


--
-- Name: ix_chatbot_kb_nodes_parent_id; Type: INDEX; Schema: public; Owner: digiseo
--

CREATE INDEX ix_chatbot_kb_nodes_parent_id ON public.chatbot_kb_nodes USING btree (parent_id);


--
-- Name: ix_chatbot_knowledge_sources_bot_id; Type: INDEX; Schema: public; Owner: digiseo
--

CREATE INDEX ix_chatbot_knowledge_sources_bot_id ON public.chatbot_knowledge_sources USING btree (bot_id);


--
-- Name: ix_chatbot_knowledge_sources_user_id; Type: INDEX; Schema: public; Owner: digiseo
--

CREATE INDEX ix_chatbot_knowledge_sources_user_id ON public.chatbot_knowledge_sources USING btree (user_id);


--
-- Name: ix_chatbot_ks_bot; Type: INDEX; Schema: public; Owner: digiseo
--

CREATE INDEX ix_chatbot_ks_bot ON public.chatbot_knowledge_sources USING btree (bot_id);


--
-- Name: ix_chatbot_leads_bot; Type: INDEX; Schema: public; Owner: digiseo
--

CREATE INDEX ix_chatbot_leads_bot ON public.chatbot_leads USING btree (bot_id);


--
-- Name: ix_chatbot_leads_bot_id; Type: INDEX; Schema: public; Owner: digiseo
--

CREATE INDEX ix_chatbot_leads_bot_id ON public.chatbot_leads USING btree (bot_id);


--
-- Name: ix_chatbot_leads_conversation_id; Type: INDEX; Schema: public; Owner: digiseo
--

CREATE INDEX ix_chatbot_leads_conversation_id ON public.chatbot_leads USING btree (conversation_id);


--
-- Name: ix_chatbot_leads_user; Type: INDEX; Schema: public; Owner: digiseo
--

CREATE INDEX ix_chatbot_leads_user ON public.chatbot_leads USING btree (user_id, created_at);


--
-- Name: ix_chatbot_leads_user_id; Type: INDEX; Schema: public; Owner: digiseo
--

CREATE INDEX ix_chatbot_leads_user_id ON public.chatbot_leads USING btree (user_id);


--
-- Name: ix_chatbot_messages_conversation_id; Type: INDEX; Schema: public; Owner: digiseo
--

CREATE INDEX ix_chatbot_messages_conversation_id ON public.chatbot_messages USING btree (conversation_id);


--
-- Name: ix_chatbot_messages_user_id; Type: INDEX; Schema: public; Owner: digiseo
--

CREATE INDEX ix_chatbot_messages_user_id ON public.chatbot_messages USING btree (user_id);


--
-- Name: ix_chatbot_msg_conv_created; Type: INDEX; Schema: public; Owner: digiseo
--

CREATE INDEX ix_chatbot_msg_conv_created ON public.chatbot_messages USING btree (conversation_id, created_at);


--
-- Name: ix_chatbot_usage_bot_id; Type: INDEX; Schema: public; Owner: digiseo
--

CREATE INDEX ix_chatbot_usage_bot_id ON public.chatbot_usage USING btree (bot_id);


--
-- Name: ix_chatbot_usage_user_id; Type: INDEX; Schema: public; Owner: digiseo
--

CREATE INDEX ix_chatbot_usage_user_id ON public.chatbot_usage USING btree (user_id);


--
-- Name: ix_chatbot_usage_user_month; Type: INDEX; Schema: public; Owner: digiseo
--

CREATE INDEX ix_chatbot_usage_user_month ON public.chatbot_usage USING btree (user_id, month);


--
-- Name: chatbot_bots chatbot_bots_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: digiseo
--

ALTER TABLE ONLY public.chatbot_bots
    ADD CONSTRAINT chatbot_bots_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: chatbot_conversations chatbot_conversations_bot_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: digiseo
--

ALTER TABLE ONLY public.chatbot_conversations
    ADD CONSTRAINT chatbot_conversations_bot_id_fkey FOREIGN KEY (bot_id) REFERENCES public.chatbot_bots(id) ON DELETE CASCADE;


--
-- Name: chatbot_conversations chatbot_conversations_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: digiseo
--

ALTER TABLE ONLY public.chatbot_conversations
    ADD CONSTRAINT chatbot_conversations_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: chatbot_cskh_credit_logs chatbot_cskh_credit_logs_admin_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: digiseo
--

ALTER TABLE ONLY public.chatbot_cskh_credit_logs
    ADD CONSTRAINT chatbot_cskh_credit_logs_admin_id_fkey FOREIGN KEY (admin_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: chatbot_cskh_credit_logs chatbot_cskh_credit_logs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: digiseo
--

ALTER TABLE ONLY public.chatbot_cskh_credit_logs
    ADD CONSTRAINT chatbot_cskh_credit_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: chatbot_facebook_pages chatbot_facebook_pages_bot_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: digiseo
--

ALTER TABLE ONLY public.chatbot_facebook_pages
    ADD CONSTRAINT chatbot_facebook_pages_bot_id_fkey FOREIGN KEY (bot_id) REFERENCES public.chatbot_bots(id) ON DELETE CASCADE;


--
-- Name: chatbot_facebook_pages chatbot_facebook_pages_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: digiseo
--

ALTER TABLE ONLY public.chatbot_facebook_pages
    ADD CONSTRAINT chatbot_facebook_pages_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: chatbot_kb_edges chatbot_kb_edges_map_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: digiseo
--

ALTER TABLE ONLY public.chatbot_kb_edges
    ADD CONSTRAINT chatbot_kb_edges_map_id_fkey FOREIGN KEY (map_id) REFERENCES public.chatbot_kb_maps(id) ON DELETE CASCADE;


--
-- Name: chatbot_kb_edges chatbot_kb_edges_source_node_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: digiseo
--

ALTER TABLE ONLY public.chatbot_kb_edges
    ADD CONSTRAINT chatbot_kb_edges_source_node_id_fkey FOREIGN KEY (source_node_id) REFERENCES public.chatbot_kb_nodes(id) ON DELETE CASCADE;


--
-- Name: chatbot_kb_edges chatbot_kb_edges_target_node_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: digiseo
--

ALTER TABLE ONLY public.chatbot_kb_edges
    ADD CONSTRAINT chatbot_kb_edges_target_node_id_fkey FOREIGN KEY (target_node_id) REFERENCES public.chatbot_kb_nodes(id) ON DELETE CASCADE;


--
-- Name: chatbot_kb_maps chatbot_kb_maps_bot_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: digiseo
--

ALTER TABLE ONLY public.chatbot_kb_maps
    ADD CONSTRAINT chatbot_kb_maps_bot_id_fkey FOREIGN KEY (bot_id) REFERENCES public.chatbot_bots(id) ON DELETE CASCADE;


--
-- Name: chatbot_kb_maps chatbot_kb_maps_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: digiseo
--

ALTER TABLE ONLY public.chatbot_kb_maps
    ADD CONSTRAINT chatbot_kb_maps_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: chatbot_kb_nodes chatbot_kb_nodes_map_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: digiseo
--

ALTER TABLE ONLY public.chatbot_kb_nodes
    ADD CONSTRAINT chatbot_kb_nodes_map_id_fkey FOREIGN KEY (map_id) REFERENCES public.chatbot_kb_maps(id) ON DELETE CASCADE;


--
-- Name: chatbot_kb_nodes chatbot_kb_nodes_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: digiseo
--

ALTER TABLE ONLY public.chatbot_kb_nodes
    ADD CONSTRAINT chatbot_kb_nodes_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.chatbot_kb_nodes(id) ON DELETE SET NULL;


--
-- Name: chatbot_knowledge_sources chatbot_knowledge_sources_bot_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: digiseo
--

ALTER TABLE ONLY public.chatbot_knowledge_sources
    ADD CONSTRAINT chatbot_knowledge_sources_bot_id_fkey FOREIGN KEY (bot_id) REFERENCES public.chatbot_bots(id) ON DELETE CASCADE;


--
-- Name: chatbot_knowledge_sources chatbot_knowledge_sources_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: digiseo
--

ALTER TABLE ONLY public.chatbot_knowledge_sources
    ADD CONSTRAINT chatbot_knowledge_sources_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: chatbot_leads chatbot_leads_bot_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: digiseo
--

ALTER TABLE ONLY public.chatbot_leads
    ADD CONSTRAINT chatbot_leads_bot_id_fkey FOREIGN KEY (bot_id) REFERENCES public.chatbot_bots(id) ON DELETE CASCADE;


--
-- Name: chatbot_leads chatbot_leads_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: digiseo
--

ALTER TABLE ONLY public.chatbot_leads
    ADD CONSTRAINT chatbot_leads_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.chatbot_conversations(id) ON DELETE SET NULL;


--
-- Name: chatbot_leads chatbot_leads_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: digiseo
--

ALTER TABLE ONLY public.chatbot_leads
    ADD CONSTRAINT chatbot_leads_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: chatbot_messages chatbot_messages_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: digiseo
--

ALTER TABLE ONLY public.chatbot_messages
    ADD CONSTRAINT chatbot_messages_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.chatbot_conversations(id) ON DELETE CASCADE;


--
-- Name: chatbot_messages chatbot_messages_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: digiseo
--

ALTER TABLE ONLY public.chatbot_messages
    ADD CONSTRAINT chatbot_messages_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: chatbot_usage chatbot_usage_bot_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: digiseo
--

ALTER TABLE ONLY public.chatbot_usage
    ADD CONSTRAINT chatbot_usage_bot_id_fkey FOREIGN KEY (bot_id) REFERENCES public.chatbot_bots(id) ON DELETE SET NULL;


--
-- Name: chatbot_usage chatbot_usage_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: digiseo
--

ALTER TABLE ONLY public.chatbot_usage
    ADD CONSTRAINT chatbot_usage_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

\unrestrict oAxhcZ6ryBXhJc3dp0SUn6jJ6609MofccGy3HK7G3C9UEDlkD5ZCClAmITjck9M

