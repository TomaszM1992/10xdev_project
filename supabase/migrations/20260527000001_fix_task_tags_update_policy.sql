-- Fix authenticated_update_task_tags: add missing WITH CHECK clause.
-- PostgreSQL's fallback (USING doubles as WITH CHECK when omitted) makes
-- this functionally equivalent, but explicit is consistent with tasks and
-- user_settings UPDATE policies.
DROP POLICY "authenticated_update_task_tags" ON task_tags;

CREATE POLICY "authenticated_update_task_tags"
  ON task_tags FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM tasks
    WHERE tasks.id = task_tags.task_id
      AND tasks.user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM tasks
    WHERE tasks.id = task_tags.task_id
      AND tasks.user_id = auth.uid()
  ));
