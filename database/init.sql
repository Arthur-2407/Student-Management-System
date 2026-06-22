--
-- PostgreSQL database dump
--

\restrict RD43H0DfK7MI9zbxqcKGoMLkusGal2KEnUJGDEJ9XgwWX3FrZVl0B2YdTvhbY0T

-- Dumped from database version 15.18
-- Dumped by pg_dump version 15.18

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
-- Name: calculate_distance(double precision, double precision, double precision, double precision); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.calculate_distance(lat1 double precision, lon1 double precision, lat2 double precision, lon2 double precision) RETURNS double precision
    LANGUAGE plpgsql
    AS $$
DECLARE
    earth_radius DOUBLE PRECISION := 6371000; -- meters
    dlat DOUBLE PRECISION;
    dlon DOUBLE PRECISION;
    a DOUBLE PRECISION;
    c DOUBLE PRECISION;
BEGIN
    dlat = radians(lat2 - lat1);
    dlon = radians(lon2 - lon1);

    a = sin(dlat/2) * sin(dlat/2) +
        cos(radians(lat1)) * cos(radians(lat2)) *
        sin(dlon/2) * sin(dlon/2);

    c = 2 * atan2(sqrt(a), sqrt(1-a));

    RETURN earth_radius * c;
END;
$$;


ALTER FUNCTION public.calculate_distance(lat1 double precision, lon1 double precision, lat2 double precision, lon2 double precision) OWNER TO postgres;

--
-- Name: check_geo_fence(double precision, double precision); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.check_geo_fence(check_lat double precision, check_lon double precision) RETURNS TABLE(within_fence boolean, distance double precision, office_name character varying)
    LANGUAGE plpgsql
    AS $$
BEGIN
    RETURN QUERY
    SELECT
        calculate_distance(check_lat, check_lon, ol.latitude, ol.longitude) <= ol.radius_meters,
        calculate_distance(check_lat, check_lon, ol.latitude, ol.longitude),
        ol.name
    FROM office_locations ol
    WHERE ol.is_active = TRUE
    ORDER BY calculate_distance(check_lat, check_lon, ol.latitude, ol.longitude)
    LIMIT 1;
END;
$$;


ALTER FUNCTION public.check_geo_fence(check_lat double precision, check_lon double precision) OWNER TO postgres;

--
-- Name: get_leave_balance(integer, character varying, integer); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.get_leave_balance(p_student_id integer, p_leave_type character varying, p_year integer DEFAULT NULL::integer) RETURNS TABLE(leave_type character varying, total_days integer, used_days integer, carried_over integer, available_days integer)
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_year INTEGER;
    v_balance RECORD;
BEGIN
    v_year := COALESCE(p_year, EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER);
    
    SELECT lb.* INTO v_balance
    FROM leave_balance lb
    WHERE lb.student_id = p_student_id
      AND lb.leave_type = p_leave_type
      AND lb.year = v_year;
    
    IF v_balance.id IS NULL THEN
        RETURN QUERY SELECT p_leave_type::VARCHAR, 0::INTEGER, 0::INTEGER, 0::INTEGER, 0::INTEGER;
    ELSE
        RETURN QUERY SELECT 
            v_balance.leave_type,
            v_balance.total_days,
            v_balance.used_days,
            v_balance.carried_over_days,
            (v_balance.total_days + v_balance.carried_over_days - v_balance.used_days)::INTEGER as available_days;
    END IF;
END;
$$;


ALTER FUNCTION public.get_leave_balance(p_student_id integer, p_leave_type character varying, p_year integer) OWNER TO postgres;

--
-- Name: sync_admin_config_to_administrators(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.sync_admin_config_to_administrators() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_admin_id VARCHAR(50);
  v_password_hash VARCHAR(255);
BEGIN
  -- Break infinite trigger recursion loop
  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;

  SELECT student_id, password_hash INTO v_admin_id, v_password_hash
  FROM students WHERE id = NEW.admin_student_id;

  IF v_admin_id IS NOT NULL THEN
    INSERT INTO administrators (admin_id, name, email, phone, address, designation, password_hash, recovery_email, recovery_phone, created_at, updated_at)
    VALUES (v_admin_id, NEW.admin_name, NEW.admin_email, NEW.admin_phone, NEW.admin_address, NEW.admin_designation, v_password_hash, NEW.recovery_email, NEW.recovery_phone, NEW.created_at, NEW.updated_at)
    ON CONFLICT (admin_id) DO UPDATE
    SET name = EXCLUDED.name,
        email = EXCLUDED.email,
        phone = EXCLUDED.phone,
        address = EXCLUDED.address,
        designation = EXCLUDED.designation,
        recovery_email = EXCLUDED.recovery_email,
        recovery_phone = EXCLUDED.recovery_phone,
        updated_at = NOW();
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION public.sync_admin_config_to_administrators() OWNER TO postgres;

--
-- Name: sync_administrators_to_legacy(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.sync_administrators_to_legacy() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_emp_id INT;
BEGIN
  -- Break infinite trigger recursion loop
  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;

  SELECT id INTO v_emp_id FROM students WHERE student_id = NEW.admin_id;
  
  IF v_emp_id IS NULL THEN
    INSERT INTO students (student_id, first_name, last_name, email, password_hash, role, is_active)
    VALUES (NEW.admin_id, split_part(NEW.name, ' ', 1), COALESCE(split_part(NEW.name, ' ', 2), 'Admin'), NEW.email, NEW.password_hash, 'admin', TRUE)
    RETURNING id INTO v_emp_id;
  ELSE
    UPDATE students
    SET password_hash = NEW.password_hash,
        email = NEW.email,
        first_name = split_part(NEW.name, ' ', 1),
        last_name = COALESCE(split_part(NEW.name, ' ', 2), 'Admin')
    WHERE id = v_emp_id;
  END IF;

  INSERT INTO admin_configuration (admin_student_id, admin_name, admin_email, admin_phone, admin_address, admin_designation, recovery_email, recovery_phone, created_at, updated_at)
  VALUES (v_emp_id, NEW.name, NEW.email, NEW.phone, NEW.address, NEW.designation, NEW.recovery_email, NEW.recovery_phone, NEW.created_at, NEW.updated_at)
  ON CONFLICT (admin_student_id) DO UPDATE
  SET admin_name = EXCLUDED.admin_name,
      admin_email = EXCLUDED.admin_email,
      admin_phone = EXCLUDED.admin_phone,
      admin_address = EXCLUDED.admin_address,
      admin_designation = EXCLUDED.admin_designation,
      recovery_email = EXCLUDED.recovery_email,
      recovery_phone = EXCLUDED.recovery_phone,
      updated_at = NOW();

  RETURN NEW;
END;
$$;


ALTER FUNCTION public.sync_administrators_to_legacy() OWNER TO postgres;

--
-- Name: sync_audit_logs_compliance(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.sync_audit_logs_compliance() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NEW.user_id IS NOT NULL AND NEW.actor_student_id IS NULL THEN
    IF EXISTS (SELECT 1 FROM students WHERE id = NEW.user_id) THEN
      NEW.actor_student_id := NEW.user_id;
    END IF;
  ELSIF NEW.actor_student_id IS NOT NULL AND NEW.user_id IS NULL THEN
    IF EXISTS (SELECT 1 FROM students WHERE id = NEW.actor_student_id) THEN
      NEW.user_id := NEW.actor_student_id;
    END IF;
  END IF;

  IF NEW.device_id IS NOT NULL AND NEW.user_agent IS NULL THEN
    NEW.user_agent := NEW.device_id;
  ELSIF NEW.user_agent IS NOT NULL AND NEW.device_id IS NULL THEN
    NEW.device_id := NEW.user_agent;
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION public.sync_audit_logs_compliance() OWNER TO postgres;

--
-- Name: sync_student_relationship(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.sync_student_relationship() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  -- Only update students if the teacher_id is actually different
  UPDATE students
  SET teacher_id = NEW.teacher_id
  WHERE id = NEW.student_id AND (teacher_id IS DISTINCT FROM NEW.teacher_id);
  RETURN NEW;
END;
$$;


ALTER FUNCTION public.sync_student_relationship() OWNER TO postgres;

--
-- Name: sync_students_to_relationship(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.sync_students_to_relationship() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  -- 1. Sync to student_relationships
  IF NEW.teacher_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM student_relationships
      WHERE student_id = NEW.id AND teacher_id = NEW.teacher_id
    ) THEN
      INSERT INTO student_relationships (student_id, teacher_id)
      VALUES (NEW.id, NEW.teacher_id)
      ON CONFLICT (student_id) DO UPDATE
      SET teacher_id = EXCLUDED.teacher_id;
    END IF;
  ELSE
    DELETE FROM student_relationships WHERE student_id = NEW.id;
  END IF;

  -- 2. Sync to teacher_assignments
  IF NEW.teacher_id IS NOT NULL THEN
    -- Deactivate any other active assignments for this student
    UPDATE teacher_assignments
    SET is_active = FALSE, unassigned_at = NOW()
    WHERE student_id = NEW.id AND is_active = TRUE AND teacher_id != NEW.teacher_id;

    -- Insert or reactivate current assignment
    INSERT INTO teacher_assignments (teacher_id, student_id, assigned_at, is_active)
    VALUES (NEW.teacher_id, NEW.id, NOW(), TRUE)
    ON CONFLICT (teacher_id, student_id) DO UPDATE
    SET is_active = TRUE, unassigned_at = NULL, assigned_at = NOW();
  ELSE
    -- Deactivate all active assignments
    UPDATE teacher_assignments
    SET is_active = FALSE, unassigned_at = NOW()
    WHERE student_id = NEW.id AND is_active = TRUE;
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION public.sync_students_to_relationship() OWNER TO postgres;

--
-- Name: sync_leave_approved_at(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.sync_leave_approved_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NEW.approval_timestamp IS NOT NULL AND NEW.approved_at IS NULL THEN
    NEW.approved_at := NEW.approval_timestamp;
  ELSIF NEW.approved_at IS NOT NULL AND NEW.approval_timestamp IS NULL THEN
    NEW.approval_timestamp := NEW.approved_at;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION public.sync_leave_approved_at() OWNER TO postgres;

--
-- Name: sync_notifications_compliance(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.sync_notifications_compliance() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  -- Sync recipient_id and student_id
  IF NEW.recipient_id IS NOT NULL AND NEW.student_id IS NULL THEN
    IF EXISTS (SELECT 1 FROM students WHERE id = NEW.recipient_id) THEN
      NEW.student_id := NEW.recipient_id;
    END IF;
  ELSIF NEW.student_id IS NOT NULL AND NEW.recipient_id IS NULL THEN
    IF EXISTS (SELECT 1 FROM students WHERE id = NEW.student_id) THEN
      NEW.recipient_id := NEW.student_id;
    END IF;
  END IF;

  -- Sync status and is_read
  IF NEW.status = 'read' THEN
    NEW.is_read := TRUE;
  ELSIF NEW.status = 'unread' THEN
    NEW.is_read := FALSE;
  END IF;

  IF NEW.is_read = TRUE THEN
    NEW.status := 'read';
  ELSE
    NEW.status := 'unread';
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION public.sync_notifications_compliance() OWNER TO postgres;

--
-- Name: update_team_members_timestamp(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.update_team_members_timestamp() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.joined_at = COALESCE(NEW.joined_at, NOW());
    RETURN NEW;
END;
$$;


ALTER FUNCTION public.update_team_members_timestamp() OWNER TO postgres;

--
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$;


ALTER FUNCTION public.update_updated_at_column() OWNER TO postgres;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: account_recovery_audit_log; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.account_recovery_audit_log (
    id bigint NOT NULL,
    recovery_id integer NOT NULL,
    actor_id integer,
    action character varying(50) NOT NULL,
    details jsonb,
    ip_address inet,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.account_recovery_audit_log OWNER TO postgres;

--
-- Name: account_recovery_audit_log_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.account_recovery_audit_log_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.account_recovery_audit_log_id_seq OWNER TO postgres;

--
-- Name: account_recovery_audit_log_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.account_recovery_audit_log_id_seq OWNED BY public.account_recovery_audit_log.id;


--
-- Name: account_recovery_requests; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.account_recovery_requests (
    id integer NOT NULL,
    student_id integer NOT NULL,
    request_type character varying(30) NOT NULL,
    status character varying(20) DEFAULT 'pending'::character varying NOT NULL,
    requested_by integer,
    request_reason text,
    reviewed_by integer,
    reviewed_at timestamp without time zone,
    review_notes text,
    completed_at timestamp without time zone,
    completed_by integer,
    expires_at timestamp without time zone DEFAULT (now() + '48:00:00'::interval) NOT NULL,
    recovery_token_hash character varying(255),
    recovery_token_used_at timestamp without time zone,
    ip_address inet,
    device_info text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    CONSTRAINT account_recovery_requests_request_type_check CHECK (((request_type)::text = ANY ((ARRAY['password_reset'::character varying, 'face_reset'::character varying, 'full_credential_reset'::character varying])::text[]))),
    CONSTRAINT account_recovery_requests_status_check CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'approved'::character varying, 'rejected'::character varying, 'completed'::character varying, 'expired'::character varying])::text[])))
);


ALTER TABLE public.account_recovery_requests OWNER TO postgres;

--
-- Name: account_recovery_requests_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.account_recovery_requests_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.account_recovery_requests_id_seq OWNER TO postgres;

--
-- Name: account_recovery_requests_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.account_recovery_requests_id_seq OWNED BY public.account_recovery_requests.id;


--
-- Name: admin_configuration; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.admin_configuration (
    id bigint NOT NULL,
    admin_student_id integer NOT NULL,
    admin_name character varying(100),
    admin_email character varying(200),
    admin_phone character varying(50),
    admin_address text,
    admin_designation character varying(100),
    recovery_email character varying(200),
    recovery_phone character varying(50),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.admin_configuration OWNER TO postgres;

--
-- Name: admin_configuration_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.admin_configuration_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.admin_configuration_id_seq OWNER TO postgres;

--
-- Name: admin_configuration_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.admin_configuration_id_seq OWNED BY public.admin_configuration.id;


--
-- Name: administrators; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.administrators (
    id bigint NOT NULL,
    admin_id character varying(50) NOT NULL,
    name character varying(100),
    email character varying(200),
    phone character varying(50),
    address text,
    designation character varying(100),
    face_image_path text,
    face_embedding text,
    password_hash character varying(255),
    recovery_email character varying(200),
    recovery_phone character varying(50),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.administrators OWNER TO postgres;

--
-- Name: administrators_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.administrators_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.administrators_id_seq OWNER TO postgres;

--
-- Name: administrators_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.administrators_id_seq OWNED BY public.administrators.id;


--
-- Name: student_attendance; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.student_attendance (
    id integer NOT NULL,
    student_id integer NOT NULL,
    check_in_time timestamp without time zone NOT NULL,
    check_out_time timestamp without time zone,
    work_hours interval,
    location point,
    geo_fence_status boolean DEFAULT false,
    distance_from_office double precision,
    check_in_image_url text,
    check_out_image_url text,
    notes text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    deleted_at timestamp with time zone,
    idempotency_key character varying(128),
    checkout_geo_fence_status boolean,
    checkout_distance_from_office double precision
);


ALTER TABLE public.student_attendance OWNER TO postgres;

--
-- Name: student_attendance_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.student_attendance_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.student_attendance_id_seq OWNER TO postgres;

--
-- Name: student_attendance_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.student_attendance_id_seq OWNED BY public.student_attendance.id;


--
-- Name: audit_logs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.audit_logs (
    id bigint NOT NULL,
    actor_student_id integer,
    action character varying(100) NOT NULL,
    resource_type character varying(100) NOT NULL,
    resource_id text,
    ip_address inet,
    user_agent text,
    request_id text,
    details jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    user_id integer,
    old_value text,
    new_value text,
    device_id text
);


ALTER TABLE public.audit_logs OWNER TO postgres;

--
-- Name: audit_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.audit_logs_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.audit_logs_id_seq OWNER TO postgres;

--
-- Name: audit_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.audit_logs_id_seq OWNED BY public.audit_logs.id;


--
-- Name: backup_configurations; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.backup_configurations (
    id integer NOT NULL,
    schedule_type character varying(20) DEFAULT 'daily'::character varying NOT NULL,
    retention_days integer DEFAULT 30 NOT NULL,
    last_backup_time timestamp without time zone,
    last_backup_status character varying(20),
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT backup_configurations_schedule_type_check CHECK (((schedule_type)::text = ANY ((ARRAY['daily'::character varying, 'weekly'::character varying, 'monthly'::character varying])::text[])))
);


ALTER TABLE public.backup_configurations OWNER TO postgres;

--
-- Name: backup_configurations_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.backup_configurations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.backup_configurations_id_seq OWNER TO postgres;

--
-- Name: backup_configurations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.backup_configurations_id_seq OWNED BY public.backup_configurations.id;


--
-- Name: department_config; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.department_config (
    id integer NOT NULL,
    department_name character varying(100) NOT NULL,
    department_head_id integer,
    default_work_start_time time without time zone DEFAULT '09:00:00'::time without time zone,
    default_work_end_time time without time zone DEFAULT '18:00:00'::time without time zone,
    default_lunch_start time without time zone DEFAULT '12:00:00'::time without time zone,
    default_lunch_end time without time zone DEFAULT '13:00:00'::time without time zone,
    max_students integer,
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.department_config OWNER TO postgres;

--
-- Name: department_config_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.department_config_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.department_config_id_seq OWNER TO postgres;

--
-- Name: department_config_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.department_config_id_seq OWNED BY public.department_config.id;


--
-- Name: device_fingerprints; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.device_fingerprints (
    id bigint NOT NULL,
    student_id integer NOT NULL,
    fingerprint character varying(64) NOT NULL,
    ip_address inet,
    user_agent text,
    trust_score integer DEFAULT 0 NOT NULL,
    trust_level character varying(10) DEFAULT 'low'::character varying NOT NULL,
    first_seen_at timestamp with time zone DEFAULT now() NOT NULL,
    last_seen_at timestamp with time zone DEFAULT now() NOT NULL,
    login_count integer DEFAULT 1 NOT NULL,
    is_trusted boolean DEFAULT false NOT NULL,
    revoked_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT device_fingerprints_trust_level_check CHECK (((trust_level)::text = ANY ((ARRAY['high'::character varying, 'medium'::character varying, 'low'::character varying])::text[]))),
    CONSTRAINT device_fingerprints_trust_score_check CHECK (((trust_score >= 0) AND (trust_score <= 100)))
);


ALTER TABLE public.device_fingerprints OWNER TO postgres;

--
-- Name: device_fingerprints_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.device_fingerprints_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.device_fingerprints_id_seq OWNER TO postgres;

--
-- Name: device_fingerprints_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.device_fingerprints_id_seq OWNED BY public.device_fingerprints.id;


--
-- Name: student_locations; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.student_locations (
    id integer NOT NULL,
    student_id integer NOT NULL,
    name character varying(255) DEFAULT 'Work Location'::character varying NOT NULL,
    latitude double precision NOT NULL,
    longitude double precision NOT NULL,
    radius_meters integer DEFAULT 500 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.student_locations OWNER TO postgres;

--
-- Name: student_locations_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.student_locations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.student_locations_id_seq OWNER TO postgres;

--
-- Name: student_locations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.student_locations_id_seq OWNED BY public.student_locations.id;


--
-- Name: student_login_locations; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.student_login_locations (
    student_id integer NOT NULL,
    last_lat double precision NOT NULL,
    last_lng double precision NOT NULL,
    last_login_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.student_login_locations OWNER TO postgres;

--
-- Name: student_relationships; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.student_relationships (
    id bigint NOT NULL,
    student_id integer NOT NULL,
    teacher_id integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.student_relationships OWNER TO postgres;

--
-- Name: student_relationships_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.student_relationships_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.student_relationships_id_seq OWNER TO postgres;

--
-- Name: student_relationships_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.student_relationships_id_seq OWNED BY public.student_relationships.id;


--
-- Name: students; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.students (
    id integer NOT NULL,
    student_id character varying(20) NOT NULL,
    first_name character varying(100) NOT NULL,
    last_name character varying(100) NOT NULL,
    email character varying(255) NOT NULL,
    phone_number character varying(20),
    department character varying(100) NOT NULL,
    "position" character varying(100) NOT NULL,
    role character varying(20) DEFAULT 'student'::character varying NOT NULL,
    teacher_id integer,
    hire_date date NOT NULL,
    is_active boolean DEFAULT true,
    face_embedding text,
    password_hash character varying(255),
    password_changed_at timestamp without time zone,
    failed_login_count integer DEFAULT 0,
    locked_until timestamp without time zone,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    last_login_at timestamp with time zone,
    mfa_enabled boolean DEFAULT false NOT NULL,
    mfa_secret character varying(64),
    mfa_pending_secret character varying(64),
    mfa_backup_codes text,
    face_enrolled boolean DEFAULT false NOT NULL,
    face_enrolled_at timestamp with time zone,
    face_enrolled_by integer,
    password_must_change boolean DEFAULT false NOT NULL,
    deleted_at timestamp without time zone,
    deleted_by integer,
    CONSTRAINT students_role_check CHECK (((role)::text = ANY ((ARRAY['student'::character varying, 'teacher'::character varying, 'admin'::character varying])::text[])))
);


ALTER TABLE public.students OWNER TO postgres;

--
-- Name: students_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.students_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.students_id_seq OWNER TO postgres;

--
-- Name: students_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.students_id_seq OWNED BY public.students.id;


--
-- Name: face_approval_history; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.face_approval_history (
    id bigint NOT NULL,
    request_id bigint NOT NULL,
    action character varying(20) NOT NULL,
    actioned_by integer NOT NULL,
    actioned_at timestamp with time zone DEFAULT now() NOT NULL,
    notes text,
    CONSTRAINT face_approval_history_action_check CHECK (((action)::text = ANY ((ARRAY['APPROVE'::character varying, 'REJECT'::character varying])::text[])))
);


ALTER TABLE public.face_approval_history OWNER TO postgres;

--
-- Name: face_approval_history_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.face_approval_history_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.face_approval_history_id_seq OWNER TO postgres;

--
-- Name: face_approval_history_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.face_approval_history_id_seq OWNED BY public.face_approval_history.id;


--
-- Name: face_approval_requests; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.face_approval_requests (
    id bigint NOT NULL,
    request_id bigint NOT NULL,
    assigned_approver_role character varying(20) NOT NULL,
    status character varying(20) DEFAULT 'PENDING'::character varying NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT face_approval_requests_assigned_approver_role_check CHECK (((assigned_approver_role)::text = ANY ((ARRAY['admin'::character varying, 'teacher'::character varying])::text[]))),
    CONSTRAINT face_approval_requests_status_check CHECK (((status)::text = ANY ((ARRAY['PENDING'::character varying, 'APPROVED'::character varying, 'REJECTED'::character varying])::text[])))
);


ALTER TABLE public.face_approval_requests OWNER TO postgres;

--
-- Name: face_approval_requests_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.face_approval_requests_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.face_approval_requests_id_seq OWNER TO postgres;

--
-- Name: face_approval_requests_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.face_approval_requests_id_seq OWNED BY public.face_approval_requests.id;


--
-- Name: face_audit_logs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.face_audit_logs (
    id bigint NOT NULL,
    student_id integer NOT NULL,
    action character varying(20) NOT NULL,
    performed_by integer NOT NULL,
    previous_embedding_id bigint,
    new_embedding_id bigint,
    ip_address inet,
    device_info text,
    "timestamp" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT face_audit_logs_action_check CHECK (((action)::text = ANY ((ARRAY['ADD'::character varying, 'UPDATE'::character varying, 'REPLACE'::character varying, 'DELETE'::character varying])::text[])))
);


ALTER TABLE public.face_audit_logs OWNER TO postgres;

--
-- Name: face_audit_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.face_audit_logs_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.face_audit_logs_id_seq OWNER TO postgres;

--
-- Name: face_audit_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.face_audit_logs_id_seq OWNED BY public.face_audit_logs.id;


--
-- Name: face_change_requests; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.face_change_requests (
    id bigint NOT NULL,
    student_id integer NOT NULL,
    request_type character varying(20) NOT NULL,
    requested_by integer NOT NULL,
    new_face_embedding text,
    previous_face_embedding text,
    status character varying(20) DEFAULT 'PENDING'::character varying NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    CONSTRAINT face_change_requests_request_type_check CHECK (((request_type)::text = ANY ((ARRAY['ADD'::character varying, 'UPDATE'::character varying, 'REPLACE'::character varying, 'DELETE'::character varying])::text[]))),
    CONSTRAINT face_change_requests_status_check CHECK (((status)::text = ANY ((ARRAY['PENDING'::character varying, 'APPROVED'::character varying, 'REJECTED'::character varying])::text[])))
);


ALTER TABLE public.face_change_requests OWNER TO postgres;

--
-- Name: face_change_requests_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.face_change_requests_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.face_change_requests_id_seq OWNER TO postgres;

--
-- Name: face_change_requests_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.face_change_requests_id_seq OWNED BY public.face_change_requests.id;


--
-- Name: face_embeddings; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.face_embeddings (
    id bigint NOT NULL,
    student_id integer NOT NULL,
    embedding_vector text NOT NULL,
    embedding_version character varying(20) DEFAULT '1.0'::character varying NOT NULL,
    confidence_score double precision,
    model_name character varying(100) DEFAULT 'face-recognition-v1'::character varying,
    enrolled_by integer,
    enrollment_date timestamp with time zone DEFAULT now() NOT NULL,
    last_verified_at timestamp with time zone,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_embedding_not_empty CHECK (((is_active = false) OR ((embedding_vector IS NOT NULL) AND (length(embedding_vector) > 100) AND (embedding_vector <> '[]'::text) AND (embedding_vector !~~ '[0.5,%'::text))))
);


ALTER TABLE public.face_embeddings OWNER TO postgres;

--
-- Name: TABLE face_embeddings; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.face_embeddings IS 'Stores ArcFace 512-dimensional face embeddings. Migration 009 seeded a known-bad identical vector for admin and teacher (deactivated by migration 010). All active embeddings must pass chk_embedding_not_empty.';


--
-- Name: face_embeddings_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.face_embeddings_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.face_embeddings_id_seq OWNER TO postgres;

--
-- Name: face_embeddings_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.face_embeddings_id_seq OWNED BY public.face_embeddings.id;


--
-- Name: face_enrollment_logs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.face_enrollment_logs (
    id bigint NOT NULL,
    student_id integer,
    target_student_id integer,
    action character varying(30) NOT NULL,
    performed_by_role character varying(20),
    confidence_score double precision,
    embedding_version character varying(20),
    ip_address inet,
    device_info text,
    reason text,
    previous_embedding_id bigint,
    details jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT face_enrollment_logs_action_check CHECK (((action)::text = ANY ((ARRAY['ENROLL'::character varying, 'UPDATE'::character varying, 'DELETE'::character varying, 'VERIFY_SUCCESS'::character varying, 'VERIFY_FAIL'::character varying, 'ENROLLMENT_REJECTED'::character varying, 'ENROLLMENT_APPROVED'::character varying])::text[])))
);


ALTER TABLE public.face_enrollment_logs OWNER TO postgres;

--
-- Name: face_enrollment_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.face_enrollment_logs_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.face_enrollment_logs_id_seq OWNER TO postgres;

--
-- Name: face_enrollment_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.face_enrollment_logs_id_seq OWNED BY public.face_enrollment_logs.id;


--
-- Name: face_update_requests; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.face_update_requests (
    id bigint NOT NULL,
    requester_id integer NOT NULL,
    approver_id integer,
    status character varying(20) DEFAULT 'pending'::character varying NOT NULL,
    request_type character varying(20) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    approved_at timestamp with time zone
);


ALTER TABLE public.face_update_requests OWNER TO postgres;

--
-- Name: face_update_requests_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.face_update_requests_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.face_update_requests_id_seq OWNER TO postgres;

--
-- Name: face_update_requests_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.face_update_requests_id_seq OWNED BY public.face_update_requests.id;


--
-- Name: impossible_travel_events; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.impossible_travel_events (
    id bigint NOT NULL,
    student_id integer,
    student_id_str character varying(40),
    from_lat double precision NOT NULL,
    from_lng double precision NOT NULL,
    to_lat double precision NOT NULL,
    to_lng double precision NOT NULL,
    distance_km double precision NOT NULL,
    time_diff_minutes double precision NOT NULL,
    required_speed_kmh double precision NOT NULL,
    severity character varying(10) NOT NULL,
    ip_address inet,
    device_info text,
    resolved boolean DEFAULT false NOT NULL,
    resolved_at timestamp with time zone,
    resolved_by integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT impossible_travel_events_severity_check CHECK (((severity)::text = ANY ((ARRAY['high'::character varying, 'critical'::character varying])::text[])))
);


ALTER TABLE public.impossible_travel_events OWNER TO postgres;

--
-- Name: impossible_travel_events_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.impossible_travel_events_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.impossible_travel_events_id_seq OWNER TO postgres;

--
-- Name: impossible_travel_events_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.impossible_travel_events_id_seq OWNED BY public.impossible_travel_events.id;


--
-- Name: leave_approval_history; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.leave_approval_history (
    id bigint NOT NULL,
    leave_request_id integer NOT NULL,
    action character varying(20) NOT NULL,
    actor_student_id integer,
    actor_role character varying(20),
    previous_status character varying(20),
    new_status character varying(20) NOT NULL,
    reason text,
    ip_address inet,
    user_agent text,
    details jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT leave_approval_history_action_check CHECK (((action)::text = ANY ((ARRAY['submit'::character varying, 'approve'::character varying, 'reject'::character varying, 'cancel'::character varying, 'override'::character varying])::text[])))
);


ALTER TABLE public.leave_approval_history OWNER TO postgres;

--
-- Name: leave_approval_history_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.leave_approval_history_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.leave_approval_history_id_seq OWNER TO postgres;

--
-- Name: leave_approval_history_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.leave_approval_history_id_seq OWNED BY public.leave_approval_history.id;


--
-- Name: leave_balance; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.leave_balance (
    id integer NOT NULL,
    student_id integer NOT NULL,
    leave_type character varying(50) NOT NULL,
    year integer NOT NULL,
    total_days integer DEFAULT 0 NOT NULL,
    used_days integer DEFAULT 0 NOT NULL,
    carried_over_days integer DEFAULT 0 NOT NULL,
    last_updated timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.leave_balance OWNER TO postgres;

--
-- Name: leave_balance_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.leave_balance_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.leave_balance_id_seq OWNER TO postgres;

--
-- Name: leave_balance_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.leave_balance_id_seq OWNED BY public.leave_balance.id;


--
-- Name: leave_policy; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.leave_policy (
    id integer NOT NULL,
    leave_type character varying(50) NOT NULL,
    annual_days_allowed integer DEFAULT 20 NOT NULL,
    carry_over_days integer DEFAULT 5,
    requires_approval boolean DEFAULT true,
    approval_required_after_days integer DEFAULT 2,
    description text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT leave_policy_leave_type_check CHECK (((leave_type)::text = ANY ((ARRAY['vacation'::character varying, 'sick'::character varying, 'personal'::character varying, 'maternity'::character varying, 'paternity'::character varying])::text[])))
);


ALTER TABLE public.leave_policy OWNER TO postgres;

--
-- Name: leave_policy_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.leave_policy_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.leave_policy_id_seq OWNER TO postgres;

--
-- Name: leave_policy_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.leave_policy_id_seq OWNED BY public.leave_policy.id;


--
-- Name: leave_requests; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.leave_requests (
    id integer NOT NULL,
    student_id integer NOT NULL,
    teacher_id integer,
    leave_type character varying(50) NOT NULL,
    start_date date NOT NULL,
    end_date date NOT NULL,
    total_days integer NOT NULL,
    reason text NOT NULL,
    status character varying(20) DEFAULT 'pending'::character varying,
    approval_date timestamp without time zone,
    rejection_reason text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    approved_by integer,
    approval_notes text,
    deleted_at timestamp with time zone,
    approver_id integer,
    approval_timestamp timestamp with time zone,
    approved_at timestamp with time zone,
    attachment_data text,
    attachment_name text,
    CONSTRAINT leave_requests_leave_type_check CHECK (((leave_type)::text = ANY ((ARRAY['vacation'::character varying, 'sick'::character varying, 'personal'::character varying, 'maternity'::character varying, 'paternity'::character varying])::text[]))),
    CONSTRAINT leave_requests_status_check CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'approved'::character varying, 'rejected'::character varying, 'cancelled'::character varying])::text[])))
);


ALTER TABLE public.leave_requests OWNER TO postgres;

--
-- Name: leave_requests_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.leave_requests_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.leave_requests_id_seq OWNER TO postgres;

--
-- Name: leave_requests_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.leave_requests_id_seq OWNED BY public.leave_requests.id;


--
-- Name: location_timing_requests; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.location_timing_requests (
    id integer NOT NULL,
    student_id integer NOT NULL,
    request_type character varying(20) NOT NULL,
    requested_location_name character varying(150),
    requested_latitude double precision,
    requested_longitude double precision,
    requested_radius_meters integer,
    requested_work_start_time time without time zone,
    requested_work_end_time time without time zone,
    requested_is_temporary boolean DEFAULT false,
    requested_start_date date,
    requested_end_date date,
    status character varying(20) DEFAULT 'pending'::character varying,
    admin_notes text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT location_timing_requests_request_type_check CHECK (((request_type)::text = ANY ((ARRAY['location'::character varying, 'timing'::character varying, 'both'::character varying])::text[]))),
    CONSTRAINT location_timing_requests_status_check CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'approved'::character varying, 'rejected'::character varying])::text[])))
);


ALTER TABLE public.location_timing_requests OWNER TO postgres;

--
-- Name: location_timing_requests_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.location_timing_requests_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.location_timing_requests_id_seq OWNER TO postgres;

--
-- Name: location_timing_requests_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.location_timing_requests_id_seq OWNED BY public.location_timing_requests.id;


--
-- Name: login_logs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.login_logs (
    id integer NOT NULL,
    student_id integer NOT NULL,
    success boolean NOT NULL,
    spoof_detected boolean DEFAULT false,
    spoof_confidence double precision,
    challenge_passed boolean,
    face_embedding text,
    ip_address inet,
    device_info text,
    location jsonb,
    error_details text,
    "timestamp" timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    deleted_at timestamp with time zone
);


ALTER TABLE public.login_logs OWNER TO postgres;

--
-- Name: login_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.login_logs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.login_logs_id_seq OWNER TO postgres;

--
-- Name: login_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.login_logs_id_seq OWNED BY public.login_logs.id;


--
-- Name: notifications; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.notifications (
    id bigint NOT NULL,
    student_id integer NOT NULL,
    type character varying(50) DEFAULT 'system'::character varying NOT NULL,
    title character varying(200) NOT NULL,
    message text NOT NULL,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    is_read boolean DEFAULT false NOT NULL,
    read_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    recipient_id integer,
    sender_id integer,
    status character varying(20) DEFAULT 'unread'::character varying
);


ALTER TABLE public.notifications OWNER TO postgres;

--
-- Name: notifications_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.notifications_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.notifications_id_seq OWNER TO postgres;

--
-- Name: notifications_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.notifications_id_seq OWNED BY public.notifications.id;


--
-- Name: office_locations; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.office_locations (
    id integer NOT NULL,
    name character varying(100) NOT NULL,
    latitude double precision NOT NULL,
    longitude double precision NOT NULL,
    radius_meters integer DEFAULT 100 NOT NULL,
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    work_start_time time without time zone DEFAULT '09:00:00'::time without time zone,
    work_end_time time without time zone DEFAULT '18:00:00'::time without time zone,
    lunch_start_time time without time zone DEFAULT '12:00:00'::time without time zone,
    lunch_end_time time without time zone DEFAULT '13:00:00'::time without time zone,
    address text,
    timezone character varying(50) DEFAULT 'UTC'::character varying,
    created_by integer
);


ALTER TABLE public.office_locations OWNER TO postgres;

--
-- Name: office_locations_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.office_locations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.office_locations_id_seq OWNER TO postgres;

--
-- Name: office_locations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.office_locations_id_seq OWNED BY public.office_locations.id;


--
-- Name: password_reset_requests; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.password_reset_requests (
    id bigint NOT NULL,
    requester_id integer NOT NULL,
    approver_id integer,
    status character varying(20) DEFAULT 'pending'::character varying NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    approved_at timestamp with time zone
);


ALTER TABLE public.password_reset_requests OWNER TO postgres;

--
-- Name: password_reset_requests_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.password_reset_requests_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.password_reset_requests_id_seq OWNER TO postgres;

--
-- Name: password_reset_requests_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.password_reset_requests_id_seq OWNED BY public.password_reset_requests.id;


--
-- Name: refresh_tokens; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.refresh_tokens (
    id uuid NOT NULL,
    student_id integer NOT NULL,
    token_family uuid NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    revoked_at timestamp with time zone,
    replaced_by uuid,
    ip_address inet,
    device_info text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.refresh_tokens OWNER TO postgres;

--
-- Name: role_assignments; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.role_assignments (
    id integer NOT NULL,
    student_id integer NOT NULL,
    role character varying(50) NOT NULL,
    assigned_by integer,
    assigned_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    revoked_at timestamp without time zone,
    is_active boolean DEFAULT true,
    CONSTRAINT role_assignments_role_check CHECK (((role)::text = ANY ((ARRAY['student'::character varying, 'teacher'::character varying, 'admin'::character varying])::text[])))
);


ALTER TABLE public.role_assignments OWNER TO postgres;

--
-- Name: role_assignments_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.role_assignments_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.role_assignments_id_seq OWNER TO postgres;

--
-- Name: role_assignments_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.role_assignments_id_seq OWNED BY public.role_assignments.id;


--
-- Name: role_permissions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.role_permissions (
    id bigint NOT NULL,
    role character varying(20) NOT NULL,
    permission character varying(100) NOT NULL,
    granted boolean DEFAULT true NOT NULL,
    description text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT role_permissions_role_check CHECK (((role)::text = ANY ((ARRAY['admin'::character varying, 'teacher'::character varying, 'student'::character varying])::text[])))
);


ALTER TABLE public.role_permissions OWNER TO postgres;

--
-- Name: role_permissions_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.role_permissions_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.role_permissions_id_seq OWNER TO postgres;

--
-- Name: role_permissions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.role_permissions_id_seq OWNED BY public.role_permissions.id;


--
-- Name: schema_migrations; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.schema_migrations (
    id character varying(255) NOT NULL,
    name character varying(255) NOT NULL,
    checksum character varying(64) NOT NULL,
    applied_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.schema_migrations OWNER TO postgres;

--
-- Name: security_events; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.security_events (
    id integer NOT NULL,
    student_id integer,
    event_type character varying(50) NOT NULL,
    "timestamp" timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    ip_address inet,
    device_info text,
    details text,
    severity character varying(10) DEFAULT 'medium'::character varying,
    deleted_at timestamp with time zone,
    CONSTRAINT security_events_event_type_check CHECK (((event_type)::text = ANY ((ARRAY['LOGIN_SUCCESS'::character varying, 'LOGIN_FAILED'::character varying, 'LOGIN_ATTEMPT'::character varying, 'LOGIN_ERROR'::character varying, 'ACCOUNT_LOCKED'::character varying, 'ACCOUNT_UNLOCKED'::character varying, 'ACCOUNT_CREATED'::character varying, 'ACCOUNT_DEACTIVATED'::character varying, 'TOKEN_REFRESH'::character varying, 'TOKEN_REVOKED'::character varying, 'SESSION_REVOKED'::character varying, 'SPOOF_ATTEMPT'::character varying, 'FACE_MISMATCH'::character varying, 'FACE_REGISTERED'::character varying, 'FACE_REGISTRATION_ERROR'::character varying, 'FACE_ENROLLMENT_UPDATED'::character varying, 'FACE_ENROLLMENT_FAILED'::character varying, 'GEOFENCE_VIOLATION'::character varying, 'IMPOSSIBLE_TRAVEL'::character varying, 'SUSPICIOUS_DEVICE'::character varying, 'DEVICE_REGISTERED'::character varying, 'MULTIPLE_LOGIN_ATTEMPTS'::character varying, 'RATE_LIMIT_EXCEEDED'::character varying, 'LOGIN_ERROR'::character varying, 'SECURITY_ALERT'::character varying, 'PIPELINE_ERROR'::character varying, 'SYSTEM_ERROR'::character varying, 'ADMIN_ACTION'::character varying, 'PERMISSION_DENIED'::character varying, 'PRIVILEGE_ESCALATION_ATTEMPT'::character varying, 'ACCOUNT_RECOVERY_REQUESTED'::character varying, 'ACCOUNT_RECOVERY_APPROVED'::character varying, 'ACCOUNT_RECOVERY_REJECTED'::character varying])::text[]))),
    CONSTRAINT security_events_severity_check CHECK (((severity)::text = ANY ((ARRAY['low'::character varying, 'medium'::character varying, 'high'::character varying, 'critical'::character varying])::text[])))
);


ALTER TABLE public.security_events OWNER TO postgres;

--
-- Name: security_events_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.security_events_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.security_events_id_seq OWNER TO postgres;

--
-- Name: security_events_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.security_events_id_seq OWNED BY public.security_events.id;


--
-- Name: teacher_assignments; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.teacher_assignments (
    id integer NOT NULL,
    teacher_id integer NOT NULL,
    student_id integer NOT NULL,
    department character varying(100),
    assigned_by integer,
    assigned_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    is_active boolean DEFAULT true,
    unassigned_at timestamp with time zone,
    unassigned_by integer
);


ALTER TABLE public.teacher_assignments OWNER TO postgres;

--
-- Name: teacher_assignments_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.teacher_assignments_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.teacher_assignments_id_seq OWNER TO postgres;

--
-- Name: teacher_assignments_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.teacher_assignments_id_seq OWNED BY public.teacher_assignments.id;


--
-- Name: system_logs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.system_logs (
    id integer NOT NULL,
    service_name character varying(50) NOT NULL,
    log_level character varying(10) NOT NULL,
    message text NOT NULL,
    "timestamp" timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    metadata jsonb,
    CONSTRAINT system_logs_log_level_check CHECK (((log_level)::text = ANY ((ARRAY['debug'::character varying, 'info'::character varying, 'warn'::character varying, 'error'::character varying, 'fatal'::character varying])::text[])))
);


ALTER TABLE public.system_logs OWNER TO postgres;

--
-- Name: system_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.system_logs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.system_logs_id_seq OWNER TO postgres;

--
-- Name: system_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.system_logs_id_seq OWNED BY public.system_logs.id;


--
-- Name: team_config; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.team_config (
    id integer NOT NULL,
    team_name character varying(100) NOT NULL,
    team_lead_id integer,
    department character varying(100) NOT NULL,
    description text,
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.team_config OWNER TO postgres;

--
-- Name: team_config_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.team_config_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.team_config_id_seq OWNER TO postgres;

--
-- Name: team_config_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.team_config_id_seq OWNED BY public.team_config.id;


--
-- Name: team_members; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.team_members (
    id integer NOT NULL,
    team_id integer NOT NULL,
    student_id integer NOT NULL,
    role character varying(50) DEFAULT 'member'::character varying,
    joined_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    left_at timestamp without time zone,
    is_active boolean DEFAULT true
);


ALTER TABLE public.team_members OWNER TO postgres;

--
-- Name: team_members_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.team_members_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.team_members_id_seq OWNER TO postgres;

--
-- Name: team_members_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.team_members_id_seq OWNED BY public.team_members.id;


--
-- Name: student_reports; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.student_reports (
    id integer NOT NULL,
    student_id integer NOT NULL,
    teacher_id integer,
    report_date date NOT NULL,
    title character varying(200) NOT NULL,
    description text NOT NULL,
    image_urls text[],
    status character varying(20) DEFAULT 'submitted'::character varying,
    feedback text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    location jsonb,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    approved_by integer,
    approval_date timestamp without time zone,
    deleted_at timestamp with time zone,
    CONSTRAINT student_reports_status_check CHECK (((status)::text = ANY ((ARRAY['submitted'::character varying, 'reviewed'::character varying, 'approved'::character varying])::text[])))
);


ALTER TABLE public.student_reports OWNER TO postgres;

--
-- Name: student_reports_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.student_reports_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.student_reports_id_seq OWNER TO postgres;

--
-- Name: student_reports_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.student_reports_id_seq OWNED BY public.student_reports.id;


--
-- Name: work_timings; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.work_timings (
    id integer NOT NULL,
    student_id integer,
    department character varying(100),
    work_start_time time without time zone DEFAULT '09:00:00'::time without time zone NOT NULL,
    work_end_time time without time zone DEFAULT '18:00:00'::time without time zone NOT NULL,
    lunch_start_time time without time zone DEFAULT '12:00:00'::time without time zone,
    lunch_end_time time without time zone DEFAULT '13:00:00'::time without time zone,
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    overtime_start_time time without time zone,
    overtime_end_time time without time zone,
    timezone character varying(50) DEFAULT 'UTC'::character varying,
    is_temporary boolean DEFAULT false,
    start_date date,
    end_date date
);


ALTER TABLE public.work_timings OWNER TO postgres;

--
-- Name: work_timings_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.work_timings_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.work_timings_id_seq OWNER TO postgres;

--
-- Name: work_timings_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.work_timings_id_seq OWNED BY public.work_timings.id;


--
-- Name: account_recovery_audit_log id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.account_recovery_audit_log ALTER COLUMN id SET DEFAULT nextval('public.account_recovery_audit_log_id_seq'::regclass);


--
-- Name: account_recovery_requests id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.account_recovery_requests ALTER COLUMN id SET DEFAULT nextval('public.account_recovery_requests_id_seq'::regclass);


--
-- Name: admin_configuration id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.admin_configuration ALTER COLUMN id SET DEFAULT nextval('public.admin_configuration_id_seq'::regclass);


--
-- Name: administrators id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.administrators ALTER COLUMN id SET DEFAULT nextval('public.administrators_id_seq'::regclass);


--
-- Name: student_attendance id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.student_attendance ALTER COLUMN id SET DEFAULT nextval('public.student_attendance_id_seq'::regclass);


--
-- Name: audit_logs id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.audit_logs ALTER COLUMN id SET DEFAULT nextval('public.audit_logs_id_seq'::regclass);


--
-- Name: backup_configurations id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.backup_configurations ALTER COLUMN id SET DEFAULT nextval('public.backup_configurations_id_seq'::regclass);


--
-- Name: department_config id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.department_config ALTER COLUMN id SET DEFAULT nextval('public.department_config_id_seq'::regclass);


--
-- Name: device_fingerprints id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.device_fingerprints ALTER COLUMN id SET DEFAULT nextval('public.device_fingerprints_id_seq'::regclass);


--
-- Name: student_locations id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.student_locations ALTER COLUMN id SET DEFAULT nextval('public.student_locations_id_seq'::regclass);


--
-- Name: student_relationships id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.student_relationships ALTER COLUMN id SET DEFAULT nextval('public.student_relationships_id_seq'::regclass);


--
-- Name: students id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.students ALTER COLUMN id SET DEFAULT nextval('public.students_id_seq'::regclass);


--
-- Name: face_approval_history id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.face_approval_history ALTER COLUMN id SET DEFAULT nextval('public.face_approval_history_id_seq'::regclass);


--
-- Name: face_approval_requests id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.face_approval_requests ALTER COLUMN id SET DEFAULT nextval('public.face_approval_requests_id_seq'::regclass);


--
-- Name: face_audit_logs id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.face_audit_logs ALTER COLUMN id SET DEFAULT nextval('public.face_audit_logs_id_seq'::regclass);


--
-- Name: face_change_requests id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.face_change_requests ALTER COLUMN id SET DEFAULT nextval('public.face_change_requests_id_seq'::regclass);


--
-- Name: face_embeddings id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.face_embeddings ALTER COLUMN id SET DEFAULT nextval('public.face_embeddings_id_seq'::regclass);


--
-- Name: face_enrollment_logs id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.face_enrollment_logs ALTER COLUMN id SET DEFAULT nextval('public.face_enrollment_logs_id_seq'::regclass);


--
-- Name: face_update_requests id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.face_update_requests ALTER COLUMN id SET DEFAULT nextval('public.face_update_requests_id_seq'::regclass);


--
-- Name: impossible_travel_events id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.impossible_travel_events ALTER COLUMN id SET DEFAULT nextval('public.impossible_travel_events_id_seq'::regclass);


--
-- Name: leave_approval_history id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.leave_approval_history ALTER COLUMN id SET DEFAULT nextval('public.leave_approval_history_id_seq'::regclass);


--
-- Name: leave_balance id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.leave_balance ALTER COLUMN id SET DEFAULT nextval('public.leave_balance_id_seq'::regclass);


--
-- Name: leave_policy id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.leave_policy ALTER COLUMN id SET DEFAULT nextval('public.leave_policy_id_seq'::regclass);


--
-- Name: leave_requests id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.leave_requests ALTER COLUMN id SET DEFAULT nextval('public.leave_requests_id_seq'::regclass);


--
-- Name: location_timing_requests id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.location_timing_requests ALTER COLUMN id SET DEFAULT nextval('public.location_timing_requests_id_seq'::regclass);


--
-- Name: login_logs id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.login_logs ALTER COLUMN id SET DEFAULT nextval('public.login_logs_id_seq'::regclass);


--
-- Name: notifications id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.notifications ALTER COLUMN id SET DEFAULT nextval('public.notifications_id_seq'::regclass);


--
-- Name: office_locations id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.office_locations ALTER COLUMN id SET DEFAULT nextval('public.office_locations_id_seq'::regclass);


--
-- Name: password_reset_requests id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.password_reset_requests ALTER COLUMN id SET DEFAULT nextval('public.password_reset_requests_id_seq'::regclass);


--
-- Name: role_assignments id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.role_assignments ALTER COLUMN id SET DEFAULT nextval('public.role_assignments_id_seq'::regclass);


--
-- Name: role_permissions id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.role_permissions ALTER COLUMN id SET DEFAULT nextval('public.role_permissions_id_seq'::regclass);


--
-- Name: security_events id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.security_events ALTER COLUMN id SET DEFAULT nextval('public.security_events_id_seq'::regclass);


--
-- Name: teacher_assignments id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.teacher_assignments ALTER COLUMN id SET DEFAULT nextval('public.teacher_assignments_id_seq'::regclass);


--
-- Name: system_logs id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.system_logs ALTER COLUMN id SET DEFAULT nextval('public.system_logs_id_seq'::regclass);


--
-- Name: team_config id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.team_config ALTER COLUMN id SET DEFAULT nextval('public.team_config_id_seq'::regclass);


--
-- Name: team_members id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.team_members ALTER COLUMN id SET DEFAULT nextval('public.team_members_id_seq'::regclass);


--
-- Name: student_reports id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.student_reports ALTER COLUMN id SET DEFAULT nextval('public.student_reports_id_seq'::regclass);


--
-- Name: work_timings id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.work_timings ALTER COLUMN id SET DEFAULT nextval('public.work_timings_id_seq'::regclass);


--
-- Name: account_recovery_audit_log account_recovery_audit_log_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.account_recovery_audit_log
    ADD CONSTRAINT account_recovery_audit_log_pkey PRIMARY KEY (id);


--
-- Name: account_recovery_requests account_recovery_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.account_recovery_requests
    ADD CONSTRAINT account_recovery_requests_pkey PRIMARY KEY (id);


--
-- Name: admin_configuration admin_configuration_admin_student_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.admin_configuration
    ADD CONSTRAINT admin_configuration_admin_student_id_key UNIQUE (admin_student_id);


--
-- Name: admin_configuration admin_configuration_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.admin_configuration
    ADD CONSTRAINT admin_configuration_pkey PRIMARY KEY (id);


--
-- Name: administrators administrators_admin_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.administrators
    ADD CONSTRAINT administrators_admin_id_key UNIQUE (admin_id);


--
-- Name: administrators administrators_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.administrators
    ADD CONSTRAINT administrators_pkey PRIMARY KEY (id);


--
-- Name: student_attendance student_attendance_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.student_attendance
    ADD CONSTRAINT student_attendance_pkey PRIMARY KEY (id);


--
-- Name: audit_logs audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_pkey PRIMARY KEY (id);


--
-- Name: backup_configurations backup_configurations_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.backup_configurations
    ADD CONSTRAINT backup_configurations_pkey PRIMARY KEY (id);


--
-- Name: department_config department_config_department_name_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.department_config
    ADD CONSTRAINT department_config_department_name_key UNIQUE (department_name);


--
-- Name: department_config department_config_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.department_config
    ADD CONSTRAINT department_config_pkey PRIMARY KEY (id);


--
-- Name: device_fingerprints device_fingerprints_student_id_fingerprint_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.device_fingerprints
    ADD CONSTRAINT device_fingerprints_student_id_fingerprint_key UNIQUE (student_id, fingerprint);


--
-- Name: device_fingerprints device_fingerprints_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.device_fingerprints
    ADD CONSTRAINT device_fingerprints_pkey PRIMARY KEY (id);


--
-- Name: student_locations student_locations_student_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.student_locations
    ADD CONSTRAINT student_locations_student_id_key UNIQUE (student_id);


--
-- Name: student_locations student_locations_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.student_locations
    ADD CONSTRAINT student_locations_pkey PRIMARY KEY (id);


--
-- Name: student_login_locations student_login_locations_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.student_login_locations
    ADD CONSTRAINT student_login_locations_pkey PRIMARY KEY (student_id);


--
-- Name: student_relationships student_relationships_student_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.student_relationships
    ADD CONSTRAINT student_relationships_student_id_key UNIQUE (student_id);


--
-- Name: student_relationships student_relationships_student_id_teacher_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.student_relationships
    ADD CONSTRAINT student_relationships_student_id_teacher_id_key UNIQUE (student_id, teacher_id);


--
-- Name: student_relationships student_relationships_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.student_relationships
    ADD CONSTRAINT student_relationships_pkey PRIMARY KEY (id);


--
-- Name: students students_email_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.students
    ADD CONSTRAINT students_email_key UNIQUE (email);


--
-- Name: students students_student_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.students
    ADD CONSTRAINT students_student_id_key UNIQUE (student_id);


--
-- Name: students students_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.students
    ADD CONSTRAINT students_pkey PRIMARY KEY (id);


--
-- Name: face_approval_history face_approval_history_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.face_approval_history
    ADD CONSTRAINT face_approval_history_pkey PRIMARY KEY (id);


--
-- Name: face_approval_requests face_approval_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.face_approval_requests
    ADD CONSTRAINT face_approval_requests_pkey PRIMARY KEY (id);


--
-- Name: face_audit_logs face_audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.face_audit_logs
    ADD CONSTRAINT face_audit_logs_pkey PRIMARY KEY (id);


--
-- Name: face_change_requests face_change_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.face_change_requests
    ADD CONSTRAINT face_change_requests_pkey PRIMARY KEY (id);


--
-- Name: face_embeddings face_embeddings_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.face_embeddings
    ADD CONSTRAINT face_embeddings_pkey PRIMARY KEY (id);


--
-- Name: face_enrollment_logs face_enrollment_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.face_enrollment_logs
    ADD CONSTRAINT face_enrollment_logs_pkey PRIMARY KEY (id);


--
-- Name: face_update_requests face_update_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.face_update_requests
    ADD CONSTRAINT face_update_requests_pkey PRIMARY KEY (id);


--
-- Name: impossible_travel_events impossible_travel_events_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.impossible_travel_events
    ADD CONSTRAINT impossible_travel_events_pkey PRIMARY KEY (id);


--
-- Name: leave_approval_history leave_approval_history_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.leave_approval_history
    ADD CONSTRAINT leave_approval_history_pkey PRIMARY KEY (id);


--
-- Name: leave_balance leave_balance_student_id_leave_type_year_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.leave_balance
    ADD CONSTRAINT leave_balance_student_id_leave_type_year_key UNIQUE (student_id, leave_type, year);


--
-- Name: leave_balance leave_balance_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.leave_balance
    ADD CONSTRAINT leave_balance_pkey PRIMARY KEY (id);


--
-- Name: leave_policy leave_policy_leave_type_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.leave_policy
    ADD CONSTRAINT leave_policy_leave_type_key UNIQUE (leave_type);


--
-- Name: leave_policy leave_policy_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.leave_policy
    ADD CONSTRAINT leave_policy_pkey PRIMARY KEY (id);


--
-- Name: leave_requests leave_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.leave_requests
    ADD CONSTRAINT leave_requests_pkey PRIMARY KEY (id);


--
-- Name: location_timing_requests location_timing_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.location_timing_requests
    ADD CONSTRAINT location_timing_requests_pkey PRIMARY KEY (id);


--
-- Name: login_logs login_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.login_logs
    ADD CONSTRAINT login_logs_pkey PRIMARY KEY (id);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- Name: office_locations office_locations_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.office_locations
    ADD CONSTRAINT office_locations_pkey PRIMARY KEY (id);


--
-- Name: password_reset_requests password_reset_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.password_reset_requests
    ADD CONSTRAINT password_reset_requests_pkey PRIMARY KEY (id);


--
-- Name: refresh_tokens refresh_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.refresh_tokens
    ADD CONSTRAINT refresh_tokens_pkey PRIMARY KEY (id);


--
-- Name: role_assignments role_assignments_student_id_role_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.role_assignments
    ADD CONSTRAINT role_assignments_student_id_role_key UNIQUE (student_id, role);


--
-- Name: role_assignments role_assignments_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.role_assignments
    ADD CONSTRAINT role_assignments_pkey PRIMARY KEY (id);


--
-- Name: role_permissions role_permissions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.role_permissions
    ADD CONSTRAINT role_permissions_pkey PRIMARY KEY (id);


--
-- Name: role_permissions role_permissions_role_permission_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.role_permissions
    ADD CONSTRAINT role_permissions_role_permission_key UNIQUE (role, permission);


--
-- Name: schema_migrations schema_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.schema_migrations
    ADD CONSTRAINT schema_migrations_pkey PRIMARY KEY (id);


--
-- Name: security_events security_events_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.security_events
    ADD CONSTRAINT security_events_pkey PRIMARY KEY (id);


--
-- Name: teacher_assignments teacher_assignments_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.teacher_assignments
    ADD CONSTRAINT teacher_assignments_pkey PRIMARY KEY (id);


--
-- Name: teacher_assignments teacher_assignments_teacher_id_student_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.teacher_assignments
    ADD CONSTRAINT teacher_assignments_teacher_id_student_id_key UNIQUE (teacher_id, student_id);


--
-- Name: system_logs system_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.system_logs
    ADD CONSTRAINT system_logs_pkey PRIMARY KEY (id);


--
-- Name: team_config team_config_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.team_config
    ADD CONSTRAINT team_config_pkey PRIMARY KEY (id);


--
-- Name: team_members team_members_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.team_members
    ADD CONSTRAINT team_members_pkey PRIMARY KEY (id);


--
-- Name: team_members team_members_team_id_student_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.team_members
    ADD CONSTRAINT team_members_team_id_student_id_key UNIQUE (team_id, student_id);


--
-- Name: student_reports student_reports_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.student_reports
    ADD CONSTRAINT student_reports_pkey PRIMARY KEY (id);


--
-- Name: work_timings work_timings_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.work_timings
    ADD CONSTRAINT work_timings_pkey PRIMARY KEY (id);


--
-- Name: idx_admin_configuration_student; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_admin_configuration_student ON public.admin_configuration USING btree (admin_student_id);


--
-- Name: idx_attendance_date; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_attendance_date ON public.student_attendance USING btree (check_in_time);


--
-- Name: idx_attendance_student; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_attendance_student ON public.student_attendance USING btree (student_id);


--
-- Name: idx_attendance_student_date; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_attendance_student_date ON public.student_attendance USING btree (student_id, check_in_time);


--
-- Name: idx_attendance_student_time; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_attendance_student_time ON public.student_attendance USING btree (student_id, check_in_time DESC);


--
-- Name: idx_attendance_geo_fence; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_attendance_geo_fence ON public.student_attendance USING btree (geo_fence_status);


--
-- Name: idx_attendance_not_deleted; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_attendance_not_deleted ON public.student_attendance USING btree (student_id, check_in_time DESC) WHERE (deleted_at IS NULL);


--
-- Name: idx_audit_logs_action; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_audit_logs_action ON public.audit_logs USING btree (action);


--
-- Name: idx_audit_logs_action_created; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_audit_logs_action_created ON public.audit_logs USING btree (action, created_at DESC);


--
-- Name: idx_audit_logs_actor; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_audit_logs_actor ON public.audit_logs USING btree (actor_student_id);


--
-- Name: idx_audit_logs_actor_created; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_audit_logs_actor_created ON public.audit_logs USING btree (actor_student_id, created_at DESC);


--
-- Name: idx_audit_logs_created; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_audit_logs_created ON public.audit_logs USING btree (created_at);


--
-- Name: idx_audit_logs_not_deleted; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_audit_logs_not_deleted ON public.audit_logs USING btree (created_at DESC) WHERE (deleted_at IS NULL);


--
-- Name: idx_audit_logs_resource; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_audit_logs_resource ON public.audit_logs USING btree (resource_type, resource_id);


--
-- Name: idx_department_config_head; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_department_config_head ON public.department_config USING btree (department_head_id);


--
-- Name: idx_department_config_name; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_department_config_name ON public.department_config USING btree (department_name);


--
-- Name: idx_device_fingerprints_active; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_device_fingerprints_active ON public.device_fingerprints USING btree (student_id) WHERE (revoked_at IS NULL);


--
-- Name: idx_device_fingerprints_student; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_device_fingerprints_student ON public.device_fingerprints USING btree (student_id);


--
-- Name: idx_device_fingerprints_lookup; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_device_fingerprints_lookup ON public.device_fingerprints USING btree (student_id, fingerprint);


--
-- Name: idx_students_active_role; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_students_active_role ON public.students USING btree (is_active, role);


--
-- Name: idx_students_department; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_students_department ON public.students USING btree (department);


--
-- Name: idx_students_student_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_students_student_id ON public.students USING btree (student_id);


--
-- Name: idx_students_locked_until; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_students_locked_until ON public.students USING btree (locked_until);


--
-- Name: idx_students_teacher; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_students_teacher ON public.students USING btree (teacher_id);


--
-- Name: idx_face_approval_hist_request; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_face_approval_hist_request ON public.face_approval_history USING btree (request_id);


--
-- Name: idx_face_approval_requests_request; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_face_approval_requests_request ON public.face_approval_requests USING btree (request_id);


--
-- Name: idx_face_approval_requests_role; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_face_approval_requests_role ON public.face_approval_requests USING btree (assigned_approver_role) WHERE ((status)::text = 'PENDING'::text);


--
-- Name: idx_face_audit_logs_student; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_face_audit_logs_student ON public.face_audit_logs USING btree (student_id);


--
-- Name: idx_face_audit_logs_timestamp; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_face_audit_logs_timestamp ON public.face_audit_logs USING btree ("timestamp" DESC);


--
-- Name: idx_face_change_requests_student; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_face_change_requests_student ON public.face_change_requests USING btree (student_id);


--
-- Name: idx_face_change_requests_not_deleted; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_face_change_requests_not_deleted ON public.face_change_requests USING btree (created_at DESC) WHERE (deleted_at IS NULL);


--
-- Name: idx_face_change_requests_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_face_change_requests_status ON public.face_change_requests USING btree (status);


--
-- Name: idx_face_embeddings_active; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_face_embeddings_active ON public.face_embeddings USING btree (student_id) WHERE (is_active = true);


--
-- Name: idx_face_embeddings_student; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_face_embeddings_student ON public.face_embeddings USING btree (student_id);


--
-- Name: idx_face_logs_created; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_face_logs_created ON public.face_enrollment_logs USING btree (created_at DESC);


--
-- Name: idx_face_logs_student; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_face_logs_student ON public.face_enrollment_logs USING btree (student_id);


--
-- Name: idx_face_logs_target; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_face_logs_target ON public.face_enrollment_logs USING btree (target_student_id);


--
-- Name: idx_impossible_travel_created; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_impossible_travel_created ON public.impossible_travel_events USING btree (created_at DESC);


--
-- Name: idx_impossible_travel_student; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_impossible_travel_student ON public.impossible_travel_events USING btree (student_id);


--
-- Name: idx_impossible_travel_unresolved; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_impossible_travel_unresolved ON public.impossible_travel_events USING btree (student_id) WHERE (resolved = false);


--
-- Name: idx_leave_approval_history_actor; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_leave_approval_history_actor ON public.leave_approval_history USING btree (actor_student_id);


--
-- Name: idx_leave_approval_history_created; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_leave_approval_history_created ON public.leave_approval_history USING btree (created_at DESC);


--
-- Name: idx_leave_approval_history_request; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_leave_approval_history_request ON public.leave_approval_history USING btree (leave_request_id);


--
-- Name: idx_leave_balance_student; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_leave_balance_student ON public.leave_balance USING btree (student_id);


--
-- Name: idx_leave_balance_year; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_leave_balance_year ON public.leave_balance USING btree (year);


--
-- Name: idx_leave_dates; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_leave_dates ON public.leave_requests USING btree (start_date, end_date);


--
-- Name: idx_leave_student; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_leave_student ON public.leave_requests USING btree (student_id);


--
-- Name: idx_leave_student_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_leave_student_status ON public.leave_requests USING btree (student_id, status);


--
-- Name: idx_leave_not_deleted; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_leave_not_deleted ON public.leave_requests USING btree (student_id, status) WHERE (deleted_at IS NULL);


--
-- Name: idx_leave_policy_type; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_leave_policy_type ON public.leave_policy USING btree (leave_type);


--
-- Name: idx_leave_requests_approver; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_leave_requests_approver ON public.leave_requests USING btree (approver_id);


--
-- Name: idx_leave_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_leave_status ON public.leave_requests USING btree (status);


--
-- Name: idx_leave_teacher; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_leave_teacher ON public.leave_requests USING btree (teacher_id);


--
-- Name: idx_loc_time_req_student; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_loc_time_req_student ON public.location_timing_requests USING btree (student_id);


--
-- Name: idx_loc_time_req_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_loc_time_req_status ON public.location_timing_requests USING btree (status);


--
-- Name: idx_login_logs_student; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_login_logs_student ON public.login_logs USING btree (student_id);


--
-- Name: idx_login_logs_not_deleted; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_login_logs_not_deleted ON public.login_logs USING btree ("timestamp" DESC) WHERE (deleted_at IS NULL);


--
-- Name: idx_login_logs_spoof; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_login_logs_spoof ON public.login_logs USING btree (spoof_detected);


--
-- Name: idx_login_logs_success; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_login_logs_success ON public.login_logs USING btree (success);


--
-- Name: idx_login_logs_timestamp; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_login_logs_timestamp ON public.login_logs USING btree ("timestamp");


--
-- Name: idx_notifications_created; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_notifications_created ON public.notifications USING btree (created_at);


--
-- Name: idx_notifications_student; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_notifications_student ON public.notifications USING btree (student_id);


--
-- Name: idx_notifications_student_created; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_notifications_student_created ON public.notifications USING btree (student_id, created_at DESC);


--
-- Name: idx_notifications_read; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_notifications_read ON public.notifications USING btree (is_read);


--
-- Name: idx_notifications_unread; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_notifications_unread ON public.notifications USING btree (student_id) WHERE (is_read = false);


--
-- Name: idx_recovery_audit_action; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_recovery_audit_action ON public.account_recovery_audit_log USING btree (action);


--
-- Name: idx_recovery_audit_actor; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_recovery_audit_actor ON public.account_recovery_audit_log USING btree (actor_id);


--
-- Name: idx_recovery_audit_recovery; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_recovery_audit_recovery ON public.account_recovery_audit_log USING btree (recovery_id);


--
-- Name: idx_recovery_student; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_recovery_student ON public.account_recovery_requests USING btree (student_id);


--
-- Name: idx_recovery_expires; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_recovery_expires ON public.account_recovery_requests USING btree (expires_at);


--
-- Name: idx_recovery_requested_by; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_recovery_requested_by ON public.account_recovery_requests USING btree (requested_by);


--
-- Name: idx_recovery_reviewed_by; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_recovery_reviewed_by ON public.account_recovery_requests USING btree (reviewed_by);


--
-- Name: idx_recovery_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_recovery_status ON public.account_recovery_requests USING btree (status);


--
-- Name: idx_refresh_tokens_active; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_refresh_tokens_active ON public.refresh_tokens USING btree (student_id, expires_at) WHERE (revoked_at IS NULL);


--
-- Name: idx_refresh_tokens_student; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_refresh_tokens_student ON public.refresh_tokens USING btree (student_id);


--
-- Name: idx_refresh_tokens_expires; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_refresh_tokens_expires ON public.refresh_tokens USING btree (expires_at);


--
-- Name: idx_refresh_tokens_family; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_refresh_tokens_family ON public.refresh_tokens USING btree (token_family);


--
-- Name: idx_role_assignments_active; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_role_assignments_active ON public.role_assignments USING btree (is_active);


--
-- Name: idx_role_assignments_student; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_role_assignments_student ON public.role_assignments USING btree (student_id);


--
-- Name: idx_role_assignments_role; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_role_assignments_role ON public.role_assignments USING btree (role);


--
-- Name: idx_role_permissions_role; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_role_permissions_role ON public.role_permissions USING btree (role);


--
-- Name: idx_security_events_student; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_security_events_student ON public.security_events USING btree (student_id);


--
-- Name: idx_security_events_not_deleted; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_security_events_not_deleted ON public.security_events USING btree ("timestamp" DESC) WHERE (deleted_at IS NULL);


--
-- Name: idx_security_events_severity; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_security_events_severity ON public.security_events USING btree (severity);


--
-- Name: idx_security_events_timestamp; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_security_events_timestamp ON public.security_events USING btree ("timestamp");


--
-- Name: idx_security_events_type; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_security_events_type ON public.security_events USING btree (event_type);


--
-- Name: idx_security_events_type_time; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_security_events_type_time ON public.security_events USING btree (event_type, "timestamp" DESC);


--
-- Name: idx_teacher_assignments_active; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_teacher_assignments_active ON public.teacher_assignments USING btree (is_active);


--
-- Name: idx_teacher_assignments_student; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_teacher_assignments_student ON public.teacher_assignments USING btree (student_id);


--
-- Name: idx_teacher_assignments_teacher; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_teacher_assignments_teacher ON public.teacher_assignments USING btree (teacher_id);


--
-- Name: idx_system_logs_level; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_system_logs_level ON public.system_logs USING btree (log_level);


--
-- Name: idx_system_logs_service; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_system_logs_service ON public.system_logs USING btree (service_name);


--
-- Name: idx_system_logs_timestamp; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_system_logs_timestamp ON public.system_logs USING btree ("timestamp");


--
-- Name: idx_team_config_active; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_team_config_active ON public.team_config USING btree (is_active);


--
-- Name: idx_team_config_department; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_team_config_department ON public.team_config USING btree (department);


--
-- Name: idx_team_config_team_lead; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_team_config_team_lead ON public.team_config USING btree (team_lead_id);


--
-- Name: idx_team_members_active; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_team_members_active ON public.team_members USING btree (is_active);


--
-- Name: idx_team_members_student; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_team_members_student ON public.team_members USING btree (student_id);


--
-- Name: idx_team_members_team; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_team_members_team ON public.team_members USING btree (team_id);


--
-- Name: idx_student_reports_date; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_student_reports_date ON public.student_reports USING btree (report_date);


--
-- Name: idx_student_reports_student; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_student_reports_student ON public.student_reports USING btree (student_id);


--
-- Name: idx_student_reports_not_deleted; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_student_reports_not_deleted ON public.student_reports USING btree (student_id, report_date DESC) WHERE (deleted_at IS NULL);


--
-- Name: idx_student_reports_teacher; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_student_reports_teacher ON public.student_reports USING btree (teacher_id);


--
-- Name: idx_work_timings_department; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_work_timings_department ON public.work_timings USING btree (department);


--
-- Name: idx_work_timings_student; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_work_timings_student ON public.work_timings USING btree (student_id);


--
-- Name: uix_attendance_idempotency; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX uix_attendance_idempotency ON public.student_attendance USING btree (idempotency_key) WHERE (idempotency_key IS NOT NULL);


--
-- Name: uix_attendance_one_open_per_student_per_day; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX uix_attendance_one_open_per_student_per_day ON public.student_attendance USING btree (student_id, ((check_in_time)::date)) WHERE (check_out_time IS NULL);


--
-- Name: admin_configuration trg_sync_admin_config_to_administrators; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_sync_admin_config_to_administrators AFTER INSERT OR UPDATE ON public.admin_configuration FOR EACH ROW EXECUTE FUNCTION public.sync_admin_config_to_administrators();


--
-- Name: administrators trg_sync_administrators_to_legacy; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_sync_administrators_to_legacy AFTER INSERT OR UPDATE ON public.administrators FOR EACH ROW EXECUTE FUNCTION public.sync_administrators_to_legacy();


--
-- Name: audit_logs trg_sync_audit_logs_compliance; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_sync_audit_logs_compliance BEFORE INSERT OR UPDATE ON public.audit_logs FOR EACH ROW EXECUTE FUNCTION public.sync_audit_logs_compliance();


--
-- Name: student_relationships trg_sync_student_relationship; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_sync_student_relationship AFTER INSERT OR UPDATE ON public.student_relationships FOR EACH ROW EXECUTE FUNCTION public.sync_student_relationship();


--
-- Name: students trg_sync_students_to_relationship; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_sync_students_to_relationship AFTER INSERT OR UPDATE OF teacher_id ON public.students FOR EACH ROW EXECUTE FUNCTION public.sync_students_to_relationship();


--
-- Name: leave_requests trg_sync_leave_approved_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_sync_leave_approved_at BEFORE INSERT OR UPDATE ON public.leave_requests FOR EACH ROW EXECUTE FUNCTION public.sync_leave_approved_at();


--
-- Name: notifications trg_sync_notifications_compliance; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_sync_notifications_compliance BEFORE INSERT OR UPDATE ON public.notifications FOR EACH ROW EXECUTE FUNCTION public.sync_notifications_compliance();


--
-- Name: account_recovery_requests update_account_recovery_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER update_account_recovery_updated_at BEFORE UPDATE ON public.account_recovery_requests FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: student_attendance update_attendance_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER update_attendance_updated_at BEFORE UPDATE ON public.student_attendance FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: backup_configurations update_backup_configurations_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER update_backup_configurations_updated_at BEFORE UPDATE ON public.backup_configurations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: department_config update_department_config_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER update_department_config_updated_at BEFORE UPDATE ON public.department_config FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: students update_students_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER update_students_updated_at BEFORE UPDATE ON public.students FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: leave_policy update_leave_policy_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER update_leave_policy_updated_at BEFORE UPDATE ON public.leave_policy FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: leave_requests update_leave_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER update_leave_updated_at BEFORE UPDATE ON public.leave_requests FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: office_locations update_office_locations_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER update_office_locations_updated_at BEFORE UPDATE ON public.office_locations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: team_config update_team_config_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER update_team_config_updated_at BEFORE UPDATE ON public.team_config FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: team_members update_team_members_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER update_team_members_updated_at BEFORE UPDATE ON public.team_members FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: student_reports update_student_reports_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER update_student_reports_updated_at BEFORE UPDATE ON public.student_reports FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: work_timings update_work_timings_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER update_work_timings_updated_at BEFORE UPDATE ON public.work_timings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: account_recovery_audit_log account_recovery_audit_log_actor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.account_recovery_audit_log
    ADD CONSTRAINT account_recovery_audit_log_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES public.students(id);


--
-- Name: account_recovery_audit_log account_recovery_audit_log_recovery_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.account_recovery_audit_log
    ADD CONSTRAINT account_recovery_audit_log_recovery_id_fkey FOREIGN KEY (recovery_id) REFERENCES public.account_recovery_requests(id) ON DELETE RESTRICT;


--
-- Name: account_recovery_requests account_recovery_requests_completed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.account_recovery_requests
    ADD CONSTRAINT account_recovery_requests_completed_by_fkey FOREIGN KEY (completed_by) REFERENCES public.students(id);


--
-- Name: account_recovery_requests account_recovery_requests_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.account_recovery_requests
    ADD CONSTRAINT account_recovery_requests_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE RESTRICT;


--
-- Name: account_recovery_requests account_recovery_requests_requested_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.account_recovery_requests
    ADD CONSTRAINT account_recovery_requests_requested_by_fkey FOREIGN KEY (requested_by) REFERENCES public.students(id);


--
-- Name: account_recovery_requests account_recovery_requests_reviewed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.account_recovery_requests
    ADD CONSTRAINT account_recovery_requests_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES public.students(id);


--
-- Name: admin_configuration admin_configuration_admin_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.admin_configuration
    ADD CONSTRAINT admin_configuration_admin_student_id_fkey FOREIGN KEY (admin_student_id) REFERENCES public.students(id) ON DELETE RESTRICT;


--
-- Name: student_attendance student_attendance_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.student_attendance
    ADD CONSTRAINT student_attendance_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id);


--
-- Name: audit_logs audit_logs_actor_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_actor_student_id_fkey FOREIGN KEY (actor_student_id) REFERENCES public.students(id) ON DELETE SET NULL;


--
-- Name: audit_logs audit_logs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.students(id) ON DELETE SET NULL;


--
-- Name: department_config department_config_department_head_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.department_config
    ADD CONSTRAINT department_config_department_head_id_fkey FOREIGN KEY (department_head_id) REFERENCES public.students(id);


--
-- Name: device_fingerprints device_fingerprints_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.device_fingerprints
    ADD CONSTRAINT device_fingerprints_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE;


--
-- Name: student_locations student_locations_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.student_locations
    ADD CONSTRAINT student_locations_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE;


--
-- Name: student_login_locations student_login_locations_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.student_login_locations
    ADD CONSTRAINT student_login_locations_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE;


--
-- Name: student_relationships student_relationships_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.student_relationships
    ADD CONSTRAINT student_relationships_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE;


--
-- Name: student_relationships student_relationships_teacher_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.student_relationships
    ADD CONSTRAINT student_relationships_teacher_id_fkey FOREIGN KEY (teacher_id) REFERENCES public.students(id) ON DELETE CASCADE;


--
-- Name: students students_deleted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.students
    ADD CONSTRAINT students_deleted_by_fkey FOREIGN KEY (deleted_by) REFERENCES public.students(id);


--
-- Name: students students_face_enrolled_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.students
    ADD CONSTRAINT students_face_enrolled_by_fkey FOREIGN KEY (face_enrolled_by) REFERENCES public.students(id) ON DELETE SET NULL;


--
-- Name: students students_teacher_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.students
    ADD CONSTRAINT students_teacher_id_fkey FOREIGN KEY (teacher_id) REFERENCES public.students(id);


--
-- Name: face_approval_history face_approval_history_actioned_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.face_approval_history
    ADD CONSTRAINT face_approval_history_actioned_by_fkey FOREIGN KEY (actioned_by) REFERENCES public.students(id) ON DELETE RESTRICT;


--
-- Name: face_approval_history face_approval_history_request_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.face_approval_history
    ADD CONSTRAINT face_approval_history_request_id_fkey FOREIGN KEY (request_id) REFERENCES public.face_change_requests(id) ON DELETE CASCADE;


--
-- Name: face_approval_requests face_approval_requests_request_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.face_approval_requests
    ADD CONSTRAINT face_approval_requests_request_id_fkey FOREIGN KEY (request_id) REFERENCES public.face_change_requests(id) ON DELETE CASCADE;


--
-- Name: face_audit_logs face_audit_logs_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.face_audit_logs
    ADD CONSTRAINT face_audit_logs_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE;


--
-- Name: face_audit_logs face_audit_logs_performed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.face_audit_logs
    ADD CONSTRAINT face_audit_logs_performed_by_fkey FOREIGN KEY (performed_by) REFERENCES public.students(id) ON DELETE RESTRICT;


--
-- Name: face_change_requests face_change_requests_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.face_change_requests
    ADD CONSTRAINT face_change_requests_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE;


--
-- Name: face_change_requests face_change_requests_requested_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.face_change_requests
    ADD CONSTRAINT face_change_requests_requested_by_fkey FOREIGN KEY (requested_by) REFERENCES public.students(id) ON DELETE CASCADE;


--
-- Name: face_embeddings face_embeddings_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.face_embeddings
    ADD CONSTRAINT face_embeddings_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE RESTRICT;


--
-- Name: face_embeddings face_embeddings_enrolled_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.face_embeddings
    ADD CONSTRAINT face_embeddings_enrolled_by_fkey FOREIGN KEY (enrolled_by) REFERENCES public.students(id) ON DELETE SET NULL;


--
-- Name: face_enrollment_logs face_enrollment_logs_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.face_enrollment_logs
    ADD CONSTRAINT face_enrollment_logs_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE SET NULL;


--
-- Name: face_enrollment_logs face_enrollment_logs_target_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.face_enrollment_logs
    ADD CONSTRAINT face_enrollment_logs_target_student_id_fkey FOREIGN KEY (target_student_id) REFERENCES public.students(id) ON DELETE SET NULL;


--
-- Name: face_update_requests face_update_requests_approver_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.face_update_requests
    ADD CONSTRAINT face_update_requests_approver_id_fkey FOREIGN KEY (approver_id) REFERENCES public.students(id) ON DELETE SET NULL;


--
-- Name: face_update_requests face_update_requests_requester_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.face_update_requests
    ADD CONSTRAINT face_update_requests_requester_id_fkey FOREIGN KEY (requester_id) REFERENCES public.students(id) ON DELETE CASCADE;


--
-- Name: impossible_travel_events impossible_travel_events_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.impossible_travel_events
    ADD CONSTRAINT impossible_travel_events_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE SET NULL;


--
-- Name: impossible_travel_events impossible_travel_events_resolved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.impossible_travel_events
    ADD CONSTRAINT impossible_travel_events_resolved_by_fkey FOREIGN KEY (resolved_by) REFERENCES public.students(id) ON DELETE SET NULL;


--
-- Name: leave_approval_history leave_approval_history_actor_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.leave_approval_history
    ADD CONSTRAINT leave_approval_history_actor_student_id_fkey FOREIGN KEY (actor_student_id) REFERENCES public.students(id) ON DELETE SET NULL;


--
-- Name: leave_approval_history leave_approval_history_leave_request_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.leave_approval_history
    ADD CONSTRAINT leave_approval_history_leave_request_id_fkey FOREIGN KEY (leave_request_id) REFERENCES public.leave_requests(id) ON DELETE RESTRICT;


--
-- Name: leave_balance leave_balance_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.leave_balance
    ADD CONSTRAINT leave_balance_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE;


--
-- Name: leave_balance leave_balance_leave_type_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.leave_balance
    ADD CONSTRAINT leave_balance_leave_type_fkey FOREIGN KEY (leave_type) REFERENCES public.leave_policy(leave_type);


--
-- Name: leave_requests leave_requests_approved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.leave_requests
    ADD CONSTRAINT leave_requests_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES public.students(id);


--
-- Name: leave_requests leave_requests_approver_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.leave_requests
    ADD CONSTRAINT leave_requests_approver_id_fkey FOREIGN KEY (approver_id) REFERENCES public.students(id) ON DELETE SET NULL;


--
-- Name: leave_requests leave_requests_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.leave_requests
    ADD CONSTRAINT leave_requests_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id);


--
-- Name: leave_requests leave_requests_teacher_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.leave_requests
    ADD CONSTRAINT leave_requests_teacher_id_fkey FOREIGN KEY (teacher_id) REFERENCES public.students(id);


--
-- Name: location_timing_requests location_timing_requests_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.location_timing_requests
    ADD CONSTRAINT location_timing_requests_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE;


--
-- Name: login_logs login_logs_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.login_logs
    ADD CONSTRAINT login_logs_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id);


--
-- Name: notifications notifications_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE;


--
-- Name: notifications notifications_recipient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_recipient_id_fkey FOREIGN KEY (recipient_id) REFERENCES public.students(id) ON DELETE CASCADE;


--
-- Name: notifications notifications_sender_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES public.students(id) ON DELETE SET NULL;


--
-- Name: office_locations office_locations_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.office_locations
    ADD CONSTRAINT office_locations_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.students(id) ON DELETE SET NULL;


--
-- Name: password_reset_requests password_reset_requests_approver_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.password_reset_requests
    ADD CONSTRAINT password_reset_requests_approver_id_fkey FOREIGN KEY (approver_id) REFERENCES public.students(id) ON DELETE SET NULL;


--
-- Name: password_reset_requests password_reset_requests_requester_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.password_reset_requests
    ADD CONSTRAINT password_reset_requests_requester_id_fkey FOREIGN KEY (requester_id) REFERENCES public.students(id) ON DELETE CASCADE;


--
-- Name: refresh_tokens refresh_tokens_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.refresh_tokens
    ADD CONSTRAINT refresh_tokens_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE;


--
-- Name: role_assignments role_assignments_assigned_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.role_assignments
    ADD CONSTRAINT role_assignments_assigned_by_fkey FOREIGN KEY (assigned_by) REFERENCES public.students(id);


--
-- Name: role_assignments role_assignments_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.role_assignments
    ADD CONSTRAINT role_assignments_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE;


--
-- Name: security_events security_events_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.security_events
    ADD CONSTRAINT security_events_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id);


--
-- Name: teacher_assignments teacher_assignments_assigned_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.teacher_assignments
    ADD CONSTRAINT teacher_assignments_assigned_by_fkey FOREIGN KEY (assigned_by) REFERENCES public.students(id);


--
-- Name: teacher_assignments teacher_assignments_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.teacher_assignments
    ADD CONSTRAINT teacher_assignments_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE;


--
-- Name: teacher_assignments teacher_assignments_teacher_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.teacher_assignments
    ADD CONSTRAINT teacher_assignments_teacher_id_fkey FOREIGN KEY (teacher_id) REFERENCES public.students(id) ON DELETE CASCADE;


--
-- Name: teacher_assignments teacher_assignments_unassigned_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.teacher_assignments
    ADD CONSTRAINT teacher_assignments_unassigned_by_fkey FOREIGN KEY (unassigned_by) REFERENCES public.students(id) ON DELETE SET NULL;


--
-- Name: team_config team_config_team_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.team_config
    ADD CONSTRAINT team_config_team_lead_id_fkey FOREIGN KEY (team_lead_id) REFERENCES public.students(id) ON DELETE SET NULL;


--
-- Name: team_members team_members_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.team_members
    ADD CONSTRAINT team_members_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE;


--
-- Name: team_members team_members_team_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.team_members
    ADD CONSTRAINT team_members_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.team_config(id) ON DELETE CASCADE;


--
-- Name: student_reports student_reports_approved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.student_reports
    ADD CONSTRAINT student_reports_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES public.students(id);


--
-- Name: student_reports student_reports_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.student_reports
    ADD CONSTRAINT student_reports_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id);


--
-- Name: student_reports student_reports_teacher_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.student_reports
    ADD CONSTRAINT student_reports_teacher_id_fkey FOREIGN KEY (teacher_id) REFERENCES public.students(id);


--
-- Name: work_timings work_timings_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.work_timings
    ADD CONSTRAINT work_timings_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

\unrestrict RD43H0DfK7MI9zbxqcKGoMLkusGal2KEnUJGDEJ9XgwWX3FrZVl0B2YdTvhbY0T


-- Restore search_path to public so that trigger functions and inserts resolve tables correctly.
SET search_path = public, pg_catalog;

-- Seeding default data for Student Management System
INSERT INTO office_locations (name, latitude, longitude, radius_meters) VALUES
('Main Office', 40.7128, -74.0060, 100)
ON CONFLICT DO NOTHING;

INSERT INTO backup_configurations (schedule_type, retention_days) VALUES
('daily', 30)
ON CONFLICT DO NOTHING;

INSERT INTO students (
  student_id,
  first_name,
  last_name,
  email,
  phone_number,
  department,
  position,
  role,
  hire_date,
  is_active,
  password_hash,
  password_changed_at,
  failed_login_count,
  locked_until,
  metadata,
  created_at,
  updated_at
) VALUES (
  'admin',
  'System',
  'Administrator',
  'admin@attendance-system.local',
  '+1-555-0100',
  'Administration',
  'System Administrator',
  'admin',
  CURRENT_DATE,
  TRUE,
  '$2a$10$OXc.LHem9gEyDNMKjyH7CepTNesYPmZ62HPF8ISZheTGkk2YqwPgm',
  CURRENT_TIMESTAMP,
  0,
  NULL,
  '{"default_admin": true, "all_feature_access": true}'::jsonb,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT (student_id) DO NOTHING;
