-- ============================================================
-- Todoer: task data schema (F-01)
-- Tables: tasks, task_tags, user_settings
-- ============================================================

-- ------------------------------------------------------------
-- 1. Shared trigger functions
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION normalize_tag_name()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.tag_name = lower(NEW.tag_name);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION enforce_task_tags_limit()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF (SELECT COUNT(*) FROM task_tags WHERE task_id = NEW.task_id) >= 5 THEN
    RAISE EXCEPTION 'Task cannot have more than 5 tags';
  END IF;
  RETURN NEW;
END;
$$;

-- ------------------------------------------------------------
-- 2. Enum
-- ------------------------------------------------------------

CREATE TYPE task_status AS ENUM ('pending', 'complete', 'dismissed');

-- ------------------------------------------------------------
-- 3. tasks
-- ------------------------------------------------------------

CREATE TABLE tasks (
  id                    uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id               uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name                  text        NOT NULL CHECK (char_length(name) > 0),
  target_date           date        NOT NULL,
  priority              smallint    NOT NULL CHECK (priority BETWEEN 1 AND 3),
  time_estimate_minutes integer     NOT NULL CHECK (time_estimate_minutes > 0),
  status                task_status NOT NULL DEFAULT 'pending',
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

CREATE INDEX tasks_user_id_idx   ON tasks (user_id);
CREATE INDEX tasks_user_date_idx ON tasks (user_id, target_date);

CREATE TRIGGER tasks_set_updated_at
  BEFORE UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE POLICY "authenticated_select_tasks"
  ON tasks FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "authenticated_insert_tasks"
  ON tasks FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "authenticated_update_tasks"
  ON tasks FOR UPDATE TO authenticated
  USING  (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "authenticated_delete_tasks"
  ON tasks FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- ------------------------------------------------------------
-- 4. task_tags
-- ------------------------------------------------------------

CREATE TABLE task_tags (
  task_id  uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  tag_name text NOT NULL CHECK (char_length(tag_name) BETWEEN 1 AND 50),
  PRIMARY KEY (task_id, tag_name)
);

ALTER TABLE task_tags ENABLE ROW LEVEL SECURITY;

-- enforce_limit fires before normalize so the count operates on existing lowercase tags
CREATE TRIGGER task_tags_enforce_limit
  BEFORE INSERT ON task_tags
  FOR EACH ROW EXECUTE FUNCTION enforce_task_tags_limit();

CREATE TRIGGER task_tags_normalize_name
  BEFORE INSERT OR UPDATE ON task_tags
  FOR EACH ROW EXECUTE FUNCTION normalize_tag_name();

CREATE POLICY "authenticated_select_task_tags"
  ON task_tags FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM tasks
    WHERE tasks.id = task_tags.task_id
      AND tasks.user_id = auth.uid()
  ));

CREATE POLICY "authenticated_insert_task_tags"
  ON task_tags FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM tasks
    WHERE tasks.id = task_tags.task_id
      AND tasks.user_id = auth.uid()
  ));

CREATE POLICY "authenticated_update_task_tags"
  ON task_tags FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM tasks
    WHERE tasks.id = task_tags.task_id
      AND tasks.user_id = auth.uid()
  ));

CREATE POLICY "authenticated_delete_task_tags"
  ON task_tags FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM tasks
    WHERE tasks.id = task_tags.task_id
      AND tasks.user_id = auth.uid()
  ));

-- ------------------------------------------------------------
-- 5. user_settings
-- ------------------------------------------------------------

CREATE TABLE user_settings (
  user_id         uuid    NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  available_hours numeric NOT NULL DEFAULT 8 CHECK (available_hours > 0 AND available_hours <= 24),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER user_settings_set_updated_at
  BEFORE UPDATE ON user_settings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE POLICY "authenticated_select_user_settings"
  ON user_settings FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "authenticated_insert_user_settings"
  ON user_settings FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "authenticated_update_user_settings"
  ON user_settings FOR UPDATE TO authenticated
  USING  (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "authenticated_delete_user_settings"
  ON user_settings FOR DELETE TO authenticated
  USING (user_id = auth.uid());
