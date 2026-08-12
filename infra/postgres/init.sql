-- Runs once on a fresh Postgres volume. Creates the vector extension (optional,
-- used only when semantic similarity features are enabled in later phases).
CREATE EXTENSION IF NOT EXISTS vector;
