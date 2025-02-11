--
-- PostgreSQL database dump
--

-- Dumped from database version 14.15 (Debian 14.15-1.pgdg120+1)
-- Dumped by pg_dump version 14.15 (Debian 14.15-1.pgdg120+1)

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
-- Name: classes; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.classes (
    id integer NOT NULL,
    class_number character varying(50),
    class_name character varying(255),
    semesters_offered text[],
    credits integer,
    prerequisites text[],
    corequisites text[],
    days_offered text[],
    times_offered text[],
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.classes OWNER TO postgres;

--
-- Name: classes_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.classes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.classes_id_seq OWNER TO postgres;

--
-- Name: classes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.classes_id_seq OWNED BY public.classes.id;


--
-- Name: classes_in_course; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.classes_in_course (
    course_id integer NOT NULL,
    class_id integer NOT NULL,
    section_id integer,
    is_elective boolean DEFAULT false,
    elective_group_id integer,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.classes_in_course OWNER TO postgres;

--
-- Name: course_sections; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.course_sections (
    id integer NOT NULL,
    course_id integer,
    section_name character varying(255),
    credits_required integer,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP,
    is_required boolean DEFAULT true,
    classes_to_choose integer
);


ALTER TABLE public.course_sections OWNER TO postgres;

--
-- Name: course_sections_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.course_sections_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.course_sections_id_seq OWNER TO postgres;

--
-- Name: course_sections_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.course_sections_id_seq OWNED BY public.course_sections.id;


--
-- Name: courses; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.courses (
    id integer NOT NULL,
    course_name character varying(255),
    course_type character varying(50),
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.courses OWNER TO postgres;

--
-- Name: courses_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.courses_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.courses_id_seq OWNER TO postgres;

--
-- Name: courses_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.courses_id_seq OWNED BY public.courses.id;


--
-- Name: elective_groups; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.elective_groups (
    id integer NOT NULL,
    section_id integer,
    group_name character varying(255),
    required_count integer,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.elective_groups OWNER TO postgres;

--
-- Name: elective_groups_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.elective_groups_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.elective_groups_id_seq OWNER TO postgres;

--
-- Name: elective_groups_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.elective_groups_id_seq OWNED BY public.elective_groups.id;


--
-- Name: classes id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.classes ALTER COLUMN id SET DEFAULT nextval('public.classes_id_seq'::regclass);


--
-- Name: course_sections id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.course_sections ALTER COLUMN id SET DEFAULT nextval('public.course_sections_id_seq'::regclass);


--
-- Name: courses id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.courses ALTER COLUMN id SET DEFAULT nextval('public.courses_id_seq'::regclass);


--
-- Name: elective_groups id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.elective_groups ALTER COLUMN id SET DEFAULT nextval('public.elective_groups_id_seq'::regclass);


--
-- Data for Name: classes; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.classes (id, class_number, class_name, semesters_offered, credits, prerequisites, corequisites, days_offered, times_offered, created_at, updated_at) FROM stdin;
20	H 201	hello test	{Winter}	4	{7}	{}	{Thursday}	{}	2025-02-11 01:17:10.007692+00	2025-02-11 01:17:10.007692+00
21	PREQ 2	Made in Course	{Winter}	3	{6}	{}	{Thursday,Friday}	{}	2025-02-11 01:18:57.502206+00	2025-02-11 01:18:57.502206+00
7	CS 201	Web Design	{Winter}	3	{1}	{}	{Thursday,Friday}	{}	2025-02-11 01:01:20.002855+00	2025-02-11 22:36:43.587042+00
22	Working?	Working?	{Fall,Spring}	3	{6}	{18}	{Wednesday}	{}	2025-02-11 22:40:13.435514+00	2025-02-11 22:40:13.435514+00
23	Supposed to be wokring	Supposed to be owrking	{Spring}	2	{6}	{18}	{Tuesday,Friday}	{}	2025-02-11 22:49:15.163871+00	2025-02-11 22:49:28.439857+00
3	ANTH 310	Anthropology Theory Hi	{Winter}	2	{}	{}	{Thursday,Friday}	\N	2025-02-11 00:07:37.309885+00	2025-02-11 00:10:22.473089+00
4	Boyology 101	Boys	{Winter,Spring}	3	{1}	{}	{Wednesday,Friday}	\N	2025-02-11 00:14:23.984414+00	2025-02-11 00:14:44.622275+00
1	CS 101	Beginning Programming	{Spring}	3	{1}	{}	{Monday}	\N	2025-02-10 23:14:55.237107+00	2025-02-11 00:18:51.898271+00
5	PREQ 1	Prereq TEst	{Spring}	3	{5}	{}	{Tuesday,Friday}	{}	2025-02-11 00:20:49.662427+00	2025-02-11 00:56:46.561603+00
6	CS 490R	Advanced Topics in Computer Programming	{}	3	{1}	{}	{}	{}	2025-02-11 00:57:49.857752+00	2025-02-11 00:58:04.959615+00
18	AAA 111	This is a Test 2	{Summer}	3	{1}	{}	{Sunday}	{}	2025-02-11 01:11:32.099385+00	2025-02-11 01:11:32.099385+00
19	ADD 101	Added from Home SCreen	{Fall,Winter}	3	{1}	{}	{Wednesday,Saturday}	{}	2025-02-11 01:12:32.963481+00	2025-02-11 01:12:32.963481+00
\.


--
-- Data for Name: classes_in_course; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.classes_in_course (course_id, class_id, section_id, is_elective, elective_group_id, created_at, updated_at) FROM stdin;
11	1	7	f	\N	2025-02-11 00:13:10.211297+00	2025-02-11 00:13:10.211297+00
11	5	7	f	\N	2025-02-11 00:21:02.052904+00	2025-02-11 00:21:02.052904+00
11	18	7	f	\N	2025-02-11 01:11:32.099385+00	2025-02-11 01:11:32.099385+00
11	21	7	f	\N	2025-02-11 01:18:57.502206+00	2025-02-11 01:18:57.502206+00
12	7	9	f	\N	2025-02-11 22:36:32.552853+00	2025-02-11 22:36:32.552853+00
12	6	10	f	\N	2025-02-11 22:38:00.251632+00	2025-02-11 22:38:00.251632+00
11	22	7	f	\N	2025-02-11 22:44:08.380598+00	2025-02-11 22:44:08.380598+00
\.


--
-- Data for Name: course_sections; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.course_sections (id, course_id, section_name, credits_required, created_at, updated_at, is_required, classes_to_choose) FROM stdin;
7	11	Test Section	0	2025-02-11 00:10:36.497819+00	2025-02-11 00:10:36.497819+00	t	\N
9	12	Core Classes	0	2025-02-11 22:36:24.181993+00	2025-02-11 22:36:24.181993+00	t	\N
10	12	Elective Section	0	2025-02-11 22:37:37.831807+00	2025-02-11 22:37:37.831807+00	f	2
\.


--
-- Data for Name: courses; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.courses (id, course_name, course_type, created_at, updated_at) FROM stdin;
11	Computer Science	Major	2025-02-06 22:50:57.125396+00	2025-02-06 22:50:57.125396+00
12	Biology	Major	2025-02-06 22:50:57.125396+00	2025-02-06 22:50:57.125396+00
13	Boyology	minor	2025-02-11 00:13:20.969118+00	2025-02-11 00:13:20.969118+00
\.


--
-- Data for Name: elective_groups; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.elective_groups (id, section_id, group_name, required_count, created_at, updated_at) FROM stdin;
\.


--
-- Name: classes_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.classes_id_seq', 23, true);


--
-- Name: course_sections_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.course_sections_id_seq', 10, true);


--
-- Name: courses_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.courses_id_seq', 13, true);


--
-- Name: elective_groups_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.elective_groups_id_seq', 2, true);


--
-- Name: classes_in_course classes_in_course_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.classes_in_course
    ADD CONSTRAINT classes_in_course_pkey PRIMARY KEY (course_id, class_id);


--
-- Name: classes classes_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.classes
    ADD CONSTRAINT classes_pkey PRIMARY KEY (id);


--
-- Name: course_sections course_sections_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.course_sections
    ADD CONSTRAINT course_sections_pkey PRIMARY KEY (id);


--
-- Name: courses courses_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.courses
    ADD CONSTRAINT courses_pkey PRIMARY KEY (id);


--
-- Name: elective_groups elective_groups_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.elective_groups
    ADD CONSTRAINT elective_groups_pkey PRIMARY KEY (id);


--
-- Name: classes_in_course classes_in_course_class_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.classes_in_course
    ADD CONSTRAINT classes_in_course_class_id_fkey FOREIGN KEY (class_id) REFERENCES public.classes(id);


--
-- Name: classes_in_course classes_in_course_course_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.classes_in_course
    ADD CONSTRAINT classes_in_course_course_id_fkey FOREIGN KEY (course_id) REFERENCES public.courses(id);


--
-- Name: classes_in_course classes_in_course_elective_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.classes_in_course
    ADD CONSTRAINT classes_in_course_elective_group_id_fkey FOREIGN KEY (elective_group_id) REFERENCES public.elective_groups(id);


--
-- Name: classes_in_course classes_in_course_section_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.classes_in_course
    ADD CONSTRAINT classes_in_course_section_id_fkey FOREIGN KEY (section_id) REFERENCES public.course_sections(id);


--
-- Name: course_sections course_sections_course_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.course_sections
    ADD CONSTRAINT course_sections_course_id_fkey FOREIGN KEY (course_id) REFERENCES public.courses(id);


--
-- Name: elective_groups elective_groups_section_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.elective_groups
    ADD CONSTRAINT elective_groups_section_id_fkey FOREIGN KEY (section_id) REFERENCES public.course_sections(id);


--
-- PostgreSQL database dump complete
--

