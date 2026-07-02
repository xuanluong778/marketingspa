--
-- PostgreSQL database dump
--

\restrict OKcOo4c2xPvVAG7xpCT8kF23owgoVizDuMVX7zJVGcJYWR5ziq8mDH7Y6JFVJQN

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

--
-- Data for Name: chatbot_bots; Type: TABLE DATA; Schema: public; Owner: digiseo
--

INSERT INTO public.chatbot_bots VALUES (1, 1, 'https://itsieuviet.com/', 'webdigi', 'IT Siêu Việt', 'Sử máy tính', '0976086500', 'active', '2026-06-29 11:32:27.33752+07', '2026-06-29 11:32:34.389223+07', 'Dịch vụ sửa máy tính tại nahf uy tín chuyên nghiệp', 'professional', 'Xin chào, tôi là trợ lý ảo của IT Siêu Việt. Tôi có thể hỗ trợ thông tin dịch vụ cho bạn.', NULL);


--
-- Data for Name: chatbot_conversations; Type: TABLE DATA; Schema: public; Owner: digiseo
--

INSERT INTO public.chatbot_conversations VALUES (1, 1, 1, 'd3f8ae4f50d94c2295541105af40cb9d', NULL, NULL, 'needs_staff', '2026-06-29 11:42:19.920286+07', '2026-06-29 11:42:20.008314+07', 'website', NULL, NULL, NULL);
INSERT INTO public.chatbot_conversations VALUES (2, 1, 1, '4535f59671c34f9999bef730ffe564e1', NULL, NULL, 'needs_staff', '2026-06-29 11:45:01.297204+07', '2026-06-29 11:45:06.074078+07', 'website', NULL, NULL, NULL);
INSERT INTO public.chatbot_conversations VALUES (3, 1, 1, '1129888da1554922a31502cc92fff30c', NULL, NULL, 'open', '2026-06-29 11:49:44.092764+07', '2026-06-29 11:49:44.167932+07', 'website', NULL, NULL, NULL);
INSERT INTO public.chatbot_conversations VALUES (5, 1, 1, '27d58e6cdaef4abbb84853a988993ed7', NULL, NULL, 'needs_staff', '2026-06-29 14:03:15.157922+07', '2026-06-29 14:03:31.515717+07', 'website', NULL, NULL, NULL);
INSERT INTO public.chatbot_conversations VALUES (6, 1, 1, 'd62f8f4d2ade4b5b809f604b1af1ac51', NULL, NULL, 'needs_staff', '2026-06-29 22:43:49.417383+07', '2026-06-29 22:44:53.012334+07', 'website', NULL, NULL, NULL);
INSERT INTO public.chatbot_conversations VALUES (4, 1, 1, '4d2dc8d1ac2245009a1ece120f4a863c', 'xuanluong', '0934077360', 'handled', '2026-06-29 11:52:42.926786+07', '2026-07-01 22:45:33.189725+07', 'website', NULL, NULL, NULL);


--
-- Data for Name: chatbot_cskh_credit_logs; Type: TABLE DATA; Schema: public; Owner: digiseo
--



--
-- Data for Name: chatbot_facebook_pages; Type: TABLE DATA; Schema: public; Owner: digiseo
--



--
-- Data for Name: chatbot_kb_maps; Type: TABLE DATA; Schema: public; Owner: digiseo
--

INSERT INTO public.chatbot_kb_maps VALUES (1, 1, 1, 'Sơ đồ tri thức', 'draft', '2026-06-29 14:07:44.644099+07', '2026-06-29 14:07:44.644099+07');


--
-- Data for Name: chatbot_kb_nodes; Type: TABLE DATA; Schema: public; Owner: digiseo
--



--
-- Data for Name: chatbot_kb_edges; Type: TABLE DATA; Schema: public; Owner: digiseo
--



--
-- Data for Name: chatbot_knowledge_sources; Type: TABLE DATA; Schema: public; Owner: digiseo
--



--
-- Data for Name: chatbot_leads; Type: TABLE DATA; Schema: public; Owner: digiseo
--

INSERT INTO public.chatbot_leads VALUES (1, 1, 4, 1, 'xuân Lượng', '0976086500', 'tôi muốn tư vấn suwarr máy tính quận 9, lỗi máy tính không nên nguồn', 'https://itsieuviet.com/', 'no_potential', '2026-06-29 11:53:35.079518+07');
INSERT INTO public.chatbot_leads VALUES (2, 1, 4, 1, 'xuanluong', '0934077360', 'suwarm áy tính không lên nguồn', 'https://itsieuviet.com/', 'new', '2026-07-01 22:45:33.189725+07');


--
-- Data for Name: chatbot_messages; Type: TABLE DATA; Schema: public; Owner: digiseo
--

INSERT INTO public.chatbot_messages VALUES (1, 1, 1, 'user', 'hello', '2026-06-29 11:42:19.960167+07');
INSERT INTO public.chatbot_messages VALUES (2, 1, 1, 'assistant', 'Xin lỗi, hệ thống đang bận. Bạn vui lòng thử lại sau hoặc để lại số điện thoại để được tư vấn.', '2026-06-29 11:42:20.005367+07');
INSERT INTO public.chatbot_messages VALUES (3, 2, 1, 'user', 'hello', '2026-06-29 11:45:01.35392+07');
INSERT INTO public.chatbot_messages VALUES (4, 2, 1, 'assistant', 'Xin chào, tôi là trợ lý ảo của IT Siêu Việt. Tôi có thể hỗ trợ thông tin dịch vụ cho bạn.', '2026-06-29 11:45:01.378563+07');
INSERT INTO public.chatbot_messages VALUES (5, 2, 1, 'user', 'báo giá seo tháng bao nhiêu', '2026-06-29 11:45:06.031095+07');
INSERT INTO public.chatbot_messages VALUES (6, 2, 1, 'assistant', 'Hiện tôi chưa có đủ thông tin chính xác về nội dung này. Anh/chị vui lòng để lại số điện thoại để nhân viên tư vấn chi tiết hơn.', '2026-06-29 11:45:06.070983+07');
INSERT INTO public.chatbot_messages VALUES (7, 3, 1, 'user', 'hello', '2026-06-29 11:49:44.150923+07');
INSERT INTO public.chatbot_messages VALUES (8, 3, 1, 'assistant', 'Xin chào, tôi là trợ lý ảo của IT Siêu Việt. Tôi có thể hỗ trợ thông tin dịch vụ cho bạn.', '2026-06-29 11:49:44.16508+07');
INSERT INTO public.chatbot_messages VALUES (9, 4, 1, 'user', 'hello', '2026-06-29 11:52:42.951761+07');
INSERT INTO public.chatbot_messages VALUES (10, 4, 1, 'assistant', 'Xin chào, tôi là trợ lý ảo của IT Siêu Việt. Tôi có thể hỗ trợ thông tin dịch vụ cho bạn.', '2026-06-29 11:52:42.963913+07');
INSERT INTO public.chatbot_messages VALUES (11, 4, 1, 'user', 'báo giá dịch vụ sửa máy tính', '2026-06-29 11:52:55.204324+07');
INSERT INTO public.chatbot_messages VALUES (12, 4, 1, 'assistant', 'Hiện tôi chưa có đủ thông tin chính xác về nội dung này. Anh/chị vui lòng để lại số điện thoại để nhân viên tư vấn chi tiết hơn.', '2026-06-29 11:52:57.796966+07');
INSERT INTO public.chatbot_messages VALUES (13, 5, 1, 'user', 'Hello', '2026-06-29 14:03:15.205337+07');
INSERT INTO public.chatbot_messages VALUES (14, 5, 1, 'assistant', 'Xin chào, tôi là trợ lý ảo của IT Siêu Việt. Tôi có thể hỗ trợ thông tin dịch vụ cho bạn.', '2026-06-29 14:03:15.226799+07');
INSERT INTO public.chatbot_messages VALUES (15, 5, 1, 'user', 'Dịch vụ như thế nào', '2026-06-29 14:03:28.083506+07');
INSERT INTO public.chatbot_messages VALUES (16, 5, 1, 'assistant', 'Chúng tôi cung cấp dịch vụ sửa máy tính tại nhà uy tín và chuyên nghiệp. Nếu bạn cần tư vấn chi tiết hơn hoặc muốn biết thêm về dịch vụ, vui lòng để lại số điện thoại để nhân viên của chúng tôi liên hệ với bạn.', '2026-06-29 14:03:31.513151+07');
INSERT INTO public.chatbot_messages VALUES (17, 6, 1, 'user', 'Auyocad2018', '2026-06-29 22:43:49.457313+07');
INSERT INTO public.chatbot_messages VALUES (18, 6, 1, 'assistant', 'Hiện tôi chưa có đủ thông tin chính xác về nội dung này. Anh/chị vui lòng để lại số điện thoại để nhân viên tư vấn chi tiết hơn.', '2026-06-29 22:43:49.505448+07');
INSERT INTO public.chatbot_messages VALUES (19, 6, 1, 'user', 'free autocad 2018', '2026-06-29 22:44:52.987231+07');
INSERT INTO public.chatbot_messages VALUES (20, 6, 1, 'assistant', 'Hiện tôi chưa có đủ thông tin chính xác về nội dung này. Anh/chị vui lòng để lại số điện thoại để nhân viên tư vấn chi tiết hơn.', '2026-06-29 22:44:53.003434+07');
INSERT INTO public.chatbot_messages VALUES (21, 4, 1, 'user', 'hello', '2026-07-01 22:44:46.453388+07');
INSERT INTO public.chatbot_messages VALUES (22, 4, 1, 'assistant', 'Xin chào, tôi là trợ lý ảo của IT Siêu Việt. Tôi có thể hỗ trợ thông tin dịch vụ cho bạn.', '2026-07-01 22:44:46.500304+07');
INSERT INTO public.chatbot_messages VALUES (23, 4, 1, 'user', 'tôi muốn đặt dịch vụ sửa máy tính tại nahf', '2026-07-01 22:45:02.602123+07');
INSERT INTO public.chatbot_messages VALUES (24, 4, 1, 'assistant', 'Cảm ơn bạn đã quan tâm đến dịch vụ sửa máy tính của IT Siêu Việt. Anh/chị vui lòng để lại số điện thoại để nhân viên chúng tôi có thể liên hệ và hỗ trợ đặt lịch cho bạn.', '2026-07-01 22:45:02.637112+07');


--
-- Data for Name: chatbot_usage; Type: TABLE DATA; Schema: public; Owner: digiseo
--

INSERT INTO public.chatbot_usage VALUES (1, 1, 1, '2026-06', 2, 2, '2026-06-29 14:03:31.522123+07');
INSERT INTO public.chatbot_usage VALUES (2, 1, 1, '2026-07', 1, 1, '2026-07-01 22:45:05.31622+07');


--
-- Name: chatbot_bots_id_seq; Type: SEQUENCE SET; Schema: public; Owner: digiseo
--

SELECT pg_catalog.setval('public.chatbot_bots_id_seq', 1, true);


--
-- Name: chatbot_conversations_id_seq; Type: SEQUENCE SET; Schema: public; Owner: digiseo
--

SELECT pg_catalog.setval('public.chatbot_conversations_id_seq', 6, true);


--
-- Name: chatbot_cskh_credit_logs_id_seq; Type: SEQUENCE SET; Schema: public; Owner: digiseo
--

SELECT pg_catalog.setval('public.chatbot_cskh_credit_logs_id_seq', 1, false);


--
-- Name: chatbot_facebook_pages_id_seq; Type: SEQUENCE SET; Schema: public; Owner: digiseo
--

SELECT pg_catalog.setval('public.chatbot_facebook_pages_id_seq', 1, false);


--
-- Name: chatbot_kb_edges_id_seq; Type: SEQUENCE SET; Schema: public; Owner: digiseo
--

SELECT pg_catalog.setval('public.chatbot_kb_edges_id_seq', 1, false);


--
-- Name: chatbot_kb_maps_id_seq; Type: SEQUENCE SET; Schema: public; Owner: digiseo
--

SELECT pg_catalog.setval('public.chatbot_kb_maps_id_seq', 1, true);


--
-- Name: chatbot_kb_nodes_id_seq; Type: SEQUENCE SET; Schema: public; Owner: digiseo
--

SELECT pg_catalog.setval('public.chatbot_kb_nodes_id_seq', 1, false);


--
-- Name: chatbot_knowledge_sources_id_seq; Type: SEQUENCE SET; Schema: public; Owner: digiseo
--

SELECT pg_catalog.setval('public.chatbot_knowledge_sources_id_seq', 1, false);


--
-- Name: chatbot_leads_id_seq; Type: SEQUENCE SET; Schema: public; Owner: digiseo
--

SELECT pg_catalog.setval('public.chatbot_leads_id_seq', 2, true);


--
-- Name: chatbot_messages_id_seq; Type: SEQUENCE SET; Schema: public; Owner: digiseo
--

SELECT pg_catalog.setval('public.chatbot_messages_id_seq', 24, true);


--
-- Name: chatbot_usage_id_seq; Type: SEQUENCE SET; Schema: public; Owner: digiseo
--

SELECT pg_catalog.setval('public.chatbot_usage_id_seq', 2, true);


--
-- PostgreSQL database dump complete
--

\unrestrict OKcOo4c2xPvVAG7xpCT8kF23owgoVizDuMVX7zJVGcJYWR5ziq8mDH7Y6JFVJQN

