-- Share links (run once against the app's Postgres database).
CREATE TABLE shares (
  id text PRIMARY KEY,
  title text NOT NULL,
  slide_count integer NOT NULL CHECK (slide_count BETWEEN 1 AND 30),
  aspect real NOT NULL CHECK (aspect > 0.2 AND aspect < 3),
  owner_token_hash text NOT NULL,
  status text NOT NULL DEFAULT 'uploading' CHECK (status IN ('uploading', 'ready', 'deleted')),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);
CREATE INDEX shares_expires_at_idx ON shares (expires_at) WHERE status <> 'deleted';
CREATE TABLE share_comments (
  id serial PRIMARY KEY,
  share_id text NOT NULL REFERENCES shares(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 40),
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 1000),
  slide integer,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX share_comments_share_idx ON share_comments (share_id, created_at);
CREATE TABLE share_limits (
  client_hash text NOT NULL,
  day date NOT NULL,
  made integer NOT NULL DEFAULT 0,
  PRIMARY KEY (client_hash, day)
);
