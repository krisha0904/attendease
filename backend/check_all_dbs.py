import sqlite3

for p in [r'c:\Users\krish\Downloads\attendease\attendease\attendance.db', r'c:\Users\krish\Downloads\attendease\attendease\backend\attendance.db']:
    print(f"=== {p} ===")
    conn = sqlite3.connect(p)
    cur = conn.cursor()
    cur.execute("SELECT name FROM sqlite_master WHERE type='table'")
    print("Tables:", cur.fetchall())
    try:
        cur.execute("PRAGMA table_info(users)")
        print("users columns:", [r[1] for r in cur.fetchall()])
        cur.execute("SELECT * FROM users")
        print("users rows:", cur.fetchall())
    except Exception as e:
        print("Error:", e)
    conn.close()
