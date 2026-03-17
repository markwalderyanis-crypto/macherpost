CREATE TABLE IF NOT EXISTS users (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    email           TEXT UNIQUE NOT NULL,
    name            TEXT,
    password_hash   TEXT,
    google_id       TEXT UNIQUE,
    apple_id        TEXT UNIQUE,
    role            TEXT NOT NULL DEFAULT 'user',
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS products (
    id                   INTEGER PRIMARY KEY AUTOINCREMENT,
    slug                 TEXT UNIQUE NOT NULL,
    type                 TEXT NOT NULL,
    name                 TEXT NOT NULL,
    price_monthly        INTEGER NOT NULL,
    price_yearly         INTEGER NOT NULL,
    stripe_price_monthly TEXT,
    stripe_price_yearly  TEXT,
    themes               TEXT
);

CREATE TABLE IF NOT EXISTS subscriptions (
    id                      INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id                 INTEGER NOT NULL REFERENCES users(id),
    product_slug            TEXT NOT NULL,
    stripe_subscription_id  TEXT UNIQUE,
    stripe_customer_id      TEXT,
    billing_interval        TEXT NOT NULL DEFAULT 'monthly',
    status                  TEXT NOT NULL DEFAULT 'active',
    current_period_end      TEXT,
    created_at              TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON subscriptions(user_id);

CREATE TABLE IF NOT EXISTS pdfs (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    theme_slug      TEXT NOT NULL,
    title           TEXT NOT NULL,
    description     TEXT,
    filename        TEXT NOT NULL,
    publish_date    TEXT NOT NULL,
    status          TEXT NOT NULL DEFAULT 'draft',
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_pdfs_theme ON pdfs(theme_slug);
CREATE INDEX IF NOT EXISTS idx_pdfs_status_date ON pdfs(status, publish_date);

CREATE TABLE IF NOT EXISTS comments (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    pdf_id      INTEGER NOT NULL REFERENCES pdfs(id) ON DELETE CASCADE,
    user_id     INTEGER NOT NULL REFERENCES users(id),
    content     TEXT NOT NULL,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_comments_pdf ON comments(pdf_id);
