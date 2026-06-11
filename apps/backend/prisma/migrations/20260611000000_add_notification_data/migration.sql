-- Add nullable JSON data column to notifications for action metadata
ALTER TABLE "notifications" ADD COLUMN "data" JSONB;
