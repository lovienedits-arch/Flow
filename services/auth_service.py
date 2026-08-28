"""
FLOW Auth Service — Original username/password system for FLOW
Secure: unique username, Werkzeug hashing, token-based session, SQLite persistence
"""
import os, sqlite3, secrets, re, time
from werkzeug.security import generate_password_hash, check_password_hash

DB_PATH = os.path.join(os.path.dirname(__file__), '..', 'flow.db')
DB_PATH = os.path.abspath(DB_PATH)

USERNAME_RE = re.compile(r'^[a-zA-Z0-9_]{3,20}$')  # 3-20 alnum underscore

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db()
    cur = conn.cursor()
    cur.execute('''CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        display_name TEXT,
        created_at INTEGER
    )''')
    cur.execute('''CREATE TABLE IF NOT EXISTS sessions (
        token TEXT PRIMARY KEY,
        user_id INTEGER,
        created_at INTEGER,
        FOREIGN KEY(user_id) REFERENCES users(id)
    )''')
    cur.execute('''CREATE TABLE IF NOT EXISTS track_requests (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sender_id INTEGER,
        receiver_id INTEGER,
        status TEXT NOT NULL, -- pending, accepted, declined
        created_at INTEGER,
        UNIQUE(sender_id, receiver_id)
    )''')
    cur.execute('''CREATE TABLE IF NOT EXISTS live_locations (
        user_id INTEGER PRIMARY KEY,
        lat REAL,
        lon REAL,
        updated_at INTEGER,
        accuracy REAL,
        FOREIGN KEY(user_id) REFERENCES users(id)
    )''')
    cur.execute('''CREATE TABLE IF NOT EXISTS saved_places (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        label TEXT,
        name TEXT,
        lat REAL,
        lon REAL,
        created_at INTEGER,
        FOREIGN KEY(user_id) REFERENCES users(id)
    )''')
    conn.commit()
    conn.close()

init_db()

def validate_username(username):
    if not username or not USERNAME_RE.match(username):
        return False, "Username must be 3-20 characters, letters, numbers or underscore only"
    return True, ""

def register_user(username, password, display_name=None):
    ok, msg = validate_username(username)
    if not ok:
        return None, msg
    if not password or len(password) < 6:
        return None, "Password must be at least 6 characters"
    if len(password) > 128:
        return None, "Password too long"
    username = username.strip().lower()
    conn = get_db()
    cur = conn.cursor()
    existing = cur.execute("SELECT id FROM users WHERE username=?", (username,)).fetchone()
    if existing:
        conn.close()
        return None, "Username already taken"
    phash = generate_password_hash(password)
    cur.execute("INSERT INTO users (username,password_hash,display_name,created_at) VALUES (?,?,?,?)",
                (username, phash, display_name or username, int(time.time())))
    conn.commit()
    uid = cur.lastrowid
    conn.close()
    token = create_session(uid)
    return {"user_id": uid, "username": username, "token": token, "display_name": display_name or username}, None

def login_user(username, password):
    if not username or not password:
        return None, "Missing credentials"
    username = username.strip().lower()
    conn = get_db()
    cur = conn.cursor()
    row = cur.execute("SELECT * FROM users WHERE username=?", (username,)).fetchone()
    if not row:
        conn.close()
        return None, "Invalid username or password"
    if not check_password_hash(row["password_hash"], password):
        conn.close()
        return None, "Invalid username or password"
    conn.close()
    token = create_session(row["id"])
    return {"user_id": row["id"], "username": row["username"], "token": token, "display_name": row["display_name"]}, None

def create_session(user_id):
    token = secrets.token_urlsafe(32)
    conn = get_db()
    cur = conn.cursor()
    # Remove old sessions for same user partially to avoid bloat (keep last 3)
    cur.execute("DELETE FROM sessions WHERE user_id=? AND token NOT IN (SELECT token FROM sessions WHERE user_id=? ORDER BY created_at DESC LIMIT 3)", (user_id, user_id))
    cur.execute("INSERT INTO sessions (token,user_id,created_at) VALUES (?,?,?)", (token, user_id, int(time.time())))
    conn.commit()
    conn.close()
    return token

def get_user_by_token(token):
    if not token:
        return None
    conn = get_db()
    cur = conn.cursor()
    row = cur.execute("SELECT u.* FROM sessions s JOIN users u ON s.user_id=u.id WHERE s.token=?", (token,)).fetchone()
    conn.close()
    if row:
        return dict(row)
    return None

def get_user_by_username(username):
    username = username.strip().lower()
    conn = get_db()
    cur = conn.cursor()
    row = cur.execute("SELECT * FROM users WHERE username=?", (username,)).fetchone()
    conn.close()
    return dict(row) if row else None

def get_user_by_id(uid):
    conn = get_db()
    cur = conn.cursor()
    row = cur.execute("SELECT * FROM users WHERE id=?", (uid,)).fetchone()
    conn.close()
    return dict(row) if row else None

def logout_token(token):
    conn = get_db()
    cur = conn.cursor()
    cur.execute("DELETE FROM sessions WHERE token=?", (token,))
    conn.commit()
    conn.close()

def search_users(query, exclude_id=None, limit=8):
    query = f"%{query.strip().lower()}%"
    conn = get_db()
    cur = conn.cursor()
    if exclude_id:
        rows = cur.execute("SELECT id,username,display_name FROM users WHERE username LIKE ? AND id != ? LIMIT ?", (query, exclude_id, limit)).fetchall()
    else:
        rows = cur.execute("SELECT id,username,display_name FROM users WHERE username LIKE ? LIMIT ?", (query, limit)).fetchall()
    conn.close()
    return [dict(r) for r in rows]
